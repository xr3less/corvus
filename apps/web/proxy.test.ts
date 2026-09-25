/* Tests for the optimistic /dashboard cookie gate (apps/web/proxy.ts).
 *
 * The gate's whole job is two behaviours, so both are exercised on the real
 * exported function with real NextRequest objects:
 *   1. no cookie  -> a redirect to the login route
 *   2. any cookie -> a pass-through, byte-identical to NextResponse.next()
 *
 * The cookie NAME is asserted against the constant the auth code itself
 * exports (`SESSION_COOKIE` from lib/auth/session.ts). proxy.ts cannot import
 * that module (it would drag `pg` into the proxy bundle), so it repeats the
 * string; this assertion is what keeps the two from drifting apart — a rename
 * on either side fails here instead of silently opening the gate.
 *
 * Matcher coverage is asserted through Next.js's own matcher implementation
 * (unstable_doesMiddlewareMatch, the documented unit-testing entry point) rather
 * than a hand-rolled path comparison, so "does /dashboard/bots match" is
 * answered by the same code the build uses — including the transport forms
 * (/_next/data/…/dashboard.json, /dashboard.rsc) the build adds for client-side
 * navigation.
 *
 * That entry point needs one thing set up first, and the reason is worth
 * stating: it transitively imports dist/server/app-render/
 * work-async-storage-instance.js, whose createAsyncLocalStorage() checks
 * `globalThis.AsyncLocalStorage` and, when absent, falls back to a Fake
 * implementation that THROWS on use (dist/server/app-render/async-local-
 * storage.js). Next.js's own server boot installs the real one before anything
 * else loads (dist/server/node-environment-baseline.js: "expose
 * AsyncLocalStorage on global for react usage if it isn't already provided by
 * the environment"). A bare test process has not booted a Next server, so this
 * file performs the same one-line installation, then imports the entry point
 * DYNAMICALLY — a static import would be hoisted above the assignment and fail.
 */
import { describe, expect, it } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';
import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { config, proxy } from './proxy';

const globalWithAsyncLocalStorage = globalThis as { AsyncLocalStorage?: unknown };
if (typeof globalWithAsyncLocalStorage.AsyncLocalStorage !== 'function') {
  globalWithAsyncLocalStorage.AsyncLocalStorage = AsyncLocalStorage;
}

const { unstable_doesMiddlewareMatch } = await import('next/experimental/testing/server');

const ORIGIN = 'http://localhost:3000';

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`, cookie === undefined ? {} : { headers: { cookie } });
}

/* Would the proxy run for this pathname? Answered by Next.js's own matcher,
   fed the exact config this file exports. */
function matches(pathname: string): boolean {
  return unstable_doesMiddlewareMatch({ config, url: pathname });
}

function locationOf(response: NextResponse): string | null {
  return response.headers.get('location');
}

describe('proxy cookie gate', () => {
  it('redirects an anonymous /dashboard request to the login route', () => {
    const response = proxy(request('/dashboard'));

    expect(response.status).toBe(307);
    expect(locationOf(response)).toBe(`${ORIGIN}/api/auth/login`);
  });

  it('redirects an anonymous deep dashboard path to the login route', () => {
    for (const path of [
      '/dashboard/bots',
      '/dashboard/bots/8f14e45f-ceea-467a-9a1c-1b2c3d4e5f60/token',
      '/dashboard/new',
    ]) {
      const response = proxy(request(path));
      expect(response.status, path).toBe(307);
      expect(locationOf(response), path).toBe(`${ORIGIN}/api/auth/login`);
    }
  });

  it('passes a cookie-bearing request through untouched', () => {
    const response = proxy(request('/dashboard', `${SESSION_COOKIE}=a-session-id`));

    /* Identical to what NextResponse.next() produces: status 200 and the
       x-middleware-next marker, with no Location and no Set-Cookie. */
    const baseline = NextResponse.next();
    expect(response.status).toBe(baseline.status);
    expect(response.headers.get('x-middleware-next')).toBe(
      baseline.headers.get('x-middleware-next'),
    );
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(locationOf(response)).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('passes through on a bare cookie name — presence only, value never read', () => {
    /* An empty value still means "someone signed in at some point": the gate
       is optimistic and the API routes do the real, fail-closed check. Both
       spacings of an empty value must behave the same. */
    for (const cookie of [`${SESSION_COOKIE}=`, `${SESSION_COOKIE}= `, `${SESSION_COOKIE}`]) {
      const response = proxy(request('/dashboard', cookie));
      expect(response.status, cookie).toBe(200);
      expect(response.headers.get('x-middleware-next'), cookie).toBe('1');
    }
  });

  it('passes through a forged cookie value (the APIs reject it, not this gate)', () => {
    /* The gate is optimistic: junk that PARSES as a cookie value passes here
       and is rejected by the real session reads behind the API routes. */
    const response = proxy(request('/dashboard', `${SESSION_COOKIE}=!!!not-a-session!!!`));
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('treats an undecodable cookie value as absent (Next drops it before the gate sees it)', () => {
    /* Empirically verified against Next 16.3.4: `%ZZ` is not valid
       percent-encoding, so NextRequest's cookie parser drops the pair entirely
       and `cookies.has()` answers false. The visitor is redirected, which is
       the safe direction (a cookie no parser can read is not a session). */
    const response = proxy(request('/dashboard', `${SESSION_COOKIE}=%ZZ`));
    expect(response.status).toBe(307);
    expect(locationOf(response)).toBe(`${ORIGIN}/api/auth/login`);
  });

  it('ignores a different cookie with a similar name', () => {
    const response = proxy(request('/dashboard', `${SESSION_COOKIE}_other=a-session-id`));

    expect(response.status).toBe(307);
    expect(locationOf(response)).toBe(`${ORIGIN}/api/auth/login`);
  });

  it('finds the session cookie among other cookies', () => {
    const response = proxy(
      request('/dashboard', `theme=dark; ${SESSION_COOKIE}=a-session-id; locale=en`),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('redirect target is absolute and on the request origin', () => {
    const response = proxy(request('/dashboard/bots'));

    const location = locationOf(response);
    expect(location).not.toBeNull();
    const target = new URL(String(location));
    expect(target.origin).toBe(ORIGIN);
    expect(target.pathname).toBe('/api/auth/login');
  });

  it('pins the cookie name to the constant the auth code exports', () => {
    /* proxy.ts repeats the literal to stay free of the session module's
       imports; this is the binding that keeps the two in sync. Signing out
       only clears the cookie when the names agree. */
    expect(SESSION_COOKIE).toBe('corvus_session');
  });

  it('matches the cookie name that the auth flow actually sets', () => {
    /* The same request shape the gate sees, built from the exported constant:
       if either the gate or the auth module renamed the cookie, this test (and
       the pin above) fails instead of the gate quietly answering "anonymous". */
    const response = proxy(request('/dashboard', `${SESSION_COOKIE}=${'a'.repeat(32)}`));
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});

describe('proxy matcher coverage', () => {
  it('matches the dashboard surface, including transport forms', () => {
    for (const pathname of [
      '/dashboard',
      '/dashboard/',
      '/dashboard/bots',
      '/dashboard/bots/8f14e45f-ceea-467a-9a1c-1b2c3d4e5f60',
      '/dashboard/bots/8f14e45f-ceea-467a-9a1c-1b2c3d4e5f60/token',
      '/dashboard/new',
      /* The build adds these forms of the same page to the matcher; client-side
         navigation must be gated as well as the initial document request. */
      '/_next/data/BUILD_ID/dashboard.json',
      '/dashboard.rsc',
    ]) {
      expect(matches(pathname), pathname).toBe(true);
    }
  });

  it('leaves the public routes open', () => {
    for (const pathname of [
      '/',
      '/gallery',
      '/gallery/mod-shield',
      '/demo',
      '/pick',
      '/interview',
      '/privacy',
      '/terms',
      '/auth/error',
      '/api/auth/login',
      '/api/auth/callback',
      '/api/credits',
      /* Near-misses: a prefix match would wrongly gate these. */
      '/dashboardx',
      '/dashboard-notes',
    ]) {
      expect(matches(pathname), pathname).toBe(false);
    }
  });

  it('keeps the matcher as literal strings', () => {
    /* Next.js reads the config by static analysis at build time; a computed
       value is silently ignored, which would leave the gate dead in
       production while every test here still passed. Assert both the shape
       and the exact contents. */
    expect(Array.isArray(config.matcher)).toBe(true);
    expect(config.matcher).toEqual(['/dashboard', '/dashboard/:path*']);
    for (const entry of config.matcher) {
      expect(typeof entry).toBe('string');
    }
  });
});

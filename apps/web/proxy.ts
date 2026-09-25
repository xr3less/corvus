/* Optimistic cookie-only gate for the logged-in app (F9).
 *
 * Why this file exists: every /dashboard page is a client component that
 * fetches its data from the API routes. Signed out, those fetches all answer
 * 401 and the page silently renders an empty logged-in-looking shell — a
 * visitor who never signed in sees "My server", the rail, and the setup
 * checklist. This gate redirects that visitor to the login route before the
 * shell renders.
 *
 * What it is NOT: an authorization check. It reads cookie PRESENCE only and
 * never a value — no decode, no signature, no database round-trip. That is
 * deliberate and matches the bundled Next.js guidance on optimistic checks
 * (node_modules/next/dist/docs/01-app/02-guides/authentication.md, section
 * "Optimistic checks with Proxy (Optional)"): this runs on every matched
 * request including prefetches, so it must stay cheap. A stale, forged, or
 * expired cookie passes here and is rejected by the real session reads behind
 * the APIs — the fail-closed gate stays where it already was.
 *
 * Why the cookie name is a literal here: importing the session module (which
 * owns the exported cookie-name constant) would pull `pg` and `node:crypto`
 * into the proxy bundle, and this file must not touch the database. Instead
 * the test suite pins this literal against that exported constant, so a rename
 * there fails the tests rather than silently opening the gate.
 *
 * Next.js version note (16.3.4): `proxy` is the current file convention;
 * `middleware` is the deprecated former name of the same feature. The file
 * must export a `proxy` function (or a default) at the project root, beside
 * `app/`, and the matcher must be a statically analysable literal list.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/* The session cookie name as set by the auth flow. Presence only — the value
   is never read. */
const SESSION_COOKIE = 'corvus_session';

/* The existing Discord login route (GET /api/auth/login), which redirects on
   to the provider. Nothing on it is under /dashboard, so no redirect loop is
   possible. The request's own origin is used as the base, never a hardcoded
   host, so the same file works locally and behind the deploy host. */
const LOGIN_PATH = '/api/auth/login';

export function proxy(request: NextRequest): NextResponse {
  if (!request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }
  /* Signed-in-shaped: pass through untouched (no header or cookie rewrite).
     Whether the session is real is decided by the API routes. */
  return NextResponse.next();
}

/* Literal strings on purpose: Next.js reads this config by static analysis at
   build time, and a variable or computed value here is silently ignored.
   `/dashboard/:path*` covers `/dashboard` itself plus every sub-path
   (`/dashboard/bots`, `/dashboard/bots/<id>/token`, …) and, per the file
   convention, also the transport forms of the same page
   (/_next/data/.../dashboard.json, /dashboard.rsc) so client-side navigation
   is gated too. Public surfaces — /, /gallery, /demo, /pick, /interview,
   /privacy, /terms — are deliberately absent and stay open. */
export const config = {
  matcher: ['/dashboard', '/dashboard/:path*'],
};

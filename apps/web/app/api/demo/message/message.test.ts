import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { __clearBuckets, __resetNow, __setNow, POST } from './route';

const HOUR_MS = 60 * 60 * 1000;

function postRequest(text: unknown, ip?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (ip !== undefined) {
    headers['x-forwarded-for'] = ip;
  }
  return new Request('http://localhost/api/demo/message', {
    method: 'POST',
    headers,
    body: JSON.stringify({ text }),
  });
}

function rawRequest(body: string, ip?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (ip !== undefined) {
    headers['x-forwarded-for'] = ip;
  }
  return new Request('http://localhost/api/demo/message', {
    method: 'POST',
    headers,
    body,
  });
}

beforeEach(() => {
  __clearBuckets();
  __resetNow();
});

describe('demo route - validation 422s', () => {
  it('rejects missing text', async () => {
    const res = await POST(rawRequest(JSON.stringify({})));
    expect(res.status).toBe(422);
  });

  it('rejects empty text', async () => {
    const res = await POST(postRequest(''));
    expect(res.status).toBe(422);
  });

  it('rejects whitespace-only text', async () => {
    const res = await POST(postRequest('   '));
    expect(res.status).toBe(422);
  });

  it('rejects non-string text', async () => {
    const res = await POST(postRequest(42));
    expect(res.status).toBe(422);
  });

  it('rejects text over 500 chars', async () => {
    const res = await POST(postRequest('a'.repeat(501), '422-long-ip'));
    expect(res.status).toBe(422);
  });

  it('accepts 500 chars', async () => {
    const res = await POST(postRequest('a'.repeat(500), '422-edge-ip'));
    expect(res.status).toBe(200);
  });
});

describe('demo route - happy path', () => {
  it('replies to a greeting', async () => {
    const res = await POST(postRequest('hello', 'happy-ip'));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { reply?: unknown };
    expect(typeof data.reply).toBe('string');
    expect(data.reply).toContain('Corvus demo');
  });
});

describe('demo route - rate limit math', () => {
  it('allows 20 then 429s the 21st with header', async () => {
    const ip = 'limit-ip-1';
    for (let i = 0; i < 20; i += 1) {
      const res = await POST(postRequest('hello', ip));
      expect(res.status).toBe(200);
    }
    const limited = await POST(postRequest('hello', ip));
    expect(limited.status).toBe(429);
    const data = (await limited.json()) as { error?: unknown; retryAfterSeconds?: unknown };
    expect(data.error).toBe('slow down');
    expect(typeof data.retryAfterSeconds).toBe('number');
    const seconds = data.retryAfterSeconds as number;
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(3600);
    expect(limited.headers.get('Retry-After')).toBe(String(seconds));
  });

  it('computes retry seconds from the fake clock', async () => {
    const ip = 'limit-ip-2';
    const start = 1_700_000_000_000;
    __setNow(() => start);
    for (let i = 0; i < 20; i += 1) {
      await POST(postRequest('hello', ip));
    }
    __setNow(() => start + 1000);
    const limited = await POST(postRequest('hello', ip));
    expect(limited.status).toBe(429);
    const data = (await limited.json()) as { retryAfterSeconds?: unknown };
    expect(data.retryAfterSeconds).toBe(3599);
    expect(limited.headers.get('Retry-After')).toBe('3599');
  });

  it('resets the window after one hour by clock', async () => {
    const ip = 'limit-ip-3';
    const start = 1_700_000_000_000;
    __setNow(() => start);
    for (let i = 0; i < 20; i += 1) {
      await POST(postRequest('hello', ip));
    }
    expect((await POST(postRequest('hello', ip))).status).toBe(429);
    __setNow(() => start + HOUR_MS + 1);
    const res = await POST(postRequest('hello', ip));
    expect(res.status).toBe(200);
  });

  it('isolates buckets per IP', async () => {
    for (let i = 0; i < 20; i += 1) {
      await POST(postRequest('hello', 'iso-a'));
    }
    expect((await POST(postRequest('hello', 'iso-a'))).status).toBe(429);
    expect((await POST(postRequest('hello', 'iso-b'))).status).toBe(200);
  });

  it('shares one bucket when IP is unknown', async () => {
    for (let i = 0; i < 20; i += 1) {
      const res = await POST(postRequest('hello'));
      expect(res.status).toBe(200);
    }
    const limited = await POST(postRequest('hello'));
    expect(limited.status).toBe(429);
  });

  it('trims the first forwarded entry', async () => {
    const res = await POST(postRequest('hello', '  spaced-ip , 10.0.0.2'));
    expect(res.status).toBe(200);
    for (let i = 0; i < 19; i += 1) {
      await POST(postRequest('hello', 'spaced-ip'));
    }
    expect((await POST(postRequest('hello', 'spaced-ip'))).status).toBe(429);
  });
});

describe('demo route - no persistence by construction', () => {
  it('keeps brain and route free of store and log calls', () => {
    const candidates = [
      join(process.cwd(), 'lib/demo/brain.ts'),
      join(process.cwd(), 'app/api/demo/message/route.ts'),
      join(process.cwd(), 'apps/web/lib/demo/brain.ts'),
      join(process.cwd(), 'apps/web/app/api/demo/message/route.ts'),
    ];
    const loaded: string[] = [];
    for (const path of candidates) {
      try {
        loaded.push(readFileSync(path, 'utf8'));
      } catch {
        // missing candidate when cwd differs, try next
      }
    }
    // Files searched: lib/demo/brain.ts and app/api/demo/message/route.ts
    // resolved from the web workspace cwd, with repo-root fallback.
    expect(loaded.length).toBeGreaterThan(0);
    const forbidden = [
      'prisma',
      'drizzle',
      'pool.query',
      'client.query',
      'INSERT INTO',
      'writeFile',
      'appendFile',
      'localStorage',
      'console.log',
      'console.info',
      'console.warn',
      'console.error',
      'fetch(',
    ];
    for (const source of loaded) {
      for (const token of forbidden) {
        expect(source).not.toContain(token);
      }
    }
  });
});

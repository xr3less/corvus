// Unit tests for the generic connector reader.
// Fetch is mocked via vi.stubGlobal — no network, no secrets, no real URLs.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorConfig } from './reader.js';
import { readConnector } from './reader.js';

function baseConfig(overrides: Partial<ConnectorConfig> = {}): ConnectorConfig {
  return {
    id: 'test-connector',
    kind: 'json_rest',
    url: 'https://example.invalid/status',
    intervalSec: 60,
    timeoutMs: 5000,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TESTBOT_CONNECTOR_READER_TEST_TOKEN;
});

describe('readConnector', () => {
  it('returns ok:true with parsed JSON data', async () => {
    const payload = { value: 42 };
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(payload), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    const result = await readConnector(baseConfig());
    expect(result.ok).toBe(true);
    expect(result.data).toEqual(payload);
    expect(typeof result.at).toBe('string');
    await expect(readConnector(baseConfig())).resolves.toMatchObject({ ok: true });
  });

  it('returns an http-class failure on HTTP 500 without retrying', async () => {
    const fetchMock = vi.fn(async () => new Response('boom', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const promise = readConnector(baseConfig());
    await expect(promise).resolves.toMatchObject({
      ok: false,
      failure: expect.objectContaining({ class: 'http', status: 500 }) as unknown,
    });
    const result = await promise;
    expect(result.failure?.status).toBe(500);
    // Non-OK statuses are never retried: exactly one fetch call.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps aborted requests to a timeout-class failure and never rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('The operation timed out.', 'TimeoutError');
      }),
    );
    const promise = readConnector(baseConfig({ timeoutMs: 50 }));
    await expect(promise).resolves.toMatchObject({
      ok: false,
      failure: expect.objectContaining({ class: 'timeout' }) as unknown,
    });
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.failure?.class).toBe('timeout');
  });

  it('returns an auth-class failure without sending the request when the env var is missing', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const promise = readConnector(baseConfig({ authEnv: 'TESTBOT_CONNECTOR_READER_TEST_TOKEN' }));
    await expect(promise).resolves.toMatchObject({
      ok: false,
      failure: expect.objectContaining({ class: 'auth' }) as unknown,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns response text for plaintext_rest', async () => {
    const body = 'online|12|ok';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status: 200 })),
    );
    const result = await readConnector(baseConfig({ kind: 'plaintext_rest' }));
    expect(result.ok).toBe(true);
    expect(result.data).toBe(body);
    await expect(readConnector(baseConfig({ kind: 'plaintext_rest' }))).resolves.toMatchObject({
      ok: true,
      data: body,
    });
  });
});

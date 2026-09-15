import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => {
  const mocked = {
    mkdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
  };
  return { ...mocked, default: mocked };
});

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { DELETE, POST } from './route';

const mkdirMock = vi.mocked(mkdir);
const readFileMock = vi.mocked(readFile);
const writeFileMock = vi.mocked(writeFile);

function fakeRequest(body: unknown): Request {
  return {
    json: async () => body,
  } as unknown as Request;
}

function brokenRequest(): Request {
  return {
    json: async () => {
      throw new Error('bad json');
    },
  } as unknown as Request;
}

async function readJson(res: Response): Promise<{ votes: Record<string, number> }> {
  return (await res.json()) as { votes: Record<string, number> };
}

describe('POST /api/pick/vote', () => {
  beforeEach(() => {
    mkdirMock.mockReset();
    readFileMock.mockReset();
    writeFileMock.mockReset();
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
    readFileMock.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  });

  it('increments a variant from an empty store', async () => {
    const res = await POST(fakeRequest({ variantId: 'shadcn-default', delta: 1 }));

    expect(res.status).toBe(200);
    const data = await readJson(res);
    expect(data.votes).toEqual({ 'shadcn-default': 1 });
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const written = String(writeFileMock.mock.calls[0][1]);
    expect(written).toContain('"shadcn-default": 1');
  });

  it('increments an existing count', async () => {
    readFileMock.mockResolvedValue('{ "underline": 2 }');
    const res = await POST(fakeRequest({ variantId: 'underline', delta: 1 }));

    expect(res.status).toBe(200);
    const data = await readJson(res);
    expect(data.votes.underline).toBe(3);
  });

  it('decrements and clamps at zero', async () => {
    readFileMock.mockResolvedValue('{ "pill": 0 }');
    const res = await POST(fakeRequest({ variantId: 'pill', delta: -1 }));

    expect(res.status).toBe(200);
    const data = await readJson(res);
    expect(data.votes.pill).toBe(0);
  });

  it('rejects bad input with 400', async () => {
    const cases: unknown[] = [
      {},
      { variantId: '', delta: 1 },
      { variantId: 123, delta: 1 },
      { variantId: 'x'.repeat(65), delta: 1 },
      { variantId: 'ok', delta: 2 },
      { variantId: 'ok', delta: 'up' },
      null,
    ];

    for (const body of cases) {
      const res = await POST(fakeRequest(body));
      expect(res.status).toBe(400);
    }

    const broken = await POST(brokenRequest());
    expect(broken.status).toBe(400);
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('returns 500 when the file cannot be written', async () => {
    writeFileMock.mockRejectedValue(new Error('disk full'));
    const res = await POST(fakeRequest({ variantId: 'mono', delta: 1 }));

    expect(res.status).toBe(500);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe('oy kaydedilemedi');
  });
});

describe('DELETE /api/pick/vote', () => {
  beforeEach(() => {
    mkdirMock.mockReset();
    writeFileMock.mockReset();
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('clears every vote', async () => {
    const res = await DELETE();

    expect(res.status).toBe(200);
    const data = await readJson(res);
    expect(data.votes).toEqual({});
    const written = String(writeFileMock.mock.calls[0][1]);
    expect(written).toContain('{}');
  });
});

describe('production guard', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    mkdirMock.mockReset();
    readFileMock.mockReset();
    writeFileMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('answers 404 on POST in production without touching the store', async () => {
    const res = await POST(fakeRequest({ variantId: 'prod-blocked', delta: 1 }));

    expect(res.status).toBe(404);
    expect(mkdirMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('answers 404 on DELETE in production without touching the store', async () => {
    const res = await DELETE();

    expect(res.status).toBe(404);
    expect(mkdirMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('keeps serving votes outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
    readFileMock.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const res = await POST(fakeRequest({ variantId: 'dev-ok', delta: 1 }));

    expect(res.status).toBe(200);
    expect(writeFileMock).toHaveBeenCalledTimes(1);
  });
});

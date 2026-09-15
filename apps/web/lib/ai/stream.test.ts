// Stub-fetch tests for the streaming router. No network is ever touched: every
// provider HTTP call goes through an injected stub fetch. Covers reasoning +
// content ordering, [DONE] termination, provider fallback, provider-reported
// metering, the missing-usage mirror of chat(), clean abort, and secret-free
// plain errors.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OPENROUTER_BASE_URL, WIRO_DEFAULT_BASE_URL, ZAI_BASE_URL } from './lanes';
import type { FetchFn } from './router';
import { chatStream } from './stream';
import type { StreamEvent } from './stream';

const ROUTER_ENV_KEYS = [
  'WIRO_API_KEY',
  'OPENROUTER_API_KEY',
  'ZAI_API_KEY',
  'DEEPSEEK_API_KEY',
  'ANTHROPIC_API_KEY',
  'WIRO_BASE_URL',
] as const;

const FAKE_KEYS: Record<string, string> = {
  WIRO_API_KEY: 'test-wiro-key-fake',
  OPENROUTER_API_KEY: 'test-openrouter-key-fake',
  ZAI_API_KEY: 'test-zai-key-fake',
  DEEPSEEK_API_KEY: 'test-deepseek-key-fake',
  ANTHROPIC_API_KEY: 'test-anthropic-key-fake',
};

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of ROUTER_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ROUTER_ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

function setFakeKeys(except: string[] = []): void {
  for (const [key, value] of Object.entries(FAKE_KEYS)) {
    if (!except.includes(key)) {
      process.env[key] = value;
    }
  }
}

function dataEvent(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function delta(fields: Record<string, unknown>): string {
  return dataEvent({
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: fields, finish_reason: null }],
  });
}

function usage(cost?: number): string {
  const body =
    cost === undefined ? { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } : { cost };
  return dataEvent({ object: 'chat.completion.chunk', choices: [], usage: body });
}

const DONE = 'data: [DONE]\n\n';

function responseFromEvents(events: string[], status = 200): Response {
  const headers = { 'Content-Type': 'text/event-stream' };
  if (typeof ReadableStream === 'undefined') {
    return new Response(events.join(''), { status, headers });
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of events) {
        controller.enqueue(encoder.encode(frame));
      }
      controller.close();
    },
  });
  return new Response(stream, { status, headers });
}

type StubStep = Response | Error;

interface SeenRequest {
  url: string;
  init: RequestInit | undefined;
}

function makeStubFetch(steps: StubStep[]): { fetchFn: FetchFn; requests: SeenRequest[] } {
  const requests: SeenRequest[] = [];
  const fetchFn: FetchFn = (input, init) => {
    const step = steps[requests.length];
    requests.push({ url: input, init });
    if (!step) {
      throw new Error(`stub-fetch exhausted after ${steps.length} call(s) — retry loop?`);
    }
    if (step instanceof Error) {
      return Promise.reject(step);
    }
    return Promise.resolve(step);
  };
  return { fetchFn, requests };
}

async function collect(stream: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

const messages = [{ role: 'user', content: 'hi' }];

describe('chatStream', () => {
  it('streams reasoning then content then a metered done from provider cost', async () => {
    setFakeKeys();
    const { fetchFn, requests } = makeStubFetch([
      responseFromEvents([
        delta({ role: 'assistant' }),
        delta({ reasoning_content: 'think ' }),
        delta({ reasoning_content: 'twice' }),
        delta({ content: 'Hel' }),
        delta({ content: 'lo' }),
        usage(0.02),
        DONE,
      ]),
    ]);
    const events = await collect(
      chatStream({ lane: 'builder', messages, maxTokens: 6000, fetchFn }),
    );
    expect(events).toEqual([
      { t: 'reasoning', text: 'think ' },
      { t: 'reasoning', text: 'twice' },
      { t: 'content', text: 'Hel' },
      { t: 'content', text: 'lo' },
      { t: 'done', credits: 4 },
    ]);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(`${WIRO_DEFAULT_BASE_URL}/chat/completions`);
    const headers = requests[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-wiro-key-fake');
    const body = JSON.parse(String(requests[0].init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'glm/5-2',
      stream: true,
      temperature: 0,
      max_tokens: 6000,
      reasoning_effort: 'low',
    });
    expect(body.messages).toEqual(messages);
  });

  it('requests reasoning on the persona lane so the trace has content', async () => {
    setFakeKeys();
    const { fetchFn, requests } = makeStubFetch([
      responseFromEvents([
        delta({ role: 'assistant' }),
        delta({ reasoning: 'checking ' }),
        delta({ content: 'hi' }),
        DONE,
      ]),
    ]);
    const events = await collect(chatStream({ lane: 'persona', messages, fetchFn }));
    expect(events).toEqual([
      { t: 'reasoning', text: 'checking ' },
      { t: 'content', text: 'hi' },
      { t: 'done', credits: 0, note: 'usage-unavailable' },
    ]);
    const body = JSON.parse(String(requests[0].init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ model: 'xai/grok-4-1-fast', reasoning_effort: 'low' });
  });

  it('accepts `reasoning` (not just `reasoning_content`) and skips non-string shapes', async () => {
    setFakeKeys();
    const { fetchFn } = makeStubFetch([
      responseFromEvents([
        delta({ reasoning: 'plain' }),
        delta({ reasoning_content: 123 }),
        delta({ content: 'answer' }),
        usage(0.005),
        DONE,
      ]),
    ]);
    const events = await collect(chatStream({ lane: 'builder', messages, fetchFn }));
    expect(events).toEqual([
      { t: 'reasoning', text: 'plain' },
      { t: 'content', text: 'answer' },
      { t: 'done', credits: 1 },
    ]);
  });

  it('ends on [DONE] and ignores any trailing frames', async () => {
    setFakeKeys();
    const { fetchFn } = makeStubFetch([
      responseFromEvents([
        delta({ content: 'a' }),
        usage(0.01),
        DONE,
        delta({ content: 'ignored' }),
      ]),
    ]);
    const events = await collect(chatStream({ lane: 'builder', messages, fetchFn }));
    expect(events).toEqual([
      { t: 'content', text: 'a' },
      { t: 'done', credits: 2 },
    ]);
  });

  it('falls back to the next provider route on a first-route 500', async () => {
    setFakeKeys(['WIRO_API_KEY', 'DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY']);
    const { fetchFn, requests } = makeStubFetch([
      new Response('{}', { status: 500 }),
      responseFromEvents([delta({ content: 'recovered' }), usage(0.01), DONE]),
    ]);
    const events = await collect(chatStream({ lane: 'builder', messages, fetchFn }));
    expect(events).toEqual([
      { t: 'content', text: 'recovered' },
      { t: 'done', credits: 2 },
    ]);
    expect(requests).toHaveLength(2);
    expect(requests[0].url).toBe(`${OPENROUTER_BASE_URL}/chat/completions`);
    expect(requests[1].url).toBe(`${ZAI_BASE_URL}/chat/completions`);
  });

  it('mirrors chat() for missing usage: credits 0, flagged usage-unavailable', async () => {
    setFakeKeys();
    const { fetchFn } = makeStubFetch([
      responseFromEvents([delta({ content: 'hi' }), usage(), DONE]),
    ]);
    const events = await collect(chatStream({ lane: 'builder', messages, fetchFn }));
    expect(events[events.length - 1]).toEqual({
      t: 'done',
      credits: 0,
      note: 'usage-unavailable',
    });
  });

  it('flags usage-unavailable when no usage chunk arrives at all', async () => {
    setFakeKeys();
    const { fetchFn } = makeStubFetch([responseFromEvents([delta({ content: 'hi' }), DONE])]);
    const events = await collect(chatStream({ lane: 'builder', messages, fetchFn }));
    expect(events).toEqual([
      { t: 'content', text: 'hi' },
      { t: 'done', credits: 0, note: 'usage-unavailable' },
    ]);
  });

  it('ends cleanly on caller abort with no done event and no request', async () => {
    setFakeKeys();
    const controller = new AbortController();
    controller.abort();
    const { fetchFn, requests } = makeStubFetch([
      responseFromEvents([delta({ content: 'x' }), usage(0.02), DONE]),
    ]);
    const events = await collect(
      chatStream({ lane: 'builder', messages, signal: controller.signal, fetchFn }),
    );
    expect(events).toEqual([]);
    expect(requests).toHaveLength(0);
  });

  it('falls through a network error to the next route', async () => {
    setFakeKeys();
    const { fetchFn, requests } = makeStubFetch([
      new TypeError('fetch failed'),
      responseFromEvents([delta({ content: 'after-network' }), usage(0.005), DONE]),
    ]);
    const events = await collect(chatStream({ lane: 'builder', messages, fetchFn }));
    expect(events).toEqual([
      { t: 'content', text: 'after-network' },
      { t: 'done', credits: 1 },
    ]);
    expect(requests).toHaveLength(2);
    expect(requests[0].url).toBe(`${WIRO_DEFAULT_BASE_URL}/chat/completions`);
    expect(requests[1].url).toBe(`${WIRO_DEFAULT_BASE_URL}/chat/completions`);
  });

  it('throws a plain, secret-free Error naming lane and provider when all routes fail', async () => {
    setFakeKeys();
    const { fetchFn } = makeStubFetch([
      new Response('{}', { status: 500 }),
      new Response('{}', { status: 500 }),
      new Response('{}', { status: 500 }),
      new Response('{}', { status: 500 }),
      new Response('{}', { status: 500 }),
      new Response('{}', { status: 500 }),
    ]);
    const failure = await collect(chatStream({ lane: 'builder', messages, fetchFn })).then(
      () => {
        throw new Error('chatStream should have thrown');
      },
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain('builder');
    expect(String(failure)).toContain('deepseek-chat');
    for (const secret of Object.values(FAKE_KEYS)) {
      expect(String(failure)).not.toContain(secret);
    }
  });

  it('mirrors chat() 4xx visibility: one extra route, then throw', async () => {
    setFakeKeys();
    const { fetchFn, requests } = makeStubFetch([
      new Response('{}', { status: 403 }),
      new Response('{}', { status: 403 }),
    ]);
    const failure = await collect(chatStream({ lane: 'builder', messages, fetchFn })).then(
      () => {
        throw new Error('chatStream should have thrown');
      },
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain('http-403');
    expect(requests).toHaveLength(2);
  });
});

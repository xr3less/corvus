import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import BotDetailPage from './page';

/* The route id comes from useParams; tests steer it per case. */
let mockRouteId = 'bot-3';
let mockTab: string | null = null;

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: mockRouteId }),
  useSearchParams: () => ({ get: (key: string) => (key === 'tab' ? mockTab : null) }),
}));

const TRIAL_LINE = 'Trial: 3 days, full Pro, no card. Then pay or your bot sleeps.';
const COST_NOTE = 'About 1.1 credits per change · platform failures retry free.';
const MODEL_NAMES = ['Sonnet', 'GPT', 'Gemini', 'GLM', 'grok'];

const FORBIDDEN = [
  'OAuth',
  'PKCE',
  'ACID',
  'Postgres',
  'WebSocket',
  'Multi-guild',
  'Dispatch',
  'Compilation',
  'Self-healing',
  'Behavior spec',
  'Sandbox',
  'Backend',
  'API',
  'Production-grade',
  'Built from first principles',
  'Enterprise-Grade',
  'Architectural Breakthroughs',
];

let consoleError: ReturnType<typeof vi.spyOn>;

interface FetchResponse {
  ok: boolean;
  status: number;
  json: () => Promise<{ items: unknown[] }>;
}

function respOk(items: unknown[]): FetchResponse {
  return { ok: true, status: 200, json: async () => ({ items }) };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function sseStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(inner) {
      controller = inner;
    },
  });
  return {
    stream,
    push(text: string) {
      controller?.enqueue(encoder.encode(text));
    },
    close() {
      controller?.close();
    },
  };
}

function streamResponse(stream: ReadableStream<Uint8Array>) {
  return {
    ok: true,
    status: 200,
    body: stream,
    json: async () => ({}),
  };
}

function frame(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function renderDetail(id: string) {
  mockRouteId = id;
  return render(<BotDetailPage />);
}

/* Fill and submit the detail composer (expanding the collapsed input first). */
async function submitDetail(text: string): Promise<HTMLTextAreaElement> {
  fireEvent.click(screen.getByRole('button', { name: 'Open prompt input' }));
  const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
  await waitFor(() => expect(document.activeElement).toBe(textarea));
  fireEvent.change(textarea, { target: { value: text } });
  fireEvent.keyDown(textarea, { key: 'Enter' });
  return textarea;
}

function expectNoForbiddenJargon() {
  const text = (document.body.textContent ?? '').toLowerCase();
  for (const term of FORBIDDEN) {
    expect(text, `forbidden term shipped: ${term}`).not.toContain(term.toLowerCase());
  }
}

beforeEach(() => {
  mockRouteId = 'bot-3';
  mockTab = null;
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('network disabled in tests'))),
  );
});

afterEach(() => {
  consoleError.mockRestore();
  vi.unstubAllGlobals();
});

describe('bot detail page', () => {
  it('renders the header with a back link to the bots list', () => {
    renderDetail('bot-3');
    expect(screen.getByRole('heading', { name: 'Night Market mods' })).toBeTruthy();
    const back = screen.getByRole('link', { name: '← All bots' });
    expect(back.getAttribute('href')).toBe('/dashboard/bots');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows an honest empty state for an unknown id', () => {
    renderDetail('no-such-bot');
    expect(screen.getByText('No bot with this address — it may have been deleted.')).toBeTruthy();
    const back = screen.getByRole('link', { name: 'Back to your bots' });
    expect(back.getAttribute('href')).toBe('/dashboard/bots');
    expect(screen.queryByRole('tab', { name: 'Overview' })).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows the mock action row and one-card detail tabs', () => {
    renderDetail('bot-3');
    for (const label of ['Open', 'Continue interview', 'Publish', 'Rollback']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    expect(screen.getByRole('tab', { name: 'Overview' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Activity' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Pre-flight' })).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('lands on the tab named by ?tab= from a card deep action', async () => {
    mockTab = 'activity';
    try {
      renderDetail('bot-3');
      expect(screen.getByRole('tab', { name: 'Activity' }).getAttribute('aria-selected')).toBe(
        'true',
      );
      expect(screen.getByRole('region', { name: 'Recent activity' })).toBeTruthy();
      await screen.findByText('Example');
    } finally {
      mockTab = null;
    }
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows exactly one detail card at a time', async () => {
    renderDetail('bot-3');
    expect(screen.getByRole('region', { name: 'What this bot does (example)' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Recent activity' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Pre-flight' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(screen.getByRole('region', { name: 'Recent activity' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'What this bot does (example)' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Pre-flight' })).toBeNull();
    await screen.findByText('Example');

    fireEvent.click(screen.getByRole('tab', { name: 'Pre-flight' }));
    expect(screen.getByRole('region', { name: 'Pre-flight' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'What this bot does (example)' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Recent activity' })).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('keeps the AI box pinned with chips, composer and cost line', () => {
    renderDetail('bot-3');
    const group = screen.getByRole('group', { name: 'Suggested changes' });
    expect(within(group).getAllByRole('button')).toHaveLength(3);
    expect(screen.getByPlaceholderText('Describe a change…')).toBeTruthy();
    expect(screen.getByText(COST_NOTE)).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('submitting composer text appends the thread row and opens a stream to /api/chat', async () => {
    const sse = sseStream();
    const fetchStub = vi.fn().mockResolvedValue(streamResponse(sse.stream));
    vi.stubGlobal('fetch', fetchStub);
    renderDetail('bot-3');
    expect(screen.queryByRole('list', { name: 'Submitted changes' })).toBeNull();
    await submitDetail('Make the header bolder');
    const thread = await screen.findByRole('list', { name: 'Submitted changes' });
    expect(thread.textContent).toContain('You: Make the header bolder');
    /* No files attached, so the user row carries no meta line at all. */
    expect(thread.textContent).not.toContain('attachment(s)');
    expect(within(thread).queryByText(/attachment\(s\)/)).toBeNull();
    expect(fetchStub).toHaveBeenCalledWith(
      '/api/chat',
      expect.objectContaining({
        method: 'POST',
        /* Mock display ids coerce to null — the API validates uuid. */
        body: JSON.stringify({
          botId: null,
          message: 'Make the header bolder',
          history: [],
        }),
        signal: expect.anything(),
      }),
    );

    await act(async () => {
      sse.push(frame({ t: 'content', text: 'Done.' }));
      sse.push(frame({ t: 'done', credits: 1.1 }));
      sse.close();
    });
    await waitFor(() => expect(screen.getByText('Done.')).toBeTruthy());
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows the attachment count on the user row only when files are attached', async () => {
    const sse = sseStream();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(sse.stream)));
    /* jsdom has no object URLs and never loads images — stub both so the
       composer's hidden file input accepts an image attachment in tests. */
    const hadCreateObjectURL = typeof URL.createObjectURL === 'function';
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = () => 'blob:mock-url';
    URL.revokeObjectURL = () => {};
    class ImageMock {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 800;
      naturalHeight = 600;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', ImageMock);
    try {
      renderDetail('bot-3');
      fireEvent.click(screen.getByRole('button', { name: 'Open prompt input' }));
      const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
      await waitFor(() => expect(document.activeElement).toBe(textarea));
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
      expect(fileInput).not.toBeNull();
      fireEvent.change(fileInput as HTMLInputElement, {
        target: { files: [new File(['pixels'], 'shot.png', { type: 'image/png' })] },
      });
      await screen.findByRole('button', { name: 'Open preview of shot.png' });
      fireEvent.change(textarea, { target: { value: 'Use this layout' } });
      fireEvent.keyDown(textarea, { key: 'Enter' });
      const thread = await screen.findByRole('list', { name: 'Submitted changes' });
      expect(thread.textContent).toContain('You: Use this layout');
      expect(within(thread).getByText('1 attachment(s)')).toBeTruthy();
    } finally {
      if (hadCreateObjectURL) {
        URL.createObjectURL = originalCreateObjectURL;
      } else {
        delete (URL as unknown as Record<string, unknown>).createObjectURL;
      }
    }

    await act(async () => {
      sse.push(frame({ t: 'content', text: 'Done.' }));
      sse.push(frame({ t: 'done', credits: 1.1 }));
      sse.close();
    });
    await waitFor(() => expect(screen.getByText('Done.')).toBeTruthy());
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('second turn carries the completed first turn as history', async () => {
    const first = sseStream();
    const second = sseStream();
    /* First slot is the mount-time draft load (no draft for mock ids). */
    const fetchStub = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
      .mockResolvedValueOnce(streamResponse(first.stream))
      .mockResolvedValueOnce(streamResponse(second.stream));
    vi.stubGlobal('fetch', fetchStub);
    renderDetail('bot-3');
    await submitDetail('First question');
    await act(async () => {
      first.push(frame({ t: 'content', text: 'First answer.' }));
      first.push(frame({ t: 'done', credits: 0.05 }));
      first.close();
    });
    await waitFor(() => expect(screen.getByText('First answer.')).toBeTruthy());

    await submitDetail('Second question');
    /* Draft load + two submits. */
    expect(fetchStub).toHaveBeenCalledTimes(3);
    const secondInit = fetchStub.mock.calls[2][1] as RequestInit;
    expect(JSON.parse(String(secondInit.body))).toEqual({
      botId: null,
      message: 'Second question',
      history: [
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'First answer.' },
      ],
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('a 401 says logged-out in plain words and Retry re-issues after login', async () => {
    const sse = sseStream();
    /* First slot is the mount-time draft load (no draft for mock ids). */
    const fetchStub = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'unauthorized' }),
      })
      .mockResolvedValueOnce(streamResponse(sse.stream));
    vi.stubGlobal('fetch', fetchStub);
    renderDetail('bot-3');
    await submitDetail('Add a welcome rule');

    await screen.findByText('You are logged out — log in again, then press Retry.');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    /* Draft load + failed submit + retry. */
    expect(fetchStub).toHaveBeenCalledTimes(3);

    await act(async () => {
      sse.push(frame({ t: 'content', text: 'Recovered.' }));
      sse.push(frame({ t: 'done', credits: 0.05 }));
      sse.close();
    });
    await waitFor(() => expect(screen.getByText('Recovered.')).toBeTruthy());
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('mock chips never submit a change, and a chip fills the composer', () => {
    renderDetail('bot-3');
    const group = screen.getByRole('group', { name: 'Suggested changes' });
    fireEvent.click(within(group).getByRole('button', { name: 'XP rewards' }));
    expect(screen.queryByRole('list', { name: 'Submitted changes' })).toBeNull();
    fireEvent.click(within(group).getByRole('button', { name: 'Moderation rule' }));
    expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe('Moderation rule');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('updates the header for a trial bot and hides the trial line for a live bot', () => {
    const { unmount } = renderDetail('bot-2');
    expect(screen.getByRole('heading', { name: 'Draft Arena' })).toBeTruthy();
    expect(screen.getByText(TRIAL_LINE)).toBeTruthy();
    unmount();

    renderDetail('bot-1');
    expect(screen.getByRole('heading', { name: 'Study Hall' })).toBeTruthy();
    expect(screen.queryByText(TRIAL_LINE)).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders the live explainer sentences for each bot', () => {
    const { unmount } = renderDetail('bot-1');
    const study = screen.getByRole('region', { name: 'What this bot does (example)' });
    expect(within(study).getByRole('heading', { name: 'What this bot does' })).toBeTruthy();
    expect(study.textContent).toContain('Welcomes new members in #welcome.');
    expect(study.textContent).toContain('Gives 15 XP per message.');
    expect(study.textContent).toContain('Warns rule-breakers 3 times, then mutes them.');
    unmount();

    renderDetail('bot-2');
    expect(
      screen.getByRole('region', { name: 'What this bot does (example)' }).textContent,
    ).toContain('Welcomes new members.');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders live activity items from the feed when the request succeeds', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      respOk([
        { at: '2026-09-13T10:00:00.000Z', kind: 'publish', text: 'Published v7' },
        {
          at: '2026-09-13T09:00:00.000Z',
          kind: 'spend',
          text: 'Builder run · 1.1 credits',
          credits: 1.1,
        },
      ]),
    );
    vi.stubGlobal('fetch', fetchStub);
    renderDetail('bot-3');
    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(screen.getByText('Loading live activity…')).toBeTruthy();

    const region = screen.getByRole('region', { name: 'Recent activity' });
    await waitFor(() => expect(region.textContent).toContain('Published v7'));
    expect(region.textContent).toContain('publish');
    expect(region.textContent).toContain('Builder run · 1.1 credits');
    expect(region.textContent).not.toContain('Example');
    expect(fetchStub).toHaveBeenCalledWith(
      '/api/bots/bot-3/activity?limit=20',
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows the empty feed state when the request returns no items', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respOk([])));
    renderDetail('bot-1');
    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    await screen.findByText('No activity yet.');
    expect(screen.queryByText('Example')).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('falls back to labeled examples when the feed is unauthorized', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );
    renderDetail('bot-3');
    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    await screen.findByText('Example');
    const region = screen.getByRole('region', { name: 'Recent activity' });
    expect(region.textContent).toContain('Published Night Market mods v12');
    expect(region.textContent).toContain('Rolled back Night Market mods to v11');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('falls back to labeled examples when the request rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    renderDetail('bot-2');
    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    await screen.findByText('Example');
    expect(screen.getByRole('region', { name: 'Recent activity' }).textContent).toContain(
      'Published Draft Arena v12',
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('ignores a stale feed response after the bot changes', async () => {
    const first = deferred<FetchResponse>();
    /* Mount-time draft loads (no draft for mock ids) interleave with the feed calls. */
    const noDraft = () => ({ ok: false, status: 404, json: async () => ({}) });
    const fetchStub = vi
      .fn()
      .mockResolvedValueOnce(noDraft())
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce(noDraft())
      .mockResolvedValueOnce(
        respOk([{ at: '2026-09-13T11:00:00.000Z', kind: 'publish', text: 'Draft Arena only' }]),
      );
    vi.stubGlobal('fetch', fetchStub);
    const firstRender = renderDetail('bot-1');
    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    firstRender.unmount();

    renderDetail('bot-2');
    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    await screen.findByText('Draft Arena only');

    first.resolve(
      respOk([{ at: '2026-09-13T08:00:00.000Z', kind: 'publish', text: 'Stale Study Hall' }]),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText('Stale Study Hall')).toBeNull();
    expect(screen.getByText('Draft Arena only')).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('ships no forbidden jargon and never names a model', () => {
    renderDetail('bot-2');
    expectNoForbiddenJargon();
    const text = (document.body.textContent ?? '').toLowerCase();
    for (const name of MODEL_NAMES) {
      expect(text, `model name shipped: ${name}`).not.toContain(name.toLowerCase());
    }
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('bot detail wiring', () => {
  interface ApiCall {
    url: string;
    init?: RequestInit;
  }

  function draftPayload(version: number) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        version,
        spec: { version: 1, behaviors: [] },
        state: 'draft',
      }),
    };
  }

  /* Route fetch by URL so mount-time draft loads never shift positional stubs. */
  function stubApi(
    handlers: { match: (url: string) => boolean; respond: () => unknown }[],
    calls: ApiCall[],
  ) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        for (const handler of handlers) {
          if (handler.match(url)) return handler.respond();
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
  }

  function bodyOf(call: ApiCall | undefined): Record<string, unknown> {
    return JSON.parse(String(call?.init?.body ?? '{}')) as Record<string, unknown>;
  }

  function apiCallsTo(calls: ApiCall[], url: string): ApiCall[] {
    return calls.filter((call) => call.url === url);
  }

  it('loads the draft on mount and posts the draft version on Publish', async () => {
    const calls: ApiCall[] = [];
    stubApi(
      [
        { match: (url) => url.startsWith('/api/spec/draft'), respond: () => draftPayload(5) },
        {
          match: (url) => url === '/api/spec/publish',
          respond: () => ({ ok: true, status: 200, json: async () => ({ version: 5 }) }),
        },
      ],
      calls,
    );
    renderDetail('bot-3');
    await waitFor(() => expect(apiCallsTo(calls, '/api/spec/draft?botId=bot-3')).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await screen.findByText('Published v5.');
    const publish = apiCallsTo(calls, '/api/spec/publish');
    expect(publish).toHaveLength(1);
    expect(publish[0]?.init?.method).toBe('POST');
    /* A mock display id never travels as a fake uuid (D-112): it is coerced to null. */
    expect(bodyOf(publish[0])).toEqual({ botId: null, version: 5 });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('Publish names the failing checks on a preflight-red 409', async () => {
    const calls: ApiCall[] = [];
    stubApi(
      [
        { match: (url) => url.startsWith('/api/spec/draft'), respond: () => draftPayload(5) },
        {
          match: (url) => url === '/api/spec/publish',
          respond: () => ({
            ok: false,
            status: 409,
            json: async () => ({ reason: 'preflight-red', failing: ['permissions'] }),
          }),
        },
      ],
      calls,
    );
    renderDetail('bot-3');
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await screen.findByText(/failing checks: permissions/);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('Publish 401 shows logged-out with a login link', async () => {
    const calls: ApiCall[] = [];
    stubApi(
      [
        { match: (url) => url.startsWith('/api/spec/draft'), respond: () => draftPayload(5) },
        {
          match: (url) => url === '/api/spec/publish',
          respond: () => ({ ok: false, status: 401, json: async () => ({}) }),
        },
      ],
      calls,
    );
    renderDetail('bot-3');
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await screen.findByText(/You are logged out/);
    const login = screen.getByRole('link', { name: 'Log in' });
    expect(login.getAttribute('href')).toBe('/api/auth/login');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('Publish 404 stays honest instead of faking success', async () => {
    const calls: ApiCall[] = [];
    stubApi(
      [
        {
          match: (url) => url.startsWith('/api/spec/draft'),
          respond: () => ({ ok: false, status: 404, json: async () => ({}) }),
        },
        {
          match: (url) => url === '/api/spec/publish',
          respond: () => ({ ok: false, status: 404, json: async () => ({}) }),
        },
      ],
      calls,
    );
    renderDetail('bot-3');
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await screen.findByText(/not saved on the server yet/);
    expect(screen.queryByText(/Published v/)).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('Rollback posts the previous version and shows the restored version', async () => {
    const calls: ApiCall[] = [];
    stubApi(
      [
        { match: (url) => url.startsWith('/api/spec/draft'), respond: () => draftPayload(5) },
        {
          match: (url) => url === '/api/spec/rollback',
          respond: () => ({ ok: true, status: 200, json: async () => ({ version: 4 }) }),
        },
      ],
      calls,
    );
    renderDetail('bot-3');
    await waitFor(() => expect(apiCallsTo(calls, '/api/spec/draft?botId=bot-3')).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: 'Rollback' }));
    await screen.findByText('Rolled back to v4.');
    const rollback = apiCallsTo(calls, '/api/spec/rollback');
    expect(rollback).toHaveLength(1);
    expect(bodyOf(rollback[0])).toEqual({ botId: null, version: 4 });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('Open fetches the install link and shows the why-lines', async () => {
    const calls: ApiCall[] = [];
    stubApi(
      [
        {
          match: (url) => url.startsWith('/api/spec/draft'),
          respond: () => ({ ok: false, status: 404, json: async () => ({}) }),
        },
        {
          match: (url) => url.startsWith('/api/invite'),
          respond: () => ({
            ok: true,
            status: 200,
            json: async () => ({
              url: 'https://discord.com/oauth2/authorize?client_id=123',
              permissions: [{ perm: 'SendMessages', why: 'Send Messages — greetings' }],
            }),
          }),
        },
      ],
      calls,
    );
    renderDetail('bot-3');
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByText('preparing invite…');

    const link = await screen.findByRole('link', { name: 'Open install link' });
    expect(link.getAttribute('href')).toBe('https://discord.com/oauth2/authorize?client_id=123');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(screen.getByText('Send Messages — greetings')).toBeTruthy();
    expect(apiCallsTo(calls, '/api/invite').length).toBeGreaterThan(0);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('Run scan starts a scan and renders the returned rows', async () => {
    const calls: ApiCall[] = [];
    let polls = 0;
    stubApi(
      [
        {
          match: (url) => url.startsWith('/api/spec/draft'),
          respond: () => ({ ok: false, status: 404, json: async () => ({}) }),
        },
        {
          match: (url) => url === '/api/preflight/start',
          respond: () => ({
            ok: true,
            status: 200,
            json: async () => ({ jobId: '11111111-1111-1111-1111-111111111111' }),
          }),
        },
        {
          match: (url) => url.startsWith('/api/preflight?jobId='),
          respond: () => {
            polls += 1;
            if (polls === 1)
              return { ok: true, status: 200, json: async () => ({ state: 'active' }) };
            return {
              ok: true,
              status: 200,
              json: async () => ({
                state: 'done',
                preflight: {
                  scannedAt: '2026-09-13T10:00:00.000Z',
                  rows: [
                    { tone: 'green', check: 'installed', detail: 'The bot joined the server.' },
                  ],
                  summary: { red: 0, yellow: 0, green: 1 },
                },
              }),
            };
          },
        },
      ],
      calls,
    );
    renderDetail('bot-3');
    fireEvent.click(screen.getByRole('tab', { name: 'Pre-flight' }));
    fireEvent.change(screen.getByLabelText('Server ID'), {
      target: { value: '123456789012345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run scan' }));

    await screen.findByText('Scanning…');
    await screen.findByText('installed: The bot joined the server.', undefined, { timeout: 5000 });
    const starts = apiCallsTo(calls, '/api/preflight/start');
    expect(starts).toHaveLength(1);
    expect(bodyOf(starts[0])).toEqual({
      botId: null,
      guildId: '123456789012345678',
      capabilities: ['welcome'],
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('Simulate join posts a join event and lists the fired entries', async () => {
    const calls: ApiCall[] = [];
    stubApi(
      [
        {
          match: (url) => url.startsWith('/api/spec/draft'),
          respond: () => ({ ok: false, status: 404, json: async () => ({}) }),
        },
        {
          match: (url) => url === '/api/simulate',
          respond: () => ({
            ok: true,
            status: 200,
            json: async () => ({
              version: 5,
              fired: [{ behaviorIndex: 0, title: 'Welcome', reason: 'matched: welcome', score: 1 }],
            }),
          }),
        },
      ],
      calls,
    );
    renderDetail('bot-3');
    fireEvent.click(screen.getByRole('button', { name: 'Simulate join' }));
    await screen.findByText(/matched: welcome/);
    expect(screen.getByText('Welcome — matched: welcome')).toBeTruthy();
    const sims = apiCallsTo(calls, '/api/simulate');
    expect(sims).toHaveLength(1);
    expect(bodyOf(sims[0])).toEqual({ botId: null, event: { kind: 'join' } });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('Save as draft posts a patch with the base version', async () => {
    const calls: ApiCall[] = [];
    stubApi(
      [
        { match: (url) => url.startsWith('/api/spec/draft'), respond: () => draftPayload(5) },
        {
          match: (url) => url === '/api/spec/patch',
          respond: () => ({ ok: true, status: 200, json: async () => ({ version: 6 }) }),
        },
      ],
      calls,
    );
    renderDetail('bot-3');
    await waitFor(() => expect(apiCallsTo(calls, '/api/spec/draft?botId=bot-3')).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: 'Open prompt input' }));
    const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
    await waitFor(() => expect(document.activeElement).toBe(textarea));
    fireEvent.change(textarea, { target: { value: 'Greet newcomers' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));

    await screen.findByText('Saved as draft v6.');
    const patches = apiCallsTo(calls, '/api/spec/patch');
    expect(patches).toHaveLength(1);
    const body = bodyOf(patches[0]);
    expect(body.botId).toBeNull();
    expect(body.baseVersion).toBe(5);
    expect(body.summary).toBe('Greet newcomers');
    expect(Array.isArray(body.behaviors)).toBe(true);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('loads a server-owned bot by uuid and sends the uuid on writes', async () => {
    const calls: ApiCall[] = [];
    const liveId = '11111111-2222-4333-8444-555555555555';
    stubApi(
      [
        {
          match: (url) => url === '/api/bots',
          respond: () => ({
            ok: true,
            status: 200,
            json: async () => [{ id: liveId, name: 'Live Study', status: 'live' }],
          }),
        },
        { match: (url) => url.startsWith('/api/spec/draft'), respond: () => draftPayload(5) },
        {
          match: (url) => url === '/api/spec/publish',
          respond: () => ({ ok: true, status: 200, json: async () => ({ version: 5 }) }),
        },
      ],
      calls,
    );
    renderDetail(liveId);

    expect(await screen.findByRole('heading', { name: 'Live Study' })).toBeTruthy();
    await waitFor(() =>
      expect(apiCallsTo(calls, `/api/spec/draft?botId=${liveId}`)).toHaveLength(1),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await screen.findByText('Published v5.');
    const publish = apiCallsTo(calls, '/api/spec/publish');
    /* A real server id is passed through unchanged on writes. */
    expect(bodyOf(publish[0])).toEqual({ botId: liveId, version: 5 });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows the logged-out line and Retry when the live list answers 401', async () => {
    const calls: ApiCall[] = [];
    const liveId = '11111111-2222-4333-8444-555555555555';
    stubApi(
      [
        {
          match: (url) => url === '/api/bots',
          respond: () => ({ ok: false, status: 401, json: async () => ({}) }),
        },
      ],
      calls,
    );
    renderDetail(liveId);

    await screen.findByText(/You are logged out/);
    expect(screen.getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe(
      '/api/auth/login',
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('bot detail chat stream', () => {
  it('shows Thinking with elapsed time and reasoning, then the answer and spent line', async () => {
    const sse = sseStream();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(sse.stream)));
    renderDetail('bot-3');
    await submitDetail('Add a welcome rule');

    await screen.findByText('You: Add a welcome rule');
    expect(screen.getByRole('button', { name: 'Thinking' })).toBeTruthy();

    await act(async () => {
      sse.push(frame({ t: 'reasoning', text: 'Weighing the options' }));
    });
    await waitFor(() => expect(screen.getByText('Weighing the options')).toBeTruthy());

    await act(async () => {
      sse.push(frame({ t: 'content', text: 'Here ' }));
    });
    await waitFor(() => expect(screen.getByText(/Here/)).toBeTruthy());

    await act(async () => {
      sse.push(frame({ t: 'content', text: 'is the rule.' }));
      sse.push(frame({ t: 'done', credits: 0.075 }));
      sse.close();
    });
    await waitFor(() => expect(screen.getByText('Here is the rule.')).toBeTruthy());
    expect(screen.getByText(/This reply used 0.075 credits/)).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('handles a content-only stream with no reasoning', async () => {
    const sse = sseStream();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(sse.stream)));
    renderDetail('bot-2');
    await submitDetail('Hi');

    await act(async () => {
      sse.push(frame({ t: 'content', text: 'Hello there.' }));
      sse.push(frame({ t: 'done', credits: 0.05 }));
      sse.close();
    });
    await waitFor(() => expect(screen.getByText('Hello there.')).toBeTruthy());
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('says the provider reported no cost instead of printing a fabricated 0', async () => {
    const sse = sseStream();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(sse.stream)));
    renderDetail('bot-3');
    await submitDetail('Hi');

    await act(async () => {
      sse.push(frame({ t: 'content', text: 'Answer.' }));
      sse.push(frame({ t: 'done', credits: 0, note: 'usage-unavailable' }));
      sse.close();
    });
    await waitFor(() => expect(screen.getByText('Answer.')).toBeTruthy());
    expect(screen.getByText(/provider reported no cost/)).toBeTruthy();
    expect(screen.queryByText(/This reply used 0 credits/)).toBeNull();
  });

  it('shows an honest inline error and Retry re-issues the same message on one row', async () => {
    const first = sseStream();
    const second = sseStream();
    /* First slot is the mount-time draft load (no draft for mock ids). */
    const fetchStub = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
      .mockResolvedValueOnce(streamResponse(first.stream))
      .mockResolvedValueOnce(streamResponse(second.stream));
    vi.stubGlobal('fetch', fetchStub);
    renderDetail('bot-3');
    await submitDetail('Add a welcome rule');

    await act(async () => {
      first.push(frame({ t: 'error', message: 'The provider is busy.' }));
      first.close();
    });
    await screen.findByText('The provider is busy.');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getAllByText('You: Add a welcome rule')).toHaveLength(1);
    /* Draft load + failed stream + retry. */
    expect(fetchStub).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Thinking' })).toBeTruthy();

    await act(async () => {
      second.push(frame({ t: 'content', text: 'Recovered.' }));
      second.push(frame({ t: 'done', credits: 0.05 }));
      second.close();
    });
    await waitFor(() => expect(screen.getByText('Recovered.')).toBeTruthy());
    expect(screen.queryByText('The provider is busy.')).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('aborts the in-flight stream on unmount', async () => {
    let capturedSignal: AbortSignal | undefined;
    const sse = sseStream();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        capturedSignal = init?.signal ?? undefined;
        return Promise.resolve(streamResponse(sse.stream));
      }),
    );
    const { unmount } = renderDetail('bot-3');
    await submitDetail('Keep it open');
    await waitFor(() => expect(capturedSignal).toBeTruthy());

    unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('locks the composer while a stream is open and unlocks it at done', async () => {
    const sse = sseStream();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(sse.stream)));
    renderDetail('bot-3');
    const textarea = await submitDetail('Stay');
    expect(screen.getByRole('button', { name: 'Thinking' })).toBeTruthy();
    expect(textarea.closest('[inert]')).not.toBeNull();

    await act(async () => {
      sse.push(frame({ t: 'content', text: 'Ok.' }));
      sse.push(frame({ t: 'done', credits: 0.1 }));
      sse.close();
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Thinking' })).toBeNull());
    expect(textarea.closest('[inert]')).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });
});

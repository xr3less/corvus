import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MOCK_BOTS, TRIAL_DEAL, TRIAL_EXPIRED_MESSAGE, type MockBot } from '@/lib/bots';
import BotDetailPage from './page';

/* The route id comes from useParams; tests steer it per case. */
let mockRouteId = 'bot-3';
let mockTab: string | null = null;

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: mockRouteId }),
  useSearchParams: () => ({ get: (key: string) => (key === 'tab' ? mockTab : null) }),
}));

/* The trial sentences are byte-locked in `lib/bots.ts` and imported by the
   page, so the test reads the same source instead of retyping them. */
const TRIAL_LINE = 'Free while in preview — limits not enforced yet.';
const COST_NOTE =
  'Her değişiklik kredi harcar · platform kaynaklı hata olursa tekrar denemek ücretsiz.';

/* KI-030: the detail page is empty-not-example, so every mock-id render needs
   an injected list — tests steered to real page behavior, never mock ghosts. */
function botById(id: string): MockBot {
  const bot = MOCK_BOTS.find((entry) => entry.id === id);
  if (bot === undefined) throw new Error(`unknown fixture bot: ${id}`);
  return bot;
}
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

/* F6 source guard: the English copy this page used to render must not come
   back. The scan runs over the file's RENDERABLE copy — comments stripped,
   then only quoted literals and JSX text — so a string parked in a branch no
   test happens to mount still trips it, while an explanatory comment quoting
   the server's own English feed shape (the M-10 note) stays legal. Terms whose
   owner is another file are excluded on purpose — `TRIAL_DEAL` /
   `TRIAL_EXPIRED_MESSAGE` in `lib/bots.ts`, and the shared components'
   labels — and the boundary is pinned by its own test below. Asserted as a
   set AND its size (LESSONS §8): a removal that empties the list must not
   read as a pass. */
const RETIRED_COPY = [
  'You are logged out — log in again',
  'This bot is not saved on the server yet',
  'No draft exists for this bot yet.',
  'Nothing to roll back to yet.',
  'Continue interview',
  'Coming soon',
  'Save version',
  'Saved as draft v',
  'Rolled back to v',
  'preparing invite',
  'Open install link',
  'Describe a change…',
  'Submitted changes',
  'Simulation result',
  'No description yet',
  'Loading live activity…',
  'Could not load activity',
  'No scan yet — enter a server ID',
  'Run scan',
  'Simulate join',
  'Save as draft',
  'Start build',
  'Follow the build',
  'What this bot does',
  'Recent activity',
  '← All bots',
  'Back to your bots',
  'No bot with this address',
  'Needs attention —',
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

function renderDetail(id: string, bots?: MockBot[]) {
  mockRouteId = id;
  /* No injected list + mock id = honest unknown-id empty by design. Tests that
     exercise a bot pass the injected fixture list explicitly. */
  const injected = bots ?? (id.startsWith('bot-') ? [botById(id)] : undefined);
  return render(injected === undefined ? <BotDetailPage /> : <BotDetailPage bots={injected} />);
}

/* KI-033: the expired flag is the same prop the dashboard home takes — this
   page reads no new endpoint for it. */
function renderExpiredDetail(id: string, bots?: MockBot[]) {
  mockRouteId = id;
  const injected = bots ?? (id.startsWith('bot-') ? [botById(id)] : undefined);
  return render(<BotDetailPage bots={injected} trialExpired />);
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
    const back = screen.getByRole('link', { name: '← Tüm botlar' });
    expect(back.getAttribute('href')).toBe('/dashboard/bots');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows an honest empty state for an unknown id', () => {
    renderDetail('no-such-bot');
    expect(screen.getByText('Bu adreste bir bot yok — silinmiş olabilir.')).toBeTruthy();
    const back = screen.getByRole('link', { name: 'Botlarına dön' });
    expect(back.getAttribute('href')).toBe('/dashboard/bots');
    expect(screen.queryByRole('tab', { name: 'Genel bakış' })).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows the wired action row and one-card detail tabs', () => {
    renderDetail('bot-3');
    for (const label of ['Aç', 'Görüşmeyi sürdür · Yakında', 'Sürümü kaydet', 'Geri al']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    /* Continue interview cannot resume an existing bot's round (/interview
       starts a new one with a typed name), so it is honestly disabled with the
       repo's own marker rather than being an enabled button that goes nowhere. */
    const interview = screen.getByRole('button', {
      name: 'Görüşmeyi sürdür · Yakında',
    }) as HTMLButtonElement;
    expect(interview.disabled).toBe(true);
    expect(interview.getAttribute('aria-disabled')).toBe('true');
    expect(interview.getAttribute('title')).toBe('Yakında');
    expect(screen.getByRole('tab', { name: 'Genel bakış' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Etkinlik' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Ön kontrol' })).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('repro: Continue interview is honestly disabled, never a dead enabled button', () => {
    /* Reproduce-first: this failed while the header rendered an enabled
       <button> with no onClick, no navigation and no disabled state. */
    const fetchStub = vi.fn(() => Promise.reject(new Error('network disabled in tests')));
    vi.stubGlobal('fetch', fetchStub);
    renderDetail('bot-3');
    const interview = screen.getByRole('button', {
      name: 'Görüşmeyi sürdür · Yakında',
    }) as HTMLButtonElement;
    expect(interview.disabled).toBe(true);
    expect(interview.getAttribute('aria-disabled')).toBe('true');
    expect(interview.getAttribute('title')).toBe('Yakında');
    /* Clicking it does nothing and reaches no endpoint: no request, no note —
       the surface is not silently half-wired. */
    const calls = fetchStub.mock.calls.length;
    fireEvent.click(interview);
    expect(fetchStub).toHaveBeenCalledTimes(calls);
    expect(interview.disabled).toBe(true);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('lands on the tab named by ?tab= from a card deep action', async () => {
    mockTab = 'activity';
    try {
      renderDetail('bot-3');
      expect(screen.getByRole('tab', { name: 'Etkinlik' }).getAttribute('aria-selected')).toBe(
        'true',
      );
      expect(screen.getByRole('region', { name: 'Son etkinlik' })).toBeTruthy();
      /* KI-030: error feed is honest — no labeled examples passed off as data. */
      await screen.findByText('Etkinlik yüklenemedi — bağlantını kontrol edip tekrar dene.');
    } finally {
      mockTab = null;
    }
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows exactly one detail card at a time', async () => {
    renderDetail('bot-3');
    expect(screen.getByRole('region', { name: 'Bu bot ne yapıyor' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Son etkinlik' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Ön kontrol' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Etkinlik' }));
    expect(screen.getByRole('region', { name: 'Son etkinlik' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Bu bot ne yapıyor' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Ön kontrol' })).toBeNull();
    await screen.findByText('Etkinlik yüklenemedi — bağlantını kontrol edip tekrar dene.');

    fireEvent.click(screen.getByRole('tab', { name: 'Ön kontrol' }));
    expect(screen.getByRole('region', { name: 'Ön kontrol' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Bu bot ne yapıyor' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Son etkinlik' })).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('keeps the AI box pinned with chips, composer and cost line', () => {
    renderDetail('bot-3');
    const group = screen.getByRole('group', { name: 'Önerilen değişiklikler' });
    expect(within(group).getAllByRole('button')).toHaveLength(3);
    expect(screen.getByPlaceholderText('İstediğin değişikliği anlat…')).toBeTruthy();
    expect(screen.getByText(COST_NOTE)).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('submitting composer text appends the thread row and opens a stream to /api/chat', async () => {
    const sse = sseStream();
    const fetchStub = vi.fn().mockResolvedValue(streamResponse(sse.stream));
    vi.stubGlobal('fetch', fetchStub);
    renderDetail('bot-3');
    expect(screen.queryByRole('list', { name: 'Gönderilen değişiklikler' })).toBeNull();
    await submitDetail('Make the header bolder');
    const thread = await screen.findByRole('list', { name: 'Gönderilen değişiklikler' });
    expect(thread.textContent).toContain('Sen: Make the header bolder');
    /* No files attached, so the user row carries no meta line at all. */
    expect(thread.textContent).not.toContain('ek dosya');
    expect(within(thread).queryByText(/ek dosya/)).toBeNull();
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

  /* M-6: this test used to assert the user row showed "1 attachment(s)" and
     let the turn through — which was the defect: the count was rendered while
     the body carried nothing, so the file was destroyed silently. Attachments
     cannot be transmitted (the chat API validates text only and the persona
     lane's first route is text-only), so the honest contract is a refusal with
     the draft intact. Pinned here at the page level, where the defect lived. */
  it('refuses an attachment submit in words and transmits nothing', async () => {
    const sse = sseStream();
    const fetchStub = vi.fn().mockResolvedValue(streamResponse(sse.stream));
    vi.stubGlobal('fetch', fetchStub);
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

      const callsBefore = fetchStub.mock.calls.length;
      fireEvent.change(textarea, { target: { value: 'Use this layout' } });
      fireEvent.keyDown(textarea, { key: 'Enter' });

      /* Nothing was sent... */
      expect(fetchStub.mock.calls.length).toBe(callsBefore);
      /* ...the person is told why, in words... */
      expect(screen.getByRole('alert').textContent).toContain('Image sending is not connected yet');
      /* ...no turn was recorded... */
      expect(screen.queryByRole('list', { name: 'Gönderilen değişiklikler' })).toBeNull();
      /* ...and neither the typed draft nor the staged image was destroyed. */
      expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe(
        'Use this layout',
      );
      expect(screen.getByRole('button', { name: 'Open preview of shot.png' })).toBeTruthy();
    } finally {
      if (hadCreateObjectURL) {
        URL.createObjectURL = originalCreateObjectURL;
      } else {
        delete (URL as unknown as Record<string, unknown>).createObjectURL;
      }
    }

    expect(consoleError).not.toHaveBeenCalled();
  });

  it('second turn carries the completed first turn as history', async () => {
    const first = sseStream();
    const second = sseStream();
    /* Mount-time trial signal (fail-open 401: no banner) + draft load (no
       draft for mock ids). /api/conversations* is routed to honest stubs so
       the Wave-1 open/append never shifts the chat slots. */
    const convId = '22222222-3333-4444-8555-666666666666';
    const queue: unknown[] = [
      { ok: false, status: 401, json: async () => ({}) },
      { ok: false, status: 404, json: async () => ({}) },
      streamResponse(first.stream),
      streamResponse(second.stream),
    ];
    const fetchStub = vi.fn(async (url: string, init?: RequestInit) => {
      const href = String(url);
      if (href === '/api/conversations' && (init?.method ?? 'GET') === 'POST') {
        return { ok: true, status: 200, json: async () => ({ conversationId: convId }) };
      }
      if (href === '/api/conversations' && (init?.method ?? 'GET') === 'GET') {
        return { ok: true, status: 200, json: async () => ({ conversations: [] }) };
      }
      if (href === `/api/conversations/${convId}` && init?.method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ saved: 2 }) };
      }
      if (href.startsWith('/api/conversations/') && (init?.method ?? 'GET') === 'GET') {
        return { ok: true, status: 200, json: async () => ({ turns: [] }) };
      }
      const next = queue.shift();
      if (next === undefined) throw new Error(`unexpected fetch: ${href}`);
      return next;
    });
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
    /* Trial + draft + open + chat1 + append1 + chat2 = 6 (append2 never fires:
       the second stream stays open). */
    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(6));
    const chatCalls = fetchStub.mock.calls.filter((call) => String(call[0]) === '/api/chat');
    expect(chatCalls).toHaveLength(2);
    const openCall = fetchStub.mock.calls.find((call) => String(call[0]) === '/api/conversations');
    expect(JSON.parse(String((openCall?.[1] as RequestInit).body))).toEqual({ botId: null });
    const secondInit = chatCalls[1]?.[1] as RequestInit;
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

  it('a 401 says logged-out in plain words and Tekrar dene re-issues after login', async () => {
    const sse = sseStream();
    /* Mount-time trial signal (fail-open 401) + draft load (no draft for mock
       ids); /api/conversations* answers honest stubs so the Wave-1 open/append
       never shifts the chat slots. */
    const convId = '22222222-3333-4444-8555-666666666666';
    const queue: unknown[] = [
      { ok: false, status: 401, json: async () => ({}) },
      { ok: false, status: 404, json: async () => ({}) },
      {
        ok: false,
        status: 401,
        json: async () => ({ error: 'unauthorized' }),
      },
      streamResponse(sse.stream),
    ];
    const fetchStub = vi.fn(async (url: string, init?: RequestInit) => {
      const href = String(url);
      if (href === '/api/conversations' && (init?.method ?? 'GET') === 'POST') {
        return { ok: true, status: 200, json: async () => ({ conversationId: convId }) };
      }
      if (href === '/api/conversations' && (init?.method ?? 'GET') === 'GET') {
        return { ok: true, status: 200, json: async () => ({ conversations: [] }) };
      }
      if (href === `/api/conversations/${convId}` && init?.method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ saved: 2 }) };
      }
      if (href.startsWith('/api/conversations/') && (init?.method ?? 'GET') === 'GET') {
        return { ok: true, status: 200, json: async () => ({ turns: [] }) };
      }
      const next = queue.shift();
      if (next === undefined) throw new Error(`unexpected fetch: ${href}`);
      return next;
    });
    vi.stubGlobal('fetch', fetchStub);
    renderDetail('bot-3');
    await submitDetail('Add a welcome rule');

    /* The sentence is written by `lib/chat/thread.ts` (outside this task's
       scope, still English); the control beside it is the shared chat-thread
       component's, which ships Turkish. */
    await screen.findByText('You are logged out — log in again, then press Retry.');

    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));
    /* Trial + draft + open + failed chat + retry chat = 5 (appends land after
       the stream settles, not before this assertion). */
    await waitFor(() => {
      const chats = fetchStub.mock.calls.filter((call) => String(call[0]) === '/api/chat');
      expect(chats).toHaveLength(2);
    });

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
    const group = screen.getByRole('group', { name: 'Önerilen değişiklikler' });
    fireEvent.click(within(group).getByRole('button', { name: 'XP ödülleri' }));
    expect(screen.queryByRole('list', { name: 'Gönderilen değişiklikler' })).toBeNull();
    fireEvent.click(within(group).getByRole('button', { name: 'Moderasyon kuralı' }));
    expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe(
      'Moderasyon kuralı',
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('updates the header for a trial bot and hides the trial line for a live bot', () => {
    const { unmount } = renderDetail('bot-2');
    expect(screen.getByRole('heading', { name: 'Draft Arena' })).toBeTruthy();
    expect(screen.getByText(TRIAL_DEAL)).toBeTruthy();
    unmount();

    renderDetail('bot-1');
    expect(screen.getByRole('heading', { name: 'Study Hall' })).toBeTruthy();
    expect(screen.queryByText(TRIAL_DEAL)).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  /* KI-033: the trial is enforced now, so the trial line states the live deal
     (the KI-030 "not enforced yet" line is gone) and an expired trial says what
     actually happened, in the locked words. */
  it('states the enforced trial deal on the trial line, never the retired preview line', () => {
    renderDetail('bot-2');
    expect(screen.getByText(TRIAL_DEAL)).toBeTruthy();
    expect(screen.queryByText(TRIAL_LINE)).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders the locked expired line when the trial has ended, on any bot status', () => {
    const { unmount } = renderExpiredDetail('bot-2');
    expect(screen.getByRole('status').textContent).toBe(TRIAL_EXPIRED_MESSAGE);
    unmount();

    /* Ruling 4: reads stay open, so a live bot is still shown — with the pause
       line, because the account's bots are paused whatever their own status. */
    renderExpiredDetail('bot-1');
    expect(screen.getByRole('heading', { name: 'Study Hall' })).toBeTruthy();
    expect(screen.getByText(TRIAL_EXPIRED_MESSAGE)).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows no expired line when the trial has not ended', () => {
    renderDetail('bot-2');
    expect(screen.getByText(TRIAL_DEAL)).toBeTruthy();
    expect(screen.queryByText(TRIAL_EXPIRED_MESSAGE)).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('lights the expired line from GET /api/session/trial when the endpoint says expired', async () => {
    /* Injected fixtures skip the bot-list fetch but NOT the expiry signal; the
       injected trialExpired prop stays undefined so the page reads the signal
       endpoint once on mount (fail-open: a 404 draft + an expired flag still
       render the banner on the real bot header). */
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(String(url));
        if (String(url) === '/api/session/trial') {
          return { ok: true, status: 200, json: async () => ({ trialExpired: true }) };
        }
        throw new Error('network disabled in tests');
      }),
    );
    mockRouteId = 'bot-3';
    render(<BotDetailPage trialExpired={undefined} bots={[botById('bot-3')]} />);

    expect(await screen.findByText(TRIAL_EXPIRED_MESSAGE)).toBeTruthy();
    expect(calls).toContain('/api/session/trial');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('keeps the expired line off when the signal endpoint fails (fail-open)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url) === '/api/session/trial') {
          return { ok: false, status: 401, json: async () => ({}) };
        }
        throw new Error('network disabled in tests');
      }),
    );
    mockRouteId = 'bot-3';
    render(<BotDetailPage bots={undefined} />);

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText(TRIAL_EXPIRED_MESSAGE)).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders the honest overview fallback with no saved draft', () => {
    renderDetail('bot-1');
    const study = screen.getByRole('region', { name: 'Bu bot ne yapıyor' });
    expect(within(study).getByRole('heading', { name: 'Bu bot ne yapıyor' })).toBeTruthy();
    /* KI-030: no mock specs — the overview says so until a draft is saved. */
    expect(study.textContent).toContain('Henüz açıklama yok — kaydedilen taslak burada anlatacak.');
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
    fireEvent.click(screen.getByRole('tab', { name: 'Etkinlik' }));
    expect(screen.getByText('Etkinlik yükleniyor…')).toBeTruthy();

    const region = screen.getByRole('region', { name: 'Son etkinlik' });
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
    fireEvent.click(screen.getByRole('tab', { name: 'Etkinlik' }));
    await screen.findByText('Henüz etkinlik yok.');
    expect(screen.queryByText('Example')).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows the honest error when the feed is unauthorized', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );
    renderDetail('bot-3');
    fireEvent.click(screen.getByRole('tab', { name: 'Etkinlik' }));
    /* KI-030: no example rows passed off as the account's activity. */
    await screen.findByText('Etkinlik yüklenemedi — bağlantını kontrol edip tekrar dene.');
    const region = screen.getByRole('region', { name: 'Son etkinlik' });
    expect(region.textContent).not.toContain('Published');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows the honest error when the request rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    renderDetail('bot-2');
    fireEvent.click(screen.getByRole('tab', { name: 'Etkinlik' }));
    await screen.findByText('Etkinlik yüklenemedi — bağlantını kontrol edip tekrar dene.');
    expect(screen.getByRole('region', { name: 'Son etkinlik' }).textContent).not.toContain(
      'Published',
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('ignores a stale feed response after the bot changes', async () => {
    const first = deferred<FetchResponse>();
    /* Mount-time trial signals (fail-open 401) interleave with draft loads
       (no draft for mock ids) and the feed calls. */
    const noDraft = () => ({ ok: false, status: 404, json: async () => ({}) });
    const noSignal = () => ({ ok: false, status: 401, json: async () => ({}) });
    const fetchStub = vi
      .fn()
      .mockResolvedValueOnce(noSignal())
      .mockResolvedValueOnce(noDraft())
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce(noSignal())
      .mockResolvedValueOnce(noDraft())
      .mockResolvedValueOnce(
        respOk([{ at: '2026-09-13T11:00:00.000Z', kind: 'publish', text: 'Draft Arena only' }]),
      );
    vi.stubGlobal('fetch', fetchStub);
    const firstRender = renderDetail('bot-1');
    fireEvent.click(screen.getByRole('tab', { name: 'Etkinlik' }));
    firstRender.unmount();

    renderDetail('bot-2');
    fireEvent.click(screen.getByRole('tab', { name: 'Etkinlik' }));
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

  /* The scanned text: comments out, then only quoted literals and JSX text. */
  function renderableCopy(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '');
  }

  function retiredOffenders(source: string): string[] {
    const blob = renderableCopy(source);
    return RETIRED_COPY.filter((term) => blob.includes(term));
  }

  /* F6 source guard: the retire list is real (29 terms) and none of the retired
     English copy survives as renderable copy anywhere in the page source. */
  it('keeps every retired English string out of the page source', () => {
    expect(RETIRED_COPY.length).toBe(29);
    const source = readFileSync(
      path.join(process.cwd(), 'app', 'dashboard', 'bots', '[id]', 'page.tsx'),
      'utf8',
    );
    expect(retiredOffenders(source)).toEqual([]);
  });

  /* The instrument check, in memory only: the same helper over a text that does
     contain one retired term must trip, a comment quoting one must NOT trip,
     and the real page source must stay untouched. Without this the guard above
     could be green because it is blind. */
  it('trips on the recorder when a retired string is present — in-memory only', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'app', 'dashboard', 'bots', '[id]', 'page.tsx'),
      'utf8',
    );
    const heading = '<h2 className={styles.cardTitle}>Son etkinlik</h2>';
    const variant = source.replace(
      heading,
      '<h2 className={styles.cardTitle}>Recent activity</h2>',
    );
    /* The cut landed, and the real file is untouched. */
    expect(variant).not.toBe(source);
    expect(retiredOffenders(source)).toEqual([]);
    expect(retiredOffenders(variant)).toEqual(['Recent activity']);
    /* A comment quoting retired copy is not renderable copy and must not trip:
       the real file keeps one such note (the M-10 'Rolled back to vN' shape). */
    const commented = source.replace(
      heading,
      `{/* mirrors 'Rolled back to vN' from the feed */}\n${heading}`,
    );
    expect(commented).not.toBe(source);
    expect(commented).toContain('Rolled back to v');
    expect(retiredOffenders(commented)).toEqual([]);
  });

  /* The other side of the boundary: the two English sources this file does not
     own are named, so a future reader does not "fix" them here and drift one
     surface into a second wording. */
  it('still reads the trial sentences from lib/bots.ts and shows them as-is', () => {
    renderExpiredDetail('bot-2');
    /* Byte-locked in lib/bots.ts; the page imports the constant. */
    expect(screen.getByRole('status').textContent).toBe(TRIAL_EXPIRED_MESSAGE);
    expect(TRIAL_EXPIRED_MESSAGE).toContain('deneme süren bitti');
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('bot detail wiring', () => {
  interface ApiCall {
    url: string;
    init?: RequestInit;
  }

  function draftPayload(version: number, behaviors: unknown[] = []) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        version,
        spec: { version: 1, behaviors },
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

  it('loads the draft on mount and posts the draft version on Save version', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Sürümü kaydet' }));
    /* KI-030 locked copy: Version N saved — never "Published vN". */
    await screen.findByText(/Sürüm 5 kaydedildi\. Botun Discord’da henüz canlıya alınmadı\./);
    const publish = apiCallsTo(calls, '/api/spec/publish');
    expect(publish).toHaveLength(1);
    expect(publish[0]?.init?.method).toBe('POST');
    /* A mock display id never travels as a fake uuid (D-112): it is coerced to null. */
    expect(bodyOf(publish[0])).toEqual({ botId: null, version: 5 });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('Save version names the failing checks on a preflight-red 409', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Sürümü kaydet' }));
    await screen.findByText(/başarısız kontroller: permissions/);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('Save version 401 shows logged-out with a login link', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Sürümü kaydet' }));
    await screen.findByText(/Oturumun kapanmış/);
    const login = screen.getByRole('link', { name: 'Giriş yap' });
    expect(login.getAttribute('href')).toBe('/api/auth/login');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('Save version 404 stays honest instead of faking success', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Sürümü kaydet' }));
    await screen.findByText(/henüz sunucuya kaydedilmedi/);
    expect(screen.queryByText(/Sürüm .* kaydedildi/)).toBeNull();
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

    fireEvent.click(screen.getByRole('button', { name: 'Geri al' }));
    await screen.findByText('v4 sürümüne dönüldü.');
    const rollback = apiCallsTo(calls, '/api/spec/rollback');
    expect(rollback).toHaveLength(1);
    expect(bodyOf(rollback[0])).toEqual({ botId: null, version: 4 });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('Rollback derives its target from prod, not the draft head', async () => {
    const calls: ApiCall[] = [];
    stubApi(
      [
        { match: (url) => url.startsWith('/api/spec/draft'), respond: () => draftPayload(6) },
        {
          match: (url) => url.startsWith('/api/bots/bot-3/activity'),
          respond: () =>
            respOk([
              { kind: 'publish', text: 'Published v5', at: '2026-09-23T05:00:00.000Z' },
              { kind: 'publish', text: 'Published v4', at: '2026-09-22T05:00:00.000Z' },
            ]),
        },
        {
          match: (url) => url === '/api/spec/rollback',
          respond: () => ({ ok: true, status: 200, json: async () => ({ version: 4 }) }),
        },
      ],
      calls,
    );
    renderDetail('bot-3');
    await waitFor(() => expect(apiCallsTo(calls, '/api/spec/draft?botId=bot-3')).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: 'Geri al' }));
    /* Draft head is v6 but prod is v5, so the target is prod - 1 = v4.
       Draft-minus-one (v5) would 404 against the route contract. */
    await screen.findByText('v4 sürümüne dönüldü.');
    const rollback = apiCallsTo(calls, '/api/spec/rollback');
    expect(rollback).toHaveLength(1);
    expect(bodyOf(rollback[0])).toEqual({ botId: null, version: 4 });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('Rollback with no published version rolls nothing back and posts nothing', async () => {
    const calls: ApiCall[] = [];
    stubApi(
      [
        {
          match: (url) => url.startsWith('/api/spec/draft'),
          respond: () => ({ ok: false, status: 404, json: async () => ({}) }),
        },
        {
          match: (url) => url.startsWith('/api/bots/bot-3/activity'),
          respond: () => respOk([]),
        },
      ],
      calls,
    );
    renderDetail('bot-3');
    await waitFor(() => expect(apiCallsTo(calls, '/api/spec/draft?botId=bot-3')).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: 'Geri al' }));
    await screen.findByText('Henüz geri dönebileceğin bir sürüm yok.');
    expect(apiCallsTo(calls, '/api/spec/rollback')).toHaveLength(0);
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
    fireEvent.click(screen.getByRole('button', { name: 'Aç' }));
    await screen.findByText('davet hazırlanıyor…');

    const link = await screen.findByRole('link', {
      name: 'Kurulum bağlantısını aç (ortak test uygulaması — kendi botunun kurulumu henüz bağlı değil)',
    });
    expect(link.getAttribute('href')).toBe('https://discord.com/oauth2/authorize?client_id=123');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(screen.getByText('Send Messages — greetings')).toBeTruthy();
    expect(apiCallsTo(calls, '/api/invite?botId=bot-3').length).toBeGreaterThan(0);
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
    fireEvent.click(screen.getByRole('tab', { name: 'Ön kontrol' }));
    fireEvent.change(screen.getByLabelText('Sunucu kimliği'), {
      target: { value: '123456789012345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Taramayı çalıştır' }));

    await screen.findByText('Taranıyor…');
    await screen.findByText('installed: The bot joined the server.', undefined, { timeout: 5000 });
    const starts = apiCallsTo(calls, '/api/preflight/start');
    expect(starts).toHaveLength(1);
    expect(bodyOf(starts[0])).toEqual({
      botId: null,
      guildId: '123456789012345678',
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
    fireEvent.click(screen.getByRole('button', { name: 'Katılımı simüle et' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Taslak olarak kaydet' }));

    await screen.findByText('Taslak olarak kaydedildi: v6.');
    const patches = apiCallsTo(calls, '/api/spec/patch');
    expect(patches).toHaveLength(1);
    const body = bodyOf(patches[0]);
    expect(body.botId).toBeNull();
    expect(body.baseVersion).toBe(5);
    expect(body.summary).toBe('Greet newcomers');
    expect(Array.isArray(body.behaviors)).toBe(true);
    expect(consoleError).not.toHaveBeenCalled();
  });

  /* DATA-LOSS BLOCKER: POST /api/spec/patch is a full replacement, so a save
     built from an empty local cache would post a note-only head and wipe a
     non-empty server draft. Reproduce-first: these fail while the save falls
     back to `draftBehaviors ?? []` with a fabricated baseVersion of 1. */
  const SERVER_BEHAVIORS = [
    { kind: 'welcome', channel: '#general' },
    { kind: 'moderation', warnLimit: 3 },
  ];

  it('repro: a save with an empty local cache appends to the server draft, never wipes it', async () => {
    /* The mount load 500s, so the local cache stays empty while the server
       still holds v5 with two behaviors. The fix appends the note to the data
       the fresh read RETURNS, so the new head is draft + note. */
    const calls: ApiCall[] = [];
    let draftReads = 0;
    stubApi(
      [
        {
          match: (url) => url.startsWith('/api/spec/draft'),
          respond: () => {
            draftReads += 1;
            /* First read (mount) fails: the cache is never populated. */
            if (draftReads === 1) return { ok: false, status: 500, json: async () => ({}) };
            return draftPayload(5, SERVER_BEHAVIORS);
          },
        },
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
    fireEvent.click(screen.getByRole('button', { name: 'Taslak olarak kaydet' }));

    await screen.findByText('Taslak olarak kaydedildi: v6.');
    const patches = apiCallsTo(calls, '/api/spec/patch');
    expect(patches).toHaveLength(1);
    const body = bodyOf(patches[0]);
    /* The real head version, never a fabricated 1. */
    expect(body.baseVersion).toBe(5);
    /* The prior draft is still there — the note is appended, not substituted. */
    expect(body.behaviors).toEqual([
      ...SERVER_BEHAVIORS,
      { kind: 'note', title: 'Note', detail: 'Greet newcomers' },
    ]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('repro: an unreadable draft refuses the save instead of overwriting it', async () => {
    /* Both reads fail, so this page cannot know what the server holds. It must
       refuse and say so — never post a note-only head over a draft it never
       read, and never invent a baseVersion. */
    const calls: ApiCall[] = [];
    stubApi(
      [
        {
          match: (url) => url.startsWith('/api/spec/draft'),
          respond: () => ({ ok: false, status: 500, json: async () => ({}) }),
        },
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
    fireEvent.click(screen.getByRole('button', { name: 'Taslak olarak kaydet' }));

    await screen.findByText('Mevcut taslak yüklenemedi — hiçbir şey kaydedilmedi. Tekrar dene.');
    /* Nothing was posted: no wipe, no fake success. */
    expect(apiCallsTo(calls, '/api/spec/patch')).toHaveLength(0);
    expect(screen.queryByText(/Taslak olarak kaydedildi/)).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('a save with no draft on the server says so and posts nothing', async () => {
    /* A definitive 404 'no draft yet' is not the same as an unreadable read:
       there is no head to protect, and the honest line is the existing one. */
    const calls: ApiCall[] = [];
    stubApi(
      [
        {
          match: (url) => url.startsWith('/api/spec/draft'),
          respond: () => ({
            ok: false,
            status: 404,
            json: async () => ({ error: 'no draft yet' }),
          }),
        },
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
    fireEvent.click(screen.getByRole('button', { name: 'Taslak olarak kaydet' }));

    await screen.findByText('Bu bot için henüz taslak yok.');
    expect(apiCallsTo(calls, '/api/spec/patch')).toHaveLength(0);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('a loaded draft still appends the note to the existing behaviors', async () => {
    /* The normal path is unchanged: cached head + its behaviors + the note. */
    const calls: ApiCall[] = [];
    stubApi(
      [
        {
          match: (url) => url.startsWith('/api/spec/draft'),
          respond: () => draftPayload(5, SERVER_BEHAVIORS),
        },
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
    fireEvent.click(screen.getByRole('button', { name: 'Taslak olarak kaydet' }));

    await screen.findByText('Taslak olarak kaydedildi: v6.');
    const patches = apiCallsTo(calls, '/api/spec/patch');
    expect(patches).toHaveLength(1);
    const body = bodyOf(patches[0]);
    expect(body.baseVersion).toBe(5);
    expect(body.behaviors).toEqual([
      ...SERVER_BEHAVIORS,
      { kind: 'note', title: 'Note', detail: 'Greet newcomers' },
    ]);
    /* The head was already cached, so no extra draft read was needed. */
    expect(apiCallsTo(calls, '/api/spec/draft?botId=bot-3')).toHaveLength(1);
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
    fireEvent.click(screen.getByRole('button', { name: 'Sürümü kaydet' }));
    await screen.findByText(/Sürüm 5 kaydedildi\. Botun Discord’da henüz canlıya alınmadı\./);
    const publish = apiCallsTo(calls, '/api/spec/publish');
    /* A real server id is passed through unchanged on writes. */
    expect(bodyOf(publish[0])).toEqual({ botId: liveId, version: 5 });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows the logged-out line and Tekrar dene when the live list answers 401', async () => {
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

    await screen.findByText(/Oturumun kapanmış/);
    expect(screen.getByRole('link', { name: 'Giriş yap' }).getAttribute('href')).toBe(
      '/api/auth/login',
    );
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  /* KI-014: a started build had no path to the progress panel — the real run
     id now travels into the dashboard's ?runId= link. Reproduce-first: these
     fail while the detail page has no build-start action. */
  async function typeBrief(text: string): Promise<void> {
    fireEvent.click(screen.getByRole('button', { name: 'Open prompt input' }));
    const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
    await waitFor(() => expect(document.activeElement).toBe(textarea));
    fireEvent.change(textarea, { target: { value: text } });
  }

  it('starts a build and links to the live progress with the real run id', async () => {
    const calls: ApiCall[] = [];
    const liveId = '11111111-2222-4333-8444-555555555555';
    const runId = '99999999-8888-4777-8666-555555555555';
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
          match: (url) => url === '/api/builder/start',
          respond: () => ({
            ok: true,
            status: 200,
            json: async () => ({ runId, phase: 'queued' }),
          }),
        },
      ],
      calls,
    );
    renderDetail(liveId);
    expect(await screen.findByRole('heading', { name: 'Live Study' })).toBeTruthy();
    await typeBrief('Add a welcome rule');
    fireEvent.click(screen.getByRole('button', { name: 'Kurulumu başlat' }));

    const link = await screen.findByRole('link', { name: 'Kurulum ilerlemesini aç' });
    expect(link.getAttribute('href')).toBe(`/dashboard?runId=${runId}`);
    const starts = apiCallsTo(calls, '/api/builder/start');
    expect(starts).toHaveLength(1);
    expect(starts[0]?.init?.method).toBe('POST');
    expect(bodyOf(starts[0])).toEqual({ botId: liveId, brief: 'Add a welcome rule' });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('a mock bot cannot start a build and says so without a fake link', async () => {
    const calls: ApiCall[] = [];
    stubApi(
      [
        {
          match: (url) => url.startsWith('/api/spec/draft'),
          respond: () => ({ ok: false, status: 404, json: async () => ({}) }),
        },
      ],
      calls,
    );
    renderDetail('bot-3');
    await typeBrief('Add a welcome rule');
    fireEvent.click(screen.getByRole('button', { name: 'Kurulumu başlat' }));

    await screen.findByText(/henüz sunucuya kaydedilmedi/);
    expect(screen.queryByRole('link', { name: 'Kurulum ilerlemesini aç' })).toBeNull();
    expect(apiCallsTo(calls, '/api/builder/start')).toHaveLength(0);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('a failed start shows the honest error and never a fake link', async () => {
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
          match: (url) => url === '/api/builder/start',
          respond: () => ({
            ok: false,
            status: 500,
            json: async () => ({ error: 'could not start build' }),
          }),
        },
      ],
      calls,
    );
    renderDetail(liveId);
    expect(await screen.findByRole('heading', { name: 'Live Study' })).toBeTruthy();
    await typeBrief('Add a welcome rule');
    fireEvent.click(screen.getByRole('button', { name: 'Kurulumu başlat' }));

    await screen.findByText('Kurulum başlatılamadı — tekrar dene.');
    expect(screen.queryByRole('link', { name: 'Kurulum ilerlemesini aç' })).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  /* KI-033: a trial-expired account is refused with 403
     { error: 'trial_expired', message: <the honest sentence> }. The page must
     show the sentence the server wrote, byte-identical — a bare code is not
     something a person can act on. Reproduce-first: this failed while the 403
     fell through to the generic 'Kurulum başlatılamadı — tekrar dene.' */
  it('a trial-expired start renders the server’s locked sentence byte-identical', async () => {
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
          match: (url) => url === '/api/builder/start',
          respond: () => ({
            ok: false,
            status: 403,
            json: async () => ({
              error: 'trial_expired',
              message: TRIAL_EXPIRED_MESSAGE,
            }),
          }),
        },
      ],
      calls,
    );
    renderDetail(liveId);
    expect(await screen.findByRole('heading', { name: 'Live Study' })).toBeTruthy();
    await typeBrief('Add a welcome rule');
    fireEvent.click(screen.getByRole('button', { name: 'Kurulumu başlat' }));

    const note = await screen.findByText(TRIAL_EXPIRED_MESSAGE);
    expect(note.textContent).toBe(TRIAL_EXPIRED_MESSAGE);
    /* The code never reaches the reader, and no fake link is offered. */
    expect(document.body.textContent ?? '').not.toContain('trial_expired');
    expect(screen.queryByText('Kurulum başlatılamadı — tekrar dene.')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Kurulum ilerlemesini aç' })).toBeNull();
    expect(apiCallsTo(calls, '/api/builder/start')).toHaveLength(1);
    expect(consoleError).not.toHaveBeenCalled();
  });

  /* KI-036twin: the streamed thread is content — Save and Start stitch the
     thread user-turns plus the composer; a started build shows the real
     inline stepper next to the kept ?runId= link. */
  function liveBotHandlers(
    liveId: string,
    chat: { respond: () => unknown },
    extra: { match: (url: string) => boolean; respond: () => unknown }[],
  ) {
    return [
      {
        match: (url: string) => url === '/api/bots',
        respond: () => ({
          ok: true,
          status: 200,
          json: async () => [{ id: liveId, name: 'Live Study', status: 'live' }],
        }),
      },
      { match: (url: string) => url.startsWith('/api/spec/draft'), respond: () => draftPayload(5) },
      { match: (url: string) => url === '/api/chat', respond: () => chat.respond() },
      ...extra,
    ];
  }

  function queuedChat() {
    const queue: ReadableStream<Uint8Array>[] = [];
    return {
      queue,
      respond: () => {
        const next = queue.shift();
        if (!next) throw new Error('no queued chat stream');
        return streamResponse(next);
      },
    };
  }

  async function completeTurn(chat: ReturnType<typeof queuedChat>, text: string, reply: string) {
    const sse = sseStream();
    chat.queue.push(sse.stream);
    await submitDetail(text);
    await act(async () => {
      sse.push(frame({ t: 'content', text: reply }));
      sse.push(frame({ t: 'done', credits: 0.05 }));
      sse.close();
    });
    await waitFor(() => expect(screen.getByText(reply)).toBeTruthy());
  }

  const STITCHED = 'First wish\nSecond wish\nComposer tail';

  it('Save as draft stitches two thread turns plus the composer, in order', async () => {
    const calls: ApiCall[] = [];
    const liveId = '11111111-2222-4333-8444-555555555555';
    const chat = queuedChat();
    stubApi(
      liveBotHandlers(liveId, chat, [
        {
          match: (url) => url === '/api/spec/patch',
          respond: () => ({ ok: true, status: 200, json: async () => ({ version: 6 }) }),
        },
      ]),
      calls,
    );
    renderDetail(liveId);
    expect(await screen.findByRole('heading', { name: 'Live Study' })).toBeTruthy();

    await completeTurn(chat, 'First wish', 'Noted one.');
    await completeTurn(chat, 'Second wish', 'Noted two.');
    await typeBrief('Composer tail');
    fireEvent.click(screen.getByRole('button', { name: 'Taslak olarak kaydet' }));

    await screen.findByText('Taslak olarak kaydedildi: v6.');
    const patches = apiCallsTo(calls, '/api/spec/patch');
    expect(patches).toHaveLength(1);
    const body = bodyOf(patches[0]);
    expect(body.botId).toBe(liveId);
    expect(body.baseVersion).toBe(5);
    /* Exact stitch: thread user-turns in send order plus composer text;
       model prose never leaks in (replies were 'Noted one/two.'). */
    expect(body.summary).toBe(STITCHED);
    expect(body.behaviors).toEqual([{ kind: 'note', title: 'Note', detail: STITCHED }]);
    expect(String(body.summary).indexOf('First wish')).toBeLessThan(
      String(body.summary).indexOf('Second wish'),
    );
    expect(String(body.summary).indexOf('Second wish')).toBeLessThan(
      String(body.summary).indexOf('Composer tail'),
    );
    expect(String(body.summary)).not.toContain('Noted one.');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('Start build sends the stitched thread plus the composer as the brief', async () => {
    const calls: ApiCall[] = [];
    const liveId = '11111111-2222-4333-8444-555555555555';
    const runId = '99999999-8888-4777-8666-555555555555';
    const chat = queuedChat();
    stubApi(
      liveBotHandlers(liveId, chat, [
        {
          match: (url) => url === '/api/builder/start',
          respond: () => ({
            ok: true,
            status: 200,
            json: async () => ({ runId, phase: 'queued' }),
          }),
        },
        {
          match: (url) => url.startsWith('/api/builder?runId='),
          respond: () => ({
            ok: true,
            status: 200,
            body: null,
            json: async () => ({ phase: 'queued', detail: {} }),
          }),
        },
      ]),
      calls,
    );
    renderDetail(liveId);
    expect(await screen.findByRole('heading', { name: 'Live Study' })).toBeTruthy();

    await completeTurn(chat, 'First wish', 'Noted one.');
    await completeTurn(chat, 'Second wish', 'Noted two.');
    await typeBrief('Composer tail');
    fireEvent.click(screen.getByRole('button', { name: 'Kurulumu başlat' }));

    await screen.findByRole('link', { name: 'Kurulum ilerlemesini aç' });
    const starts = apiCallsTo(calls, '/api/builder/start');
    expect(starts).toHaveLength(1);
    expect(bodyOf(starts[0])).toEqual({ botId: liveId, brief: STITCHED });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('Save and Start stay enabled on thread content with an empty composer', async () => {
    const chat = queuedChat();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/chat') return chat.respond();
        if (url.startsWith('/api/spec/draft')) {
          return { ok: false, status: 404, json: async () => ({}) };
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    renderDetail('bot-3');
    const saveButton = screen.getByRole('button', {
      name: 'Taslak olarak kaydet',
    }) as HTMLButtonElement;
    const startButton = screen.getByRole('button', {
      name: 'Kurulumu başlat',
    }) as HTMLButtonElement;
    /* Empty thread + empty composer: nothing to save or build from. */
    expect(saveButton.disabled).toBe(true);
    expect(startButton.disabled).toBe(true);

    await completeTurn(chat, 'Thread wish', 'Noted.');
    /* The submit cleared the composer, but the thread user-turn counts —
       both buttons answer the thread, not just the box. */
    expect(saveButton.disabled).toBe(false);
    expect(startButton.disabled).toBe(false);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('a started build renders inline progress and keeps the exact ?runId= link', async () => {
    const calls: ApiCall[] = [];
    const liveId = '11111111-2222-4333-8444-555555555555';
    const runId = '99999999-8888-4777-8666-555555555555';
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
          match: (url) => url === '/api/builder/start',
          respond: () => ({
            ok: true,
            status: 200,
            json: async () => ({ runId, phase: 'queued' }),
          }),
        },
        {
          match: (url) => url.startsWith('/api/builder?runId='),
          respond: () => ({
            ok: true,
            status: 200,
            body: null,
            json: async () => ({ phase: 'generating', detail: {} }),
          }),
        },
      ],
      calls,
    );
    renderDetail(liveId);
    expect(await screen.findByRole('heading', { name: 'Live Study' })).toBeTruthy();
    await typeBrief('Add a welcome rule');
    fireEvent.click(screen.getByRole('button', { name: 'Kurulumu başlat' }));

    /* The EXISTING BuilderProgress renders inline in its own region — real
       server phase (Generating), not client-faked — next to the kept link. */
    const region = await screen.findByRole('region', { name: 'Kurulum ilerlemesi' });
    expect(await within(region).findByText('Generating')).toBeTruthy();
    const link = within(region.parentElement as HTMLElement).getByRole('link', {
      name: 'Kurulum ilerlemesini aç',
    });
    expect(link.getAttribute('href')).toBe(`/dashboard?runId=${runId}`);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('bot detail chat stream', () => {
  it('shows Thinking with elapsed time and reasoning, then the answer and spent line', async () => {
    const sse = sseStream();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(sse.stream)));
    renderDetail('bot-3');
    await submitDetail('Add a welcome rule');

    await screen.findByText('Sen: Add a welcome rule');
    expect(screen.getByRole('button', { name: 'Düşünüyor' })).toBeTruthy();

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
    expect(screen.getByText(/Bu yanıt 0.075 kredi harcadı/)).toBeTruthy();
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
    expect(screen.getByText(/sağlayıcı maliyet bildirmedi/)).toBeTruthy();
    expect(screen.queryByText(/Bu yanıt 0 kredi harcadı/)).toBeNull();
  });

  it('shows an honest inline error and Tekrar dene re-issues the same message on one row', async () => {
    const first = sseStream();
    const second = sseStream();
    /* Mount-time trial signal (fail-open 401) + draft load (no draft for mock
       ids); /api/conversations* answers honest stubs so the Wave-1 open/append
       never shifts the chat slots. */
    const convId = '22222222-3333-4444-8555-666666666666';
    const queue: unknown[] = [
      { ok: false, status: 401, json: async () => ({}) },
      { ok: false, status: 404, json: async () => ({}) },
      streamResponse(first.stream),
      streamResponse(second.stream),
    ];
    const fetchStub = vi.fn(async (url: string, init?: RequestInit) => {
      const href = String(url);
      if (href === '/api/conversations' && (init?.method ?? 'GET') === 'POST') {
        return { ok: true, status: 200, json: async () => ({ conversationId: convId }) };
      }
      if (href === '/api/conversations' && (init?.method ?? 'GET') === 'GET') {
        return { ok: true, status: 200, json: async () => ({ conversations: [] }) };
      }
      if (href === `/api/conversations/${convId}` && init?.method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ saved: 2 }) };
      }
      if (href.startsWith('/api/conversations/') && (init?.method ?? 'GET') === 'GET') {
        return { ok: true, status: 200, json: async () => ({ turns: [] }) };
      }
      const next = queue.shift();
      if (next === undefined) throw new Error(`unexpected fetch: ${href}`);
      return next;
    });
    vi.stubGlobal('fetch', fetchStub);
    renderDetail('bot-3');
    await submitDetail('Add a welcome rule');

    await act(async () => {
      first.push(frame({ t: 'error', message: 'The provider is busy.' }));
      first.close();
    });
    await screen.findByText('The provider is busy.');

    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));
    expect(screen.getAllByText('Sen: Add a welcome rule')).toHaveLength(1);
    /* Trial + draft + open + failed stream + retry = 5 (appends land after
       the streams settle). */
    await waitFor(() => {
      const chats = fetchStub.mock.calls.filter((call) => String(call[0]) === '/api/chat');
      expect(chats).toHaveLength(2);
    });
    expect(screen.queryByRole('button', { name: 'Tekrar dene' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Düşünüyor' })).toBeTruthy();

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
    expect(screen.getByRole('button', { name: 'Düşünüyor' })).toBeTruthy();
    expect(textarea.closest('[inert]')).not.toBeNull();

    await act(async () => {
      /* A reasoning frame is what puts the parked trace in the DOM at done:
         without it `chat-thread.tsx` renders no trace on the done branch, so
         the label assertions below would pass for a reason unrelated to the
         label (F7T2 review, finding F1). */
      sse.push(frame({ t: 'reasoning', text: 'Weighing the options' }));
      sse.push(frame({ t: 'content', text: 'Ok.' }));
      sse.push(frame({ t: 'done', credits: 0.1 }));
      sse.close();
    });
    /* Both halves read the shipped label off the real accessibility tree: the
       thinking label must be gone, and the Turkish done label must be the one
       that replaced it. An English done label fails the second half. */
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Düşünüyor' })).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Düşündü' })).toBeTruthy());
    expect(textarea.closest('[inert]')).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });
});

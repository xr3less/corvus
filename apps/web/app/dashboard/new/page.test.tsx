import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import NewBotPage from './page';

const CREATION_TITLE = 'What will your bot do today?';
const CREATION_SUB =
  'Describe it in plain words — we draft it, you test the draft, then you save a version. Going live on Discord isn’t wired yet.';
const MODEL_NAMES = ['Sonnet', 'GPT', 'Gemini', 'GLM', 'grok'];
const TRIAL_EXPIRED_MESSAGE = 'Your 3-day trial ended — your bots are paused. Nothing is deleted.';

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
let scrollIntoView: ReturnType<typeof vi.fn>;

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

function mintResponse(botId: string) {
  return {
    ok: true,
    status: 200,
    body: null,
    json: async () => ({ botId }),
  };
}

function startResponse(runId: string) {
  return {
    ok: true,
    status: 200,
    body: null,
    json: async () => ({ runId }),
  };
}

/* Route a stubbed fetch by URL: /api/bots mints, everything else streams chat. */
function chatFirstStub(
  first: ReadableStream<Uint8Array>,
  second: ReadableStream<Uint8Array>,
  botId: string,
) {
  let chatCalls = 0;
  return (url: string) => {
    if (url === '/api/bots') {
      return Promise.resolve(mintResponse(botId));
    }
    chatCalls += 1;
    return Promise.resolve(streamResponse(chatCalls <= 1 ? first : second));
  };
}

function callsTo(stub: ReturnType<typeof vi.fn>, url: string) {
  return stub.mock.calls.filter((call) => call[0] === url);
}

function frame(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

async function submitCreation(text: string): Promise<HTMLTextAreaElement> {
  const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: text } });
  fireEvent.keyDown(textarea, { key: 'Enter' });
  return textarea;
}

function buildButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Build this bot' }) as HTMLButtonElement;
}

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('network disabled in tests'))),
  );
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView =
    scrollIntoView as unknown as typeof Element.prototype.scrollIntoView;
});

afterEach(() => {
  consoleError.mockRestore();
  vi.unstubAllGlobals();
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

describe('new bot page', () => {
  it('renders the hero with an empty composer and a back link to the bots list', () => {
    render(<NewBotPage />);
    expect(screen.getByRole('heading', { level: 1, name: CREATION_TITLE })).toBeTruthy();
    expect(screen.getByText(CREATION_SUB)).toBeTruthy();
    expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe('');
    expect(screen.queryByRole('list', { name: 'New bot conversation' })).toBeNull();
    const back = screen.getByRole('link', { name: '← All bots' });
    expect(back.getAttribute('href')).toBe('/dashboard/bots');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('has no draft card and no step list — the thread is the only surface', () => {
    render(<NewBotPage />);
    expect(screen.queryByRole('heading', { name: 'Your draft' })).toBeNull();
    expect(screen.queryByText('How it works')).toBeNull();
    expect(screen.queryByText('Saved on this page only')).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('keeps the composer always expanded with no collapse control', async () => {
    render(<NewBotPage />);
    expect(screen.queryByRole('button', { name: 'Open prompt input' })).toBeNull();
    const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
    await waitFor(() => {
      expect(document.activeElement).toBe(textarea);
    });
    fireEvent.blur(textarea);
    expect(screen.queryByRole('button', { name: 'Open prompt input' })).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('submitting streams the reply into a thread with botId null', async () => {
    const sse = sseStream();
    const fetchStub = vi.fn((url: string) => {
      if (url === '/api/bots') {
        return Promise.resolve(mintResponse('11111111-1111-4111-8111-111111111111'));
      }
      return Promise.resolve(streamResponse(sse.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    await submitCreation('A welcome bot for my study server');
    const thread = await screen.findByRole('list', { name: 'New bot conversation' });
    expect(thread.textContent).toContain('A welcome bot for my study server');
    expect(thread.textContent).toContain('Thinking');
    expect(fetchStub).toHaveBeenCalledWith(
      '/api/chat',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          botId: null,
          message: 'A welcome bot for my study server',
          history: [],
        }),
        signal: expect.anything(),
      }),
    );

    await act(async () => {
      sse.push(frame({ t: 'content', text: 'Got it — drafting.' }));
      sse.push(frame({ t: 'done', credits: 1.1 }));
      sse.close();
    });
    await waitFor(() => expect(screen.getByText('Got it — drafting.')).toBeTruthy());
    expect(screen.getByText(/This reply used 1.1 credits/)).toBeTruthy();
    expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe('');
    /* The first-turn mint lands beside the chat without disturbing it. */
    await waitFor(() => expect(buildButton().disabled).toBe(false));
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('second turn carries the completed first turn as history', async () => {
    const first = sseStream();
    const second = sseStream();
    const fetchStub = vi.fn();
    fetchStub.mockImplementation(
      chatFirstStub(first.stream, second.stream, '11111111-1111-4111-8111-111111111111'),
    );
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    await submitCreation('First question');
    await act(async () => {
      first.push(frame({ t: 'content', text: 'First answer.' }));
      first.push(frame({ t: 'done', credits: 0.05 }));
      first.close();
    });
    await waitFor(() => expect(screen.getByText('First answer.')).toBeTruthy());
    /* The first-turn mint commits once the stream settles, so turn two carries it. */
    await waitFor(() => expect(buildButton().disabled).toBe(false));

    await submitCreation('Second question');
    expect(callsTo(fetchStub, '/api/chat')).toHaveLength(2);
    const chats = callsTo(fetchStub, '/api/chat');
    const secondInit = chats[1][1] as RequestInit;
    expect(JSON.parse(String(secondInit.body))).toEqual({
      botId: '11111111-1111-4111-8111-111111111111',
      message: 'Second question',
      history: [
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'First answer.' },
      ],
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('an empty submit does nothing', () => {
    render(<NewBotPage />);
    const composer = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: '' } });
    fireEvent.keyDown(composer, { key: 'Enter' });
    expect(screen.queryByRole('list', { name: 'New bot conversation' })).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('a suggestion chip fills the composer without submitting', () => {
    render(<NewBotPage />);
    const group = screen.getByRole('group', { name: 'Suggested changes' });
    fireEvent.click(within(group).getByRole('button', { name: 'Welcome message' }));
    expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe('Welcome message');
    expect(screen.queryByRole('list', { name: 'New bot conversation' })).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('never names a model and ships no forbidden jargon', () => {
    render(<NewBotPage />);
    const text = (document.body.textContent ?? '').toLowerCase();
    for (const name of MODEL_NAMES) {
      expect(text, `model name shipped: ${name}`).not.toContain(name.toLowerCase());
    }
    for (const term of FORBIDDEN) {
      expect(text, `forbidden term shipped: ${term}`).not.toContain(term.toLowerCase());
    }
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('aborts the in-flight stream on unmount', async () => {
    let capturedSignal: AbortSignal | undefined;
    const sse = sseStream();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url === '/api/bots') {
          return Promise.resolve(mintResponse('11111111-1111-4111-8111-111111111111'));
        }
        capturedSignal = init?.signal ?? undefined;
        return Promise.resolve(streamResponse(sse.stream));
      }),
    );
    const { unmount } = render(<NewBotPage />);
    await submitCreation('Keep it open');
    await waitFor(() => expect(capturedSignal).toBeTruthy());

    unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('mints exactly once on the first submit and reuses the id afterwards', async () => {
    const first = sseStream();
    const second = sseStream();
    const fetchStub = vi.fn();
    fetchStub.mockImplementation(
      chatFirstStub(first.stream, second.stream, '22222222-2222-4222-8222-222222222222'),
    );
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);
    expect(buildButton().disabled).toBe(true);

    await submitCreation('Welcome bot');
    await act(async () => {
      first.push(frame({ t: 'content', text: 'First answer.' }));
      first.push(frame({ t: 'done', credits: 0.05 }));
      first.close();
    });
    await waitFor(() => expect(screen.getByText('First answer.')).toBeTruthy());
    await waitFor(() => expect(buildButton().disabled).toBe(false));

    await submitCreation('Second question');
    await act(async () => {
      second.push(frame({ t: 'content', text: 'Second answer.' }));
      second.push(frame({ t: 'done', credits: 0.05 }));
      second.close();
    });
    await waitFor(() => expect(screen.getByText('Second answer.')).toBeTruthy());

    const mints = callsTo(fetchStub, '/api/bots');
    expect(mints).toHaveLength(1);
    expect(mints[0][1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String((mints[0][1] as RequestInit).body))).toEqual({
      botName: 'Welcome bot',
    });
    const chats = callsTo(fetchStub, '/api/chat');
    expect(chats).toHaveLength(2);
    expect(JSON.parse(String((chats[0][1] as RequestInit).body)).botId).toBeNull();
    expect(JSON.parse(String((chats[1][1] as RequestInit).body)).botId).toBe(
      '22222222-2222-4222-8222-222222222222',
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('Build posts the minted bot id with the first message and links the run', async () => {
    const sse = sseStream();
    const fetchStub = vi.fn((url: string) => {
      if (url === '/api/bots') {
        return Promise.resolve(mintResponse('11111111-1111-4111-8111-111111111111'));
      }
      if (url === '/api/builder/start') {
        return Promise.resolve(startResponse('run-123'));
      }
      return Promise.resolve(streamResponse(sse.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);
    expect(buildButton().disabled).toBe(true);

    await submitCreation('A moderation helper');
    await act(async () => {
      sse.push(frame({ t: 'content', text: 'Drafting your bot.' }));
      sse.push(frame({ t: 'done', credits: 0.05 }));
      sse.close();
    });
    await waitFor(() => expect(screen.getByText('Drafting your bot.')).toBeTruthy());
    await waitFor(() => expect(buildButton().disabled).toBe(false));

    fireEvent.click(buildButton());
    const link = await screen.findByRole('link', { name: 'View build progress' });
    expect(link.getAttribute('href')).toBe('/dashboard?runId=run-123');
    const starts = callsTo(fetchStub, '/api/builder/start');
    expect(starts).toHaveLength(1);
    expect(starts[0][1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String((starts[0][1] as RequestInit).body))).toEqual({
      botId: '11111111-1111-4111-8111-111111111111',
      brief: 'A moderation helper',
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('a failed mint shows an error, keeps the chat, and never starts a build', async () => {
    const sse = sseStream();
    const fetchStub = vi.fn((url: string) => {
      if (url === '/api/bots') {
        return Promise.resolve({
          ok: false,
          status: 500,
          body: null,
          json: async () => ({ error: 'mint blew up' }),
        });
      }
      return Promise.resolve(streamResponse(sse.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    await submitCreation('Keep chatting');
    await act(async () => {
      sse.push(frame({ t: 'content', text: 'Still here.' }));
      sse.push(frame({ t: 'done', credits: 0.05 }));
      sse.close();
    });
    await waitFor(() => expect(screen.getByText('Still here.')).toBeTruthy());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('mint blew up');
    expect(screen.getByText('Keep chatting')).toBeTruthy();
    expect(buildButton().disabled).toBe(true);
    expect(callsTo(fetchStub, '/api/builder/start')).toHaveLength(0);
    expect(consoleError).not.toHaveBeenCalled();
  });

  /* KI-033: the mint gate refuses an expired trial with 403
     { error: 'trial_expired', message: <the honest sentence> }. The page shows
     the sentence the server wrote — a code like "trial_expired" is not
     something a person can act on. */
  it('shows the server’s honest sentence when the mint is refused by the trial gate', async () => {
    const sse = sseStream();
    const fetchStub = vi.fn((url: string) => {
      if (url === '/api/bots') {
        return Promise.resolve({
          ok: false,
          status: 403,
          body: null,
          json: async () => ({ error: 'trial_expired', message: TRIAL_EXPIRED_MESSAGE }),
        });
      }
      return Promise.resolve(streamResponse(sse.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    await submitCreation('One more idea');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(TRIAL_EXPIRED_MESSAGE);
    expect(alert.textContent).not.toContain('trial_expired');
    expect(buildButton().disabled).toBe(true);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows the server’s honest sentence when the build start is refused by the trial gate', async () => {
    const sse = sseStream();
    const fetchStub = vi.fn((url: string) => {
      if (url === '/api/bots') {
        return Promise.resolve(mintResponse('11111111-1111-4111-8111-111111111111'));
      }
      if (url === '/api/builder/start') {
        return Promise.resolve({
          ok: false,
          status: 403,
          body: null,
          json: async () => ({ error: 'trial_expired', message: TRIAL_EXPIRED_MESSAGE }),
        });
      }
      return Promise.resolve(streamResponse(sse.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    await submitCreation('A moderation helper');
    await act(async () => {
      sse.push(frame({ t: 'content', text: 'Drafting your bot.' }));
      sse.push(frame({ t: 'done', credits: 0.05 }));
      sse.close();
    });
    await waitFor(() => expect(buildButton().disabled).toBe(false));

    fireEvent.click(buildButton());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(TRIAL_EXPIRED_MESSAGE);
    expect(screen.queryByRole('link', { name: 'View build progress' })).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });
});

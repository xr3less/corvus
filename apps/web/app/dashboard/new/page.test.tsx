import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import NewBotPage from './page';

const CREATION_TITLE = 'What will your bot do today?';
const CREATION_SUB = 'Describe it in plain words — we draft it, you test it, then it goes live.';
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

function frame(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

async function submitCreation(text: string): Promise<HTMLTextAreaElement> {
  const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: text } });
  fireEvent.keyDown(textarea, { key: 'Enter' });
  return textarea;
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
    const fetchStub = vi.fn().mockResolvedValue(streamResponse(sse.stream));
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
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('second turn carries the completed first turn as history', async () => {
    const first = sseStream();
    const second = sseStream();
    const fetchStub = vi
      .fn()
      .mockResolvedValueOnce(streamResponse(first.stream))
      .mockResolvedValueOnce(streamResponse(second.stream));
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    await submitCreation('First question');
    await act(async () => {
      first.push(frame({ t: 'content', text: 'First answer.' }));
      first.push(frame({ t: 'done', credits: 0.05 }));
      first.close();
    });
    await waitFor(() => expect(screen.getByText('First answer.')).toBeTruthy());

    await submitCreation('Second question');
    expect(fetchStub).toHaveBeenCalledTimes(2);
    const secondInit = fetchStub.mock.calls[1][1] as RequestInit;
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
      vi.fn((_url: string, init?: RequestInit) => {
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
});

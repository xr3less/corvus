import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import NewBotPage from './page';
import {
  ELLIPSIS as TURN_ELLIPSIS,
  PLAN_TAIL_MAX as VERDICT_TURN_TAIL_MAX,
  TURN_MAX as VERDICT_TURN_MAX,
} from '@/lib/verdict/bounds';
import threadStyles from '@/components/ui/chat-thread.module.css';

/* The ?template= slug comes from useSearchParams; tests steer it per case. */
let mockTemplate: string | null = null;

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'template' ? mockTemplate : null) }),
}));

/* The page is Turkish (the owner writes Turkish): every string this page owns
   is pinned here in Turkish, the hero and the two thread controls included. */
const CREATION_TITLE = 'Botun bugün ne yapacak?';
const CREATION_SUB =
  'Sade bir dille anlat — taslağı biz yazarız, sen denersin, sonra bir sürüm kaydedersin. Discord’da canlıya almak henüz bağlı değil.';
const CREATION_HINT =
  'Anlat, 2-3 soruya cevap ver ve plan doğru görününce “evet” yaz — kurulumu asistan kendisi başlatır.';
const CREATION_RETRY_HINT =
  'Başarısız bir kurulumdan sonra “evet” yazarsan temiz bir kurulum başlar.';
const CREATION_PLACEHOLDER = 'İstediğin botu anlat…';
const CREATION_COST =
  'Her değişiklik kredi harcar · platform kaynaklı hata olursa tekrar denemek ücretsiz.';
const SAVING_LINE = 'Botun kaydediliyor…';
const BUILD_STARTED_LINE = 'Kurulum başladı — ilerlemeyi aşağıda takip edebilirsin.';
const BUILD_LINK_NAME = 'Kurulum ilerlemesini aç';
const VERDICT_HINT =
  'Kurulum için onay gerekiyor — kısaca “evet” yaz ya da değiştirmek istediğin yeri yaz.';
const PLAN_MISSING_HINT =
  'Kurulum başlamadı — plan mesajı okunamadı. Asistandan planı yeniden iste, sonra kısaca “evet” yaz.';
const CHIP_NAME = 'Karşılama mesajı';

/* English words this page must never show again: each was a live string before
   the Turkish pass, so the check fails if one comes back. Shared components
   (composer, progress steps) are out of scope — they serve the bot-detail page
   too — so their still-English labels are absent from this list on purpose.
   The shared thread row's words are covered too, in their own lists below:
   they exist only once a turn is mounted, so sweeping them against the empty
   page would add entries that can never fire — the F12B/F12C dead entry. */
const ENGLISH_RESIDUE: [string, string][] = [
  ['hero title', 'What will your bot do today?'],
  ['hero sub', 'Describe it in plain words'],
  ['back link', 'All bots'],
  ['hint', 'say yes when the plan looks right'],
  ['retry hint', 'A yes after a failed build'],
  ['saving line', 'Saving your bot'],
  ['cost line', 'credits per change'],
  ['start fallback', 'Could not start the build'],
  ['mint fallback', 'Could not save your bot'],
  ['build status', 'Build started'],
  ['build link', 'View build progress'],
  ['composer placeholder', 'Describe the bot you want'],
  ['untitled bot name', 'Untitled bot'],
  ['starter chip', 'Welcome message'],
  ['starter chip', 'Moderation rule'],
  ['starter chip', 'XP rewards'],
];

/* The shared thread row's own pre-Turkish words, read from the component that
   renders them (`components/ui/thinking-trace.tsx:79` and `:84`). A row is
   either thinking or parked — never both — so each list is swept where its
   branch is the mounted one: the thinking branch prints `Thinking`, the parked
   branch prints `Thought` and the `took` in its elapsed suffix. */
const THINKING_RESIDUE: [string, string][] = [['thinking label', 'Thinking']];
const PARKED_RESIDUE: [string, string][] = [
  ['thought label', 'Thought'],
  ['elapsed suffix', 'took'],
];

const MODEL_NAMES = ['Sonnet', 'GPT', 'Gemini', 'GLM', 'grok'];
const TRIAL_EXPIRED_MESSAGE = 'Your 3-day trial ended — your bots are paused. Nothing is deleted.';

/* The plan offer is a POSITION, not a sentence: an assistant turn standing
   immediately before the last user reply IS the offer, whatever words it used.
   These fixtures therefore carry no ask line at all — a plain plan statement
   and a plain approval are exactly the paraphrase case the string gates used
   to miss, so every fixture here would have failed the old gates. */
const PLAN_REPLY = 'Here is the plan: welcome plus XP roles.';
/* The same plan as the owner actually reads it: the assistant answers in
   Turkish. The page posts it byte-identically whatever language it is in. */
const PLAN_REPLY_TR = 'Plan şu: karşılama mesajı ve XP rolleri.';
/* Paraphrase approvals — the wordings the deleted ask-line gate could never
   have matched, in the owner's own voice and in English. */
const PARAPHRASE_APPROVALS = ['baslat', 'yap', 'sen karar ver', 'you decide'];
const YES_REPLY = 'Yes, looks good';
const EVET_REPLY = 'evet';
const ACK_REPLY = 'Starting your build.';
const BOT_ID = '11111111-1111-4111-8111-111111111111';

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

function verdictYes(runId: string) {
  return {
    ok: true,
    status: 200,
    body: null,
    json: async () => ({
      verdict: 'yes',
      runId,
      started: true,
      phase: 'queued',
      briefChars: 42,
    }),
  };
}

function verdictSilent(verdict: 'no' | 'unclear') {
  return {
    ok: true,
    status: 200,
    body: null,
    json: async () => ({ verdict, started: false }),
  };
}

/* Two 409 shapes exist: the route's current body carries the sentence as
   `message` (the page prefers it, like every other refusal), and the older
   code-only body the page's own fallback covers. The stub's sentence is
   deliberately NOT the page's constant — a distinct string is what proves the
   page actually reads the server's words instead of always printing its own. */
function verdictConflict() {
  return {
    ok: false,
    status: 409,
    body: null,
    json: async () => ({
      error: 'no_plan_asked',
      message: 'Sunucu: plan okunamadı — yeniden isteyip “evet” yaz.',
    }),
  };
}

function verdictConflictCodeOnly() {
  return {
    ok: false,
    status: 409,
    body: null,
    json: async () => ({ error: 'no_plan_asked' }),
  };
}

function builderPhase(phase: string) {
  return {
    ok: true,
    status: 200,
    body: null,
    json: async () => ({ phase, detail: {} }),
  };
}

/* Wave-1 persistence lane (hook use-chat-stream.ts:134 + thread.ts:205): every
   submit opens POST /api/conversations BEFORE POST /api/chat, and appends
   completed rows after the stream settles (POST /api/conversations/[id]).
   Answered honestly here so stream slots stay chat-only: only /api/chat draws
   from the stream queue. The open id is a valid uuid so isUuid passes; the
   list/get shapes match lib/conversations/client.ts. */
function conversationOpen(botId: string) {
  return {
    ok: true,
    status: 200,
    body: null,
    json: async (): Promise<unknown> => ({ conversationId: botId }),
  };
}

function conversationList() {
  return {
    ok: true,
    status: 200,
    body: null,
    json: async (): Promise<unknown> => ({ conversations: [] }),
  };
}

function conversationTurns() {
  return {
    ok: true,
    status: 200,
    body: null,
    json: async (): Promise<unknown> => ({ turns: [] }),
  };
}

function conversationAppended() {
  return {
    ok: true,
    status: 200,
    body: null,
    json: async (): Promise<unknown> => ({ saved: 0 }),
  };
}

/* Honest router for the persistence lane. Returns a Response-like when the URL
   is a conversations URL, else null so the caller falls through to its own
   mint/verdict/chat routing. Branches on method: POST /api/conversations opens
   ({ conversationId }), GET lists ({ conversations: [] }); POST [id] appends
   ({ saved: 0 }), GET reads ({ turns: [] }). */
function conversationStub(url: string, init?: RequestInit, botId: string = BOT_ID) {
  if (url === '/api/conversations') {
    return Promise.resolve(init?.method === 'POST' ? conversationOpen(botId) : conversationList());
  }
  if (url.startsWith('/api/conversations/')) {
    return Promise.resolve(init?.method === 'POST' ? conversationAppended() : conversationTurns());
  }
  return null;
}

/* Route a stubbed fetch by URL: /api/bots mints, the persistence lane
   (/api/conversations*) is answered honestly, and only /api/chat streams. */
function chatFirstStub(
  first: ReadableStream<Uint8Array>,
  second: ReadableStream<Uint8Array>,
  botId: string,
) {
  let chatCalls = 0;
  return (url: string, init?: RequestInit) => {
    if (url === '/api/bots') {
      return Promise.resolve(mintResponse(botId));
    }
    const conversation = conversationStub(url, init, botId);
    if (conversation !== null) return conversation;
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

/* The page's per-turn cap and the tail it keeps — imported from the shared
   verdict bounds (lib/verdict/bounds.ts), the same module the page and the
   route import. No local copy: drift is now impossible by construction. */

interface SentTurn {
  role: string;
  content: string;
}

/* The turns the page actually posted to /api/builder/verdict (the last call when
   the flow posted more than once), plus a pin on the POST shape ({ botId, turns }
   and nothing else). Absence of the call is itself a failure here: a request the
   page never made cannot carry the judged reply, so the assertions below fail
   rather than pass vacuously. */
function sentTurns(stub: ReturnType<typeof vi.fn>, verdictCalls = 1): SentTurn[] {
  const calls = callsTo(stub, '/api/builder/verdict');
  expect(calls).toHaveLength(verdictCalls);
  const last = calls[calls.length - 1];
  expect(last[1]).toMatchObject({ method: 'POST' });
  const body = JSON.parse(String((last[1] as RequestInit).body)) as {
    botId?: unknown;
    turns: SentTurn[];
  };
  expect(Object.keys(body).sort()).toEqual(['botId', 'turns']);
  expect(body.botId).toBe(BOT_ID);
  return body.turns;
}

/* The assistant turn the page judged against: the last assistant row in the
   tail. Under the position rule this is the turn standing immediately before
   the judged user reply — its words are never read by the page. */
function lastAssistant(turns: SentTurn[]): SentTurn {
  const assistants = turns.filter((turn) => turn.role === 'assistant');
  expect(assistants.length).toBeGreaterThan(0);
  return assistants[assistants.length - 1];
}

/* A plan turn of exactly `total` chars — plain prose with no ask line of any
   kind, so nothing about the position rule depends on its wording. */
function longPlan(total: number): string {
  const filler = 'Add a welcome message and XP roles for the study channel. ';
  return filler.repeat(Math.ceil(total / filler.length)).slice(0, total);
}

/* Drives the exact plan -> approval flow the verdict effect watches for, and
   returns the fetch stub once the verdict call has settled. `planReply` is the
   plan turn the assistant streams. */
async function drivePlanThenYes(
  planReply: string,
  verdictResponse: unknown = verdictYes('run-123'),
  reply: string = YES_REPLY,
) {
  const first = sseStream();
  const second = sseStream();
  const fetchStub = vi.fn();
  let chatCalls = 0;
  fetchStub.mockImplementation((url: string, init?: RequestInit) => {
    if (url === '/api/bots') return Promise.resolve(mintResponse(BOT_ID));
    const conversation = conversationStub(url, init);
    if (conversation !== null) return conversation;
    if (url === '/api/builder/verdict') return Promise.resolve(verdictResponse);
    if (url.startsWith('/api/builder?runId=')) return Promise.resolve(builderPhase('queued'));
    chatCalls += 1;
    return Promise.resolve(streamResponse(chatCalls <= 1 ? first.stream : second.stream));
  });
  vi.stubGlobal('fetch', fetchStub);
  render(<NewBotPage />);

  await submitCreation('A moderation helper');
  await act(async () => {
    first.push(frame({ t: 'content', text: planReply }));
    first.push(frame({ t: 'done', credits: 0.05 }));
    first.close();
  });
  await waitFor(() => expect(screen.getByText(planReply)).toBeTruthy());
  await flushSettled();

  await submitCreation(reply);
  await act(async () => {
    second.push(frame({ t: 'content', text: ACK_REPLY }));
    second.push(frame({ t: 'done', credits: 0.05 }));
    second.close();
  });
  await waitFor(() => expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(1));
  return fetchStub;
}

async function submitCreation(text: string): Promise<HTMLTextAreaElement> {
  const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: text } });
  fireEvent.keyDown(textarea, { key: 'Enter' });
  return textarea;
}

/* Let promise-only side chains settle (mint → pendingBotId → committed botId)
   without a DOM signal to wait on. The chains are microtasks off
   immediately-resolving stubs, so one macrotask inside act flushes them. */
async function flushSettled() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/* The composer shell: the div owning the suggestion group (page.tsx). Since
   composer-type-but-not-send it is never `inert` or dimmed — gating is the
   disabled send button + blocked Enter — so the tests below track this element
   to prove the old lock mechanism is gone, not just unused. */
function composerShell(): HTMLElement {
  const group = screen.getByRole('group', { name: 'Önerilen değişiklikler' });
  const wrapper = group.parentElement;
  if (!wrapper) throw new Error('composer shell not found');
  return wrapper;
}

function sendButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Send prompt' }) as HTMLButtonElement;
}

/* While a stream is open: no inert, no dim, textarea editable, and the send
   button is a real disabled control. Types a draft because the button only
   reads as "Send" once the composer holds text. */
function expectSendGated(draft = 'held while streaming'): {
  textarea: HTMLTextAreaElement;
  send: HTMLButtonElement;
} {
  const shell = composerShell();
  expect(shell.hasAttribute('inert')).toBe(false);
  expect(shell.className).not.toContain(threadStyles.composerLocked);
  const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
  expect(textarea.disabled).toBe(false);
  fireEvent.change(textarea, { target: { value: draft } });
  expect(textarea.value).toBe(draft);
  const send = sendButton();
  expect(send.disabled).toBe(true);
  expect(send.getAttribute('aria-disabled')).toBe('true');
  return { textarea, send };
}

/* After done/error the shell is still never locked; callers assert the send
   path themselves (button enabled once text is present, Enter streams). */
async function expectComposerUnlocked() {
  await waitFor(() => expect(composerShell().hasAttribute('inert')).toBe(false));
  expect(composerShell().className).not.toContain(threadStyles.composerLocked);
}

/* Every English string this page used to show, checked against what is really
   on screen. `extra` carries the entries only the render the caller just made
   can mount — the shared row's words need a submitted turn — so no entry is
   ever listed against a screen that cannot carry it (the F12B/F12C dead-entry
   defect: an entry that can never fire guards nothing). */
function expectNoEnglishResidue(extra: [string, string][] = []) {
  const body = document.body.textContent ?? '';
  for (const [what, english] of [...ENGLISH_RESIDUE, ...extra]) {
    expect(body, `${what} still English: ${english}`).not.toContain(english);
  }
}

beforeEach(() => {
  mockTemplate = null;
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
    expect(screen.getByText(CREATION_HINT)).toBeTruthy();
    expect(screen.getByText(CREATION_RETRY_HINT)).toBeTruthy();
    expect(screen.getByText(CREATION_COST)).toBeTruthy();
    expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe('');
    /* The placeholder is the page's own text; the textarea's label stays the
       shared PromptInput's. */
    expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).placeholder).toBe(
      CREATION_PLACEHOLDER,
    );
    expect(screen.queryByRole('list', { name: 'Yeni bot konuşması' })).toBeNull();
    const back = screen.getByRole('link', { name: '← Tüm botlar' });
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

  it('shows the auto-start hint and no Build button', () => {
    render(<NewBotPage />);
    expect(screen.queryByRole('button', { name: 'Build this bot' })).toBeNull();
    expect(screen.getByText(/plan doğru görününce/)).toBeTruthy();
    expect(screen.getByText(/temiz bir kurulum başlar/)).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  /* The Turkish pass, guarded: every string this page used to show in English
     is enumerated with the Turkish string that replaced it. A revert of any
     line — or a new English string on this page — fails here. */
  it('speaks Turkish end to end: no English page string survives', () => {
    render(<NewBotPage />);
    const body = document.body.textContent ?? '';
    expectNoEnglishResidue();
    /* Turkish copy in place: hero, hint, chips, composer placeholder, cost. */
    expect(screen.getByRole('heading', { level: 1, name: CREATION_TITLE })).toBeTruthy();
    const chips = screen.getByRole('group', { name: 'Önerilen değişiklikler' });
    expect(within(chips).getByRole('button', { name: CHIP_NAME })).toBeTruthy();
    expect(screen.getByText(CREATION_COST)).toBeTruthy();
    /* The cost line is honest, not a fixed price: no fabricated precision. */
    expect(body).not.toContain('1.1');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('submitting streams the reply into a thread with botId null', async () => {
    const sse = sseStream();
    const fetchStub = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/bots') {
        return Promise.resolve(mintResponse('11111111-1111-4111-8111-111111111111'));
      }
      const conversation = conversationStub(url, init, '11111111-1111-4111-8111-111111111111');
      if (conversation !== null) return conversation;
      return Promise.resolve(streamResponse(sse.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    await submitCreation('A welcome bot for my study server');
    const thread = await screen.findByRole('list', { name: 'Yeni bot konuşması' });
    expect(thread.textContent).toContain('A welcome bot for my study server');
    expect(thread.textContent).toContain('Düşünüyor');
    /* The row is mounted, so the shared row's own words are on screen to sweep:
       this is the render the label entries below can actually fire in. */
    expectNoEnglishResidue(THINKING_RESIDUE);
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
      /* The provider's real order: reasoning streams first, then the answer
         (lib/ai/stream.ts). The reasoning is what parks a trace at done. */
      sse.push(frame({ t: 'reasoning', text: 'Weighing the options' }));
      sse.push(frame({ t: 'content', text: 'Got it — drafting.' }));
      sse.push(frame({ t: 'done', credits: 1.1 }));
      sse.close();
    });
    await waitFor(() => expect(screen.getByText('Got it — drafting.')).toBeTruthy());
    /* Parked, not gone: the second label and its elapsed suffix are the row's
       other half, so the Turkish pair is pinned where each branch mounts. */
    expect(thread.textContent).toContain('Düşündü');
    expectNoEnglishResidue(PARKED_RESIDUE);
    /* The negative belongs on a render that can carry a thinking row: two
       turns at once, the parked row above and a second turn genuinely live.
       A row is never both, so the parked row must not carry the live label
       on the very render that does hold one — where the old thread-wide
       form was true for a structural reason and could never fire. */
    const live = sseStream();
    vi.stubGlobal(
      'fetch',
      /* Mints still go through the original stub, so the mint-once count
         below keeps watching the whole test rather than only its first half. */
      vi.fn((url: string, init?: RequestInit) => {
        if (url === '/api/bots') return fetchStub(url);
        const conversation = conversationStub(url, init, '11111111-1111-4111-8111-111111111111');
        if (conversation !== null) return conversation;
        return Promise.resolve(streamResponse(live.stream));
      }),
    );
    await submitCreation('Second question');
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Düşünüyor' }).length).toBeGreaterThan(0),
    );
    /* Durable, not transient: let the second turn's own promise chain settle
       and re-assert the row is still live. A second turn that errored or had
       already finished would leave no thinking row here, and the negative
       below would be back to the vacuous shape it replaces — true for a
       structural reason rather than because the copy is right. */
    await flushSettled();
    expect(screen.getAllByRole('button', { name: 'Düşünüyor' }).length).toBeGreaterThan(0);
    const parkedRow = screen.getByRole('button', { name: 'Düşündü' }).closest('li');
    expect(parkedRow).not.toBeNull();
    expect(parkedRow?.textContent).toContain('Düşündü');
    expect(parkedRow?.textContent).not.toContain('Düşünüyor');
    expect(screen.getByText(/Bu yanıt 1.1 kredi harcadı/)).toBeTruthy();
    expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe('');
    /* The first-turn mint fires beside the chat without disturbing it. */
    await waitFor(() => expect(callsTo(fetchStub, '/api/bots')).toHaveLength(1));
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
    await flushSettled();

    await submitCreation('Second question');
    await waitFor(() => expect(callsTo(fetchStub, '/api/chat')).toHaveLength(2));
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
    expect(screen.queryByRole('list', { name: 'Yeni bot konuşması' })).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('a suggestion chip fills the composer without submitting', () => {
    render(<NewBotPage />);
    const group = screen.getByRole('group', { name: 'Önerilen değişiklikler' });
    fireEvent.click(within(group).getByRole('button', { name: CHIP_NAME }));
    expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe(CHIP_NAME);
    expect(screen.queryByRole('list', { name: 'Yeni bot konuşması' })).toBeNull();
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
        const conversation = conversationStub(url, init, '11111111-1111-4111-8111-111111111111');
        if (conversation !== null) return conversation;
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
    expect(screen.queryByRole('link', { name: BUILD_LINK_NAME })).toBeNull();

    await submitCreation('Karşılama botu');
    await act(async () => {
      first.push(frame({ t: 'content', text: 'First answer.' }));
      first.push(frame({ t: 'done', credits: 0.05 }));
      first.close();
    });
    await waitFor(() => expect(screen.getByText('First answer.')).toBeTruthy());
    await flushSettled();

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
      botName: 'Karşılama botu',
    });
    const chats = callsTo(fetchStub, '/api/chat');
    expect(chats).toHaveLength(2);
    expect(JSON.parse(String((chats[0][1] as RequestInit).body)).botId).toBeNull();
    expect(JSON.parse(String((chats[1][1] as RequestInit).body)).botId).toBe(
      '22222222-2222-4222-8222-222222222222',
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('verdict yes posts once with the turns tail and starts inline progress', async () => {
    const first = sseStream();
    const second = sseStream();
    const fetchStub = vi.fn();
    let chatCalls = 0;
    fetchStub.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/bots') {
        return Promise.resolve(mintResponse(BOT_ID));
      }
      const conversation = conversationStub(url, init, BOT_ID);
      if (conversation !== null) return conversation;
      if (url === '/api/builder/verdict') {
        return Promise.resolve(verdictYes('run-123'));
      }
      if (url.startsWith('/api/builder?runId=')) {
        return Promise.resolve(builderPhase('queued'));
      }
      chatCalls += 1;
      return Promise.resolve(streamResponse(chatCalls <= 1 ? first.stream : second.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    const { rerender } = render(<NewBotPage />);

    await submitCreation('A moderation helper');
    await act(async () => {
      first.push(frame({ t: 'content', text: PLAN_REPLY }));
      first.push(frame({ t: 'done', credits: 0.05 }));
      first.close();
    });
    await waitFor(() => expect(screen.getByText(PLAN_REPLY)).toBeTruthy());
    await flushSettled();
    /* The plan alone judges nothing — no verdict POST until the user replies. */
    expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(0);

    await submitCreation(YES_REPLY);
    /* While the yes streams the page stays silent — no verdict in flight. */
    await waitFor(() => expect(callsTo(fetchStub, '/api/chat')).toHaveLength(2));
    expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(0);
    await act(async () => {
      second.push(frame({ t: 'content', text: ACK_REPLY }));
      second.push(frame({ t: 'done', credits: 0.05 }));
      second.close();
    });
    await waitFor(() => expect(screen.getByText(ACK_REPLY)).toBeTruthy());

    /* `yes` → runId: the status row, the EXISTING inline progress, and the
       kept ?runId= link. */
    const link = await screen.findByRole('link', { name: BUILD_LINK_NAME });
    expect(link.getAttribute('href')).toBe('/dashboard?runId=run-123');
    expect(screen.getByText(BUILD_STARTED_LINE)).toBeTruthy();
    const region = screen.getByRole('region', { name: 'Kurulum ilerlemesi' });
    expect(await within(region).findByText('Queued')).toBeTruthy();
    const verdicts = callsTo(fetchStub, '/api/builder/verdict');
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0][1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String((verdicts[0][1] as RequestInit).body))).toEqual({
      botId: BOT_ID,
      turns: [
        { role: 'user', content: 'A moderation helper' },
        { role: 'assistant', content: PLAN_REPLY },
        { role: 'user', content: YES_REPLY },
      ],
    });
    /* A re-render posts nothing more — the once-guards hold. */
    rerender(<NewBotPage />);
    await flushSettled();
    expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(1);
    expect(consoleError).not.toHaveBeenCalled();
  });

  /* The refusal the page used to swallow: the route answers 409
     { error: 'no_plan_asked' } when the turns it read carried no assistant turn
     at all. Silence there meant a refused start with no build, no error, no
     explanation — the person's reply looked ignored. The page now names what
     happened, in Turkish, with no run and no link. */
  it('verdict 409 no-plan-asked shows the server’s Turkish sentence, no run', async () => {
    const fetchStub = await drivePlanThenYes(PLAN_REPLY, verdictConflict());
    await flushSettled();
    const alert = screen.getByRole('alert');
    /* The server's own words are what the person reads — not the page's copy,
       which only stands in when the body has no sentence. */
    expect(alert.textContent).toBe('Sunucu: plan okunamadı — yeniden isteyip “evet” yaz.');
    expect(alert.textContent).not.toBe(PLAN_MISSING_HINT);
    /* The code never reaches the screen; the sentence does. */
    expect(alert.textContent).not.toContain('no_plan_asked');
    expect(screen.queryByRole('link', { name: BUILD_LINK_NAME })).toBeNull();
    expect(screen.queryByText(BUILD_STARTED_LINE)).toBeNull();
    expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(1);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('verdict 409 with the older code-only body still shows the Turkish sentence', async () => {
    const fetchStub = await drivePlanThenYes(PLAN_REPLY, verdictConflictCodeOnly());
    await flushSettled();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(PLAN_MISSING_HINT);
    expect(alert.textContent).not.toContain('no_plan_asked');
    expect(screen.queryByRole('link', { name: BUILD_LINK_NAME })).toBeNull();
    expect(screen.queryByText(BUILD_STARTED_LINE)).toBeNull();
    expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(1);
    expect(consoleError).not.toHaveBeenCalled();
  });

  /* The position rule, stated positively: an assistant turn directly before the
     reply is ALL it takes. Each plan below is an ordinary sentence with no ask
     line, no question, no keyword — under the deleted string gate every one of
     them would have been judged never, and the person's reply would have gone
     nowhere. */
  it.each([
    'Here is the plan: welcome plus XP roles.',
    'Plan şu: karşılama mesajı ve XP rolleri.',
    'OK — I think that covers it.',
    'Sure, drafting something now.',
  ])('any assistant turn before the reply triggers the verdict: %s', async (plan) => {
    const fetchStub = await drivePlanThenYes(plan);
    const turns = sentTurns(fetchStub);
    /* Byte-identical to the row the page holds: nothing is rewritten to
       satisfy a gate that no longer exists. */
    expect(lastAssistant(turns).content).toBe(plan);
    const link = await screen.findByRole('link', { name: BUILD_LINK_NAME });
    expect(link.getAttribute('href')).toBe('/dashboard?runId=run-123');
    expect(consoleError).not.toHaveBeenCalled();
  });

  /* The founder-facing case the string gates missed: the owner approves in
     their own words. The page posts the same { botId, turns } for every one of
     these — the wording is the judge's business, not the page's. */
  it.each(PARAPHRASE_APPROVALS)(
    'a paraphrase approval (“%s”) is posted like any other reply',
    async (approval) => {
      const fetchStub = await drivePlanThenYes(PLAN_REPLY, verdictYes('run-123'), approval);
      const turns = sentTurns(fetchStub);
      expect(turns[turns.length - 1]).toEqual({ role: 'user', content: approval });
      expect(lastAssistant(turns).content).toBe(PLAN_REPLY);
      const link = await screen.findByRole('link', { name: BUILD_LINK_NAME });
      expect(link.getAttribute('href')).toBe('/dashboard?runId=run-123');
      expect(consoleError).not.toHaveBeenCalled();
    },
  );

  /* The one turn the position rule does NOT judge: the very first user turn has
     no assistant turn before it, so there is nothing that could be a plan
     offer. (Every later turn is preceded by an assistant row, because the hook
     always appends user-then-assistant — so "no predecessor" is the only
     ineligible shape, and the server's zero-assistant-turns 409 is the
     backstop for a direct caller.) */
  it('the first user turn is never judged — no assistant turn precedes it', async () => {
    const first = sseStream();
    const second = sseStream();
    const fetchStub = vi.fn();
    let chatCalls = 0;
    fetchStub.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/bots') return Promise.resolve(mintResponse(BOT_ID));
      const conversationHead = conversationStub(url, init);
      if (conversationHead !== null) return conversationHead;
      if (url === '/api/builder/verdict') return Promise.resolve(verdictYes('run-123'));
      if (url.startsWith('/api/builder?runId=')) return Promise.resolve(builderPhase('queued'));
      chatCalls += 1;
      return Promise.resolve(streamResponse(chatCalls <= 1 ? first.stream : second.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    /* Turn one: the only user row in the thread, nothing before it. Its reply
       arrives and the page still posts nothing — the position does not hold. */
    await submitCreation('A moderation helper');
    await act(async () => {
      first.push(frame({ t: 'content', text: 'What should it watch for?' }));
      first.push(frame({ t: 'done', credits: 0.05 }));
      first.close();
    });
    await waitFor(() => expect(screen.getByText('What should it watch for?')).toBeTruthy());
    await flushSettled();
    expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(0);

    /* Turn two: its predecessor IS an assistant turn, so the position holds and
       exactly one verdict posts. */
    await submitCreation('Spam and slurs');
    await act(async () => {
      second.push(frame({ t: 'content', text: PLAN_REPLY }));
      second.push(frame({ t: 'done', credits: 0.05 }));
      second.close();
    });
    await waitFor(() => expect(screen.getByText(PLAN_REPLY)).toBeTruthy());
    await waitFor(() => expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(1));
    const turns = sentTurns(fetchStub);
    expect(turns[turns.length - 1]).toEqual({ role: 'user', content: 'Spam and slurs' });
    expect(consoleError).not.toHaveBeenCalled();
  });

  /* The plan turn is an ordinary chat turn: POST /api/chat stores up to 2000
     chars of it, so the verdict POST must carry up to 2000 too. A head-only
     slice dropped the plan's END, so a long plan reached the route truncated. */
  it.each([501, 1500, 2000])(
    'a %i-char plan turn is posted whole under the bound',
    async (planLength) => {
      const plan = longPlan(planLength);
      expect(plan).toHaveLength(planLength);

      const fetchStub = await drivePlanThenYes(plan);
      const turns = sentTurns(fetchStub);
      expect(lastAssistant(turns).content).toBe(plan);
      expect(consoleError).not.toHaveBeenCalled();
    },
  );

  it('a plan turn capped at the bound keeps both ends, drops the middle, and never exceeds it', async () => {
    const plan = longPlan(3000);
    const fetchStub = await drivePlanThenYes(plan);
    const turns = sentTurns(fetchStub);
    const sent = lastAssistant(turns);

    /* Exactly the bound: the request cannot grow past what the route accepts. */
    expect(sent.content).toHaveLength(VERDICT_TURN_MAX);
    /* Both ends survive — the plan's head and its end (which is where a person
       and the judge both look for the conclusion) — with the middle dropped
       behind the same marker the route writes. */
    const headLength = VERDICT_TURN_MAX - VERDICT_TURN_TAIL_MAX - TURN_ELLIPSIS.length;
    expect(sent.content.startsWith(plan.slice(0, headLength))).toBe(true);
    expect(sent.content.slice(headLength, headLength + TURN_ELLIPSIS.length)).toBe(TURN_ELLIPSIS);
    expect(sent.content.endsWith(plan.slice(-VERDICT_TURN_TAIL_MAX))).toBe(true);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('a turn that already fits the bound travels untouched — no marker, no padding', async () => {
    const plan = longPlan(1200);
    expect(plan).toHaveLength(1200);
    expect(plan).not.toContain('…');
    const fetchStub = await drivePlanThenYes(plan);
    const turns = sentTurns(fetchStub);
    /* Byte-identical to the row the page holds: an in-bound turn is never
       rewritten, so the route judges exactly what the person saw. */
    expect(lastAssistant(turns).content).toBe(plan);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('a long plan turn reaches the verdict POST unchanged when it fits the bound', async () => {
    /* 2000 is the route's own TURN_MAX: the page must not shorten a turn the
       route would have accepted whole. */
    const plan = longPlan(VERDICT_TURN_MAX);
    const fetchStub = await drivePlanThenYes(plan);
    const turns = sentTurns(fetchStub);
    expect(lastAssistant(turns).content).toBe(plan);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('a long thread still sends exactly 12 turns, ending at the judged reply', async () => {
    /* The 12-row tail bound: a thread past 12 rows sends exactly 12, and they
       still END at the judged user row. Seven submissions are 14 rows, so the
       tail has to drop the opening user row. */
    const streams: ReturnType<typeof sseStream>[] = [];
    const fetchStub = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/bots') return Promise.resolve(mintResponse(BOT_ID));
      const conversationHead = conversationStub(url, init);
      if (conversationHead !== null) return conversationHead;
      if (url === '/api/builder/verdict') return Promise.resolve(verdictSilent('no'));
      if (url !== '/api/chat') return Promise.reject(new Error('unexpected call: ' + url));
      const sse = sseStream();
      streams.push(sse);
      return Promise.resolve(streamResponse(sse.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    const TURNS = 7;
    for (let turn = 1; turn <= TURNS; turn += 1) {
      await submitCreation(`Idea number ${turn}`);
      await waitFor(() => expect(streams).toHaveLength(turn));
      const sse = streams[turn - 1];
      const reply = `Plan for idea ${turn}.`;
      await act(async () => {
        sse.push(frame({ t: 'content', text: reply }));
        sse.push(frame({ t: 'done', credits: 0.05 }));
        sse.close();
      });
      await waitFor(() => expect(screen.getByText(reply)).toBeTruthy());
      await flushSettled();
      /* Turn one has nothing to judge (no assistant row precedes its user row);
         every later turn is judged exactly once. */
      expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(Math.max(0, turn - 1));
    }

    const turns = sentTurns(fetchStub, TURNS - 1);
    expect(turns).toHaveLength(12);
    expect(turns[0]).toEqual({ role: 'assistant', content: 'Plan for idea 1.' });
    expect(turns[11]).toEqual({ role: 'user', content: `Idea number ${TURNS}` });
    expect(lastAssistant(turns).content).toBe(`Plan for idea ${TURNS - 1}.`);
    for (const turn of turns) {
      expect(turn.content.length).toBeLessThanOrEqual(VERDICT_TURN_MAX);
    }
    expect(consoleError).not.toHaveBeenCalled();
  });

  /* The Turkish path. The assistant answers in the owner's language; under the
     position rule the language is irrelevant — the turn before the reply is
     the offer, whatever it says. The turns posted are byte-identical to what
     the model wrote. */
  it.each([EVET_REPLY, 'tamam', 'başla'])(
    'a Turkish plan ending with %s starts the build on evet',
    async (askLine) => {
      const plan = `Plan şu: karşılama mesajı ve XP rolleri. ${askLine}`;
      const fetchStub = await drivePlanThenYes(plan, verdictYes('run-123'), EVET_REPLY);
      const turns = sentTurns(fetchStub);
      /* The plan turn reached the verdict POST exactly as written — Turkish
         diacritics and all. */
      expect(lastAssistant(turns).content).toBe(plan);
      expect(turns[turns.length - 1]).toEqual({ role: 'user', content: EVET_REPLY });
      const link = await screen.findByRole('link', { name: BUILD_LINK_NAME });
      expect(link.getAttribute('href')).toBe('/dashboard?runId=run-123');
      expect(screen.getByText(BUILD_STARTED_LINE)).toBeTruthy();
      expect(consoleError).not.toHaveBeenCalled();
    },
  );

  it('the Turkish plan the owner actually reads reaches the verdict POST whole', async () => {
    /* The fixture itself, driven: the Turkish plan constant (not a locally
       built one) is what the page posts. */
    const fetchStub = await drivePlanThenYes(PLAN_REPLY_TR, verdictYes('run-123'), EVET_REPLY);
    const turns = sentTurns(fetchStub);
    expect(lastAssistant(turns).content).toBe(PLAN_REPLY_TR);
    expect(turns[turns.length - 1]).toEqual({ role: 'user', content: EVET_REPLY });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('the Turkish hint clears once the person replies again', async () => {
    const fetchStub = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/bots') return Promise.resolve(mintResponse(BOT_ID));
      const conversationHead = conversationStub(url, init);
      if (conversationHead !== null) return conversationHead;
      if (url === '/api/builder/verdict') return Promise.resolve(verdictSilent('unclear'));
      const sse = sseStream();
      return Promise.resolve(streamResponse(sse.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    await submitCreation('A moderation helper');
    /* The reply itself supersedes the hint: the person acted on it, so it must
       not keep standing next to the new turn. */
    await submitCreation('Bir de XP rolleri ekle');
    await flushSettled();
    expect(screen.queryByText(VERDICT_HINT)).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  /* E3 template seeding, in Turkish: the composer is filled from the template
     the person clicked.

     Rendered under StrictMode ON PURPOSE. The real page load double-invokes
     this effect (Strict Mode is on by default in the App Router) and the first
     invocation is torn down, so its response can never land. A once-guard set
     on that dead run made the surviving run bail: measured in the running app,
     the fetch fired exactly once and the composer stayed EMPTY for every
     ?template= load, while this suite stayed green because the module-level
     useSearchParams mock never re-invokes. StrictMode is the instrument that
     reproduces the real lifecycle — with the guard back, this test goes red. */
  it('a ?template= slug seeds the composer with a Turkish starter', async () => {
    mockTemplate = 'ticket-desk';
    const fetchStub = vi.fn((url: string) => {
      if (url === '/api/templates/ticket-desk') {
        return Promise.resolve({
          ok: true,
          status: 200,
          body: null,
          json: async () => ({ name: 'Ticket Desk', capabilities: ['tickets', 'logs'] }),
        });
      }
      return Promise.reject(new Error('unexpected call: ' + url));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(
      <StrictMode>
        <NewBotPage />
      </StrictMode>,
    );

    await waitFor(() =>
      expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe(
        'Ticket Desk gibi bir bot kur: tickets, logs',
      ),
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('verdict unclear shows the Turkish hint, starts no run', async () => {
    const first = sseStream();
    const second = sseStream();
    const fetchStub = vi.fn();
    let chatCalls = 0;
    fetchStub.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/bots') {
        return Promise.resolve(mintResponse(BOT_ID));
      }
      const conversation = conversationStub(url, init, BOT_ID);
      if (conversation !== null) return conversation;
      if (url === '/api/builder/verdict') {
        return Promise.resolve(verdictSilent('unclear'));
      }
      chatCalls += 1;
      return Promise.resolve(streamResponse(chatCalls <= 1 ? first.stream : second.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    await submitCreation('A moderation helper');
    await act(async () => {
      first.push(frame({ t: 'content', text: PLAN_REPLY }));
      first.push(frame({ t: 'done', credits: 0.05 }));
      first.close();
    });
    await waitFor(() => expect(screen.getByText(PLAN_REPLY)).toBeTruthy());
    await flushSettled();

    await submitCreation('Hmm, maybe add XP roles too?');
    await act(async () => {
      second.push(frame({ t: 'content', text: 'Sure — one question first.' }));
      second.push(frame({ t: 'done', credits: 0.05 }));
      second.close();
    });
    await waitFor(() => expect(screen.getByText('Sure — one question first.')).toBeTruthy());
    await waitFor(() => expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(1));
    await flushSettled();
    /* The judge did not accept it: nothing started, and the page says what it
       needs next instead of leaving the reply looking ignored. It is not an
       alert — nothing failed. */
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(VERDICT_HINT)).toBeTruthy();
    expect(screen.queryByRole('link', { name: BUILD_LINK_NAME })).toBeNull();
    expect(screen.queryByText(BUILD_STARTED_LINE)).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('a second yes while the verdict is in flight posts nothing more', async () => {
    const first = sseStream();
    const second = sseStream();
    const third = sseStream();
    /* The turn below is POSITION-eligible by construction (an assistant turn
       precedes it), so the silence must come from the in-flight/building
       once-guard — not from eligibility. */
    const midAck = 'Noted — still working on that.';
    let resolveVerdict: (value: unknown) => void = () => {};
    const verdictGate = new Promise((gate) => {
      resolveVerdict = gate;
    });
    const fetchStub = vi.fn();
    let chatCalls = 0;
    fetchStub.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/bots') {
        return Promise.resolve(mintResponse(BOT_ID));
      }
      const conversation = conversationStub(url, init, BOT_ID);
      if (conversation !== null) return conversation;
      if (url === '/api/builder/verdict') {
        return verdictGate.then(() => verdictYes('run-123'));
      }
      if (url.startsWith('/api/builder?runId=')) {
        return Promise.resolve(builderPhase('queued'));
      }
      chatCalls += 1;
      if (chatCalls <= 1) return Promise.resolve(streamResponse(first.stream));
      if (chatCalls <= 2) return Promise.resolve(streamResponse(second.stream));
      return Promise.resolve(streamResponse(third.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    await submitCreation('A moderation helper');
    await act(async () => {
      first.push(frame({ t: 'content', text: PLAN_REPLY }));
      first.push(frame({ t: 'done', credits: 0.05 }));
      first.close();
    });
    await waitFor(() => expect(screen.getByText(PLAN_REPLY)).toBeTruthy());
    await flushSettled();

    await submitCreation(YES_REPLY);
    await waitFor(() => expect(callsTo(fetchStub, '/api/chat')).toHaveLength(2));
    expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(0);
    await act(async () => {
      second.push(frame({ t: 'content', text: midAck }));
      second.push(frame({ t: 'done', credits: 0.05 }));
      second.close();
    });
    await waitFor(() => expect(screen.getByText(midAck)).toBeTruthy());
    /* The first verdict is now in flight (building). A second yes streams… */
    await waitFor(() => expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(1));
    await submitCreation('Also add XP roles');
    await act(async () => {
      third.push(frame({ t: 'content', text: 'On it.' }));
      third.push(frame({ t: 'done', credits: 0.05 }));
      third.close();
    });
    await waitFor(() => expect(screen.getByText('On it.')).toBeTruthy());
    await flushSettled();
    /* …and even with an eligible turn streaming in, no second verdict posts. */
    expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(1);

    await act(async () => {
      resolveVerdict(null);
    });
    const link = await screen.findByRole('link', { name: BUILD_LINK_NAME });
    expect(link.getAttribute('href')).toBe('/dashboard?runId=run-123');
    await flushSettled();
    expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(1);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('mint race shows the saving line with no POST until the id lands', async () => {
    const first = sseStream();
    const second = sseStream();
    let resolveMint: (value: unknown) => void = () => {};
    const mintGate = new Promise((gate) => {
      resolveMint = gate;
    });
    const fetchStub = vi.fn();
    let chatCalls = 0;
    fetchStub.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/bots') {
        return mintGate.then(() => mintResponse(BOT_ID));
      }
      const conversation = conversationStub(url, init, BOT_ID);
      if (conversation !== null) return conversation;
      if (url === '/api/builder/verdict') {
        return Promise.resolve(verdictYes('run-456'));
      }
      if (url.startsWith('/api/builder?runId=')) {
        return Promise.resolve(builderPhase('queued'));
      }
      chatCalls += 1;
      return Promise.resolve(streamResponse(chatCalls <= 1 ? first.stream : second.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    await submitCreation('A moderation helper');
    await act(async () => {
      first.push(frame({ t: 'content', text: PLAN_REPLY }));
      first.push(frame({ t: 'done', credits: 0.05 }));
      first.close();
    });
    await waitFor(() => expect(screen.getByText(PLAN_REPLY)).toBeTruthy());
    await flushSettled();

    await submitCreation(YES_REPLY);
    await act(async () => {
      second.push(frame({ t: 'content', text: ACK_REPLY }));
      second.push(frame({ t: 'done', credits: 0.05 }));
      second.close();
    });
    await waitFor(() => expect(screen.getByText(ACK_REPLY)).toBeTruthy());
    await flushSettled();
    /* Adjacency holds but the bot id has not landed: the saving line shows
       and no verdict is queued. */
    expect(screen.getByText(SAVING_LINE)).toBeTruthy();
    expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(0);

    await act(async () => {
      resolveMint(null);
    });
    const link = await screen.findByRole('link', { name: BUILD_LINK_NAME });
    expect(link.getAttribute('href')).toBe('/dashboard?runId=run-456');
    expect(screen.queryByText(SAVING_LINE)).toBeNull();
    const verdicts = callsTo(fetchStub, '/api/builder/verdict');
    expect(verdicts).toHaveLength(1);
    expect(JSON.parse(String((verdicts[0][1] as RequestInit).body)).botId).toBe(BOT_ID);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('a verdict transport failure shows the honest fallback, no run', async () => {
    const first = sseStream();
    const second = sseStream();
    const fetchStub = vi.fn();
    let chatCalls = 0;
    fetchStub.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/bots') {
        return Promise.resolve(mintResponse(BOT_ID));
      }
      const conversation = conversationStub(url, init, BOT_ID);
      if (conversation !== null) return conversation;
      if (url === '/api/builder/verdict') {
        return Promise.reject(new Error('connection reset'));
      }
      chatCalls += 1;
      return Promise.resolve(streamResponse(chatCalls <= 1 ? first.stream : second.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    await submitCreation('A moderation helper');
    await act(async () => {
      first.push(frame({ t: 'content', text: PLAN_REPLY }));
      first.push(frame({ t: 'done', credits: 0.05 }));
      first.close();
    });
    await waitFor(() => expect(screen.getByText(PLAN_REPLY)).toBeTruthy());
    await flushSettled();

    await submitCreation(YES_REPLY);
    await act(async () => {
      second.push(frame({ t: 'content', text: ACK_REPLY }));
      second.push(frame({ t: 'done', credits: 0.05 }));
      second.close();
    });
    await waitFor(() => expect(screen.getByText(ACK_REPLY)).toBeTruthy());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Kurulum başlatılamadı. Tekrar dene.');
    expect(screen.queryByRole('link', { name: BUILD_LINK_NAME })).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  /* M-8: a verdict transport failure clears the judged pin, so the NEXT user
     turn posts again instead of staying dead. The row that died is held by the
     failure marker, so settling alone never re-posts it in a loop: between the
     failure and the next turn the POST count stays at 1. */
  it('a verdict transport failure retries on the next eligible turn', async () => {
    const first = sseStream();
    const second = sseStream();
    const third = sseStream();
    const fetchStub = vi.fn();
    let chatCalls = 0;
    let verdictCalls = 0;
    fetchStub.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/bots') {
        return Promise.resolve(mintResponse(BOT_ID));
      }
      const conversation = conversationStub(url, init, BOT_ID);
      if (conversation !== null) return conversation;
      if (url === '/api/builder/verdict') {
        verdictCalls += 1;
        if (verdictCalls <= 1) {
          return Promise.reject(new Error('connection reset'));
        }
        return Promise.resolve(verdictYes('run-789'));
      }
      if (url.startsWith('/api/builder?runId=')) {
        return Promise.resolve(builderPhase('queued'));
      }
      chatCalls += 1;
      if (chatCalls === 1) return Promise.resolve(streamResponse(first.stream));
      if (chatCalls === 2) return Promise.resolve(streamResponse(second.stream));
      return Promise.resolve(streamResponse(third.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    await submitCreation('A moderation helper');
    await act(async () => {
      first.push(frame({ t: 'content', text: PLAN_REPLY }));
      first.push(frame({ t: 'done', credits: 0.05 }));
      first.close();
    });
    await waitFor(() => expect(screen.getByText(PLAN_REPLY)).toBeTruthy());
    await flushSettled();

    await submitCreation(YES_REPLY);
    await act(async () => {
      second.push(frame({ t: 'content', text: ACK_REPLY }));
      second.push(frame({ t: 'done', credits: 0.05 }));
      second.close();
    });
    await waitFor(() => expect(screen.getByText(ACK_REPLY)).toBeTruthy());

    /* First verdict died in transport: the honest fallback, no run. */
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Kurulum başlatılamadı. Tekrar dene.');
    expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(1);
    /* Settling does not re-post for the row that already died. */
    await flushSettled();
    expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(1);

    /* The next user turn posts again — the pin really was cleared, so the
       failure is not a dead end. The run lands this time. */
    await submitCreation('Yes, start now');
    await act(async () => {
      third.push(frame({ t: 'content', text: 'On it.' }));
      third.push(frame({ t: 'done', credits: 0.05 }));
      third.close();
    });
    await waitFor(() => expect(screen.getByText('On it.')).toBeTruthy());

    const link = await screen.findByRole('link', { name: BUILD_LINK_NAME });
    expect(link.getAttribute('href')).toBe('/dashboard?runId=run-789');
    expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(2);
    const turns = sentTurns(fetchStub, 2);
    expect(turns[turns.length - 1]).toEqual({ role: 'user', content: 'Yes, start now' });
    expect(consoleError).not.toHaveBeenCalled();
  });

  /* M-9: a failed build re-opens the run latch — a later turn posts a FRESH
     verdict and a fresh run starts. The first build's poll reaches terminal
     `failed` (run-1 keeps rendering honest "Build failed"); the page-owned
     latch marks exactly that runId, so the next user turn posts a second
     verdict carrying the new row and lands run-2. The SAME failed row never
     re-posts (loop guard = judged pin, same class as M-8's marker): between
     the failure and the fresh turn, verdict POSTs stay at 1. */
  it('a failed build lets a later yes post a fresh verdict and start a fresh run', async () => {
    const streams: ReturnType<typeof sseStream>[] = [];
    const fetchStub = vi.fn();
    let verdictCalls = 0;
    let failFirstBuilderPoll = true;
    fetchStub.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/bots') {
        return Promise.resolve(mintResponse(BOT_ID));
      }
      const conversation = conversationStub(url, init, BOT_ID);
      if (conversation !== null) return conversation;
      if (url === '/api/builder/verdict') {
        verdictCalls += 1;
        if (verdictCalls <= 1) {
          return Promise.resolve(verdictYes('run-1'));
        }
        return Promise.resolve(verdictYes('run-2'));
      }
      /* run-1's poll reports terminal `failed` twice (both the display poll
         and the page-owned latch poll read it), then answers queued so the
         second run's polls stay live and the gate stays shut for run-2. */
      if (url.startsWith('/api/builder?runId=run-1')) {
        if (failFirstBuilderPoll) {
          return Promise.resolve(builderPhase('failed'));
        }
        return Promise.resolve(builderPhase('queued'));
      }
      if (url.startsWith('/api/builder?runId=run-2')) {
        return Promise.resolve(builderPhase('queued'));
      }
      if (url !== '/api/chat') return Promise.reject(new Error('unexpected call: ' + url));
      const sse = sseStream();
      streams.push(sse);
      return Promise.resolve(streamResponse(sse.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    /* Turn 1: description → plan. */
    await submitCreation('A moderation helper');
    await waitFor(() => expect(streams).toHaveLength(1));
    await act(async () => {
      streams[0].push(frame({ t: 'content', text: PLAN_REPLY }));
      streams[0].push(frame({ t: 'done', credits: 0.05 }));
      streams[0].close();
    });
    await waitFor(() => expect(screen.getByText(PLAN_REPLY)).toBeTruthy());
    await flushSettled();

    /* Turn 2: yes → first verdict posts, run-1 starts. */
    await submitCreation(YES_REPLY);
    await waitFor(() => expect(streams).toHaveLength(2));
    await act(async () => {
      streams[1].push(frame({ t: 'content', text: ACK_REPLY }));
      streams[1].push(frame({ t: 'done', credits: 0.05 }));
      streams[1].close();
    });
    await waitFor(() => expect(screen.getByText(ACK_REPLY)).toBeTruthy());
    await waitFor(() => expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(1));
    const firstLink = await screen.findByRole('link', { name: BUILD_LINK_NAME });
    expect(firstLink.getAttribute('href')).toBe('/dashboard?runId=run-1');

    /* The build fails: honest readout, and settling alone re-posts nothing. */
    await waitFor(() => expect(screen.getByText('Build failed with error')).toBeTruthy());
    await flushSettled();
    expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(1);
    failFirstBuilderPoll = false;

    /* Turn 3: a fresh reply — a FRESH verdict posts and the fresh run lands. */
    await submitCreation('Yes, start fresh');
    await waitFor(() => expect(streams).toHaveLength(3));
    await act(async () => {
      streams[2].push(frame({ t: 'content', text: 'On it.' }));
      streams[2].push(frame({ t: 'done', credits: 0.05 }));
      streams[2].close();
    });
    await waitFor(() => expect(screen.getByText('On it.')).toBeTruthy());

    await waitFor(() => expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(2));
    const verdicts = callsTo(fetchStub, '/api/builder/verdict');
    const secondBody = JSON.parse(String((verdicts[1][1] as RequestInit).body)) as {
      botId?: unknown;
      turns: SentTurn[];
    };
    expect(secondBody.botId).toBe(BOT_ID);
    expect(secondBody.turns[secondBody.turns.length - 1]).toEqual({
      role: 'user',
      content: 'Yes, start fresh',
    });
    const freshLink = await screen.findByRole('link', { name: BUILD_LINK_NAME });
    expect(freshLink.getAttribute('href')).toBe('/dashboard?runId=run-2');
    /* The live second run re-latches: settling posts nothing more. */
    await flushSettled();
    expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(2);
    expect(consoleError).not.toHaveBeenCalled();
  });

  /* M-9 follow-up: the per-runId failure marker must not leak across a runId
     change. The page-owned poll still shows run-1's terminal `failed` at the
     commit where run-2 lands; that stale phase must not mark run-2 failed.
     While run-2 is live (non-terminal poll), a further POSITION-ELIGIBLE turn
     posts nothing and the run stays run-2 — held by the run gate, not just the
     judged pin (the turn below is a NEW user row, so the pin cannot hold it).
     Under the position rule this is the sharper form of the assertion: the
     turn is eligible by construction, so only the run gate can hold it. */
  it('a live second run keeps the run gate closed for a further eligible turn', async () => {
    const streams: ReturnType<typeof sseStream>[] = [];
    const fetchStub = vi.fn();
    let verdictCalls = 0;
    let failFirstBuilderPoll = true;
    fetchStub.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/bots') {
        return Promise.resolve(mintResponse(BOT_ID));
      }
      const conversation = conversationStub(url, init, BOT_ID);
      if (conversation !== null) return conversation;
      if (url === '/api/builder/verdict') {
        verdictCalls += 1;
        if (verdictCalls <= 1) {
          return Promise.resolve(verdictYes('run-1'));
        }
        if (verdictCalls <= 2) {
          return Promise.resolve(verdictYes('run-2'));
        }
        return Promise.resolve(verdictYes('run-3'));
      }
      if (url.startsWith('/api/builder?runId=run-1')) {
        if (failFirstBuilderPoll) {
          return Promise.resolve(builderPhase('failed'));
        }
        return Promise.resolve(builderPhase('queued'));
      }
      if (url.startsWith('/api/builder?runId=run-2')) {
        return Promise.resolve(builderPhase('queued'));
      }
      if (url !== '/api/chat') return Promise.reject(new Error('unexpected call: ' + url));
      const sse = sseStream();
      streams.push(sse);
      return Promise.resolve(streamResponse(sse.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    /* Turn 1: description → plan. */
    await submitCreation('A moderation helper');
    await waitFor(() => expect(streams).toHaveLength(1));
    await act(async () => {
      streams[0].push(frame({ t: 'content', text: PLAN_REPLY }));
      streams[0].push(frame({ t: 'done', credits: 0.05 }));
      streams[0].close();
    });
    await waitFor(() => expect(screen.getByText(PLAN_REPLY)).toBeTruthy());
    await flushSettled();

    /* Turn 2: yes → first verdict posts, run-1 starts. */
    await submitCreation(YES_REPLY);
    await waitFor(() => expect(streams).toHaveLength(2));
    await act(async () => {
      streams[1].push(frame({ t: 'content', text: ACK_REPLY }));
      streams[1].push(frame({ t: 'done', credits: 0.05 }));
      streams[1].close();
    });
    await waitFor(() => expect(screen.getByText(ACK_REPLY)).toBeTruthy());
    await waitFor(() => expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(1));
    const firstLink = await screen.findByRole('link', { name: BUILD_LINK_NAME });
    expect(firstLink.getAttribute('href')).toBe('/dashboard?runId=run-1');

    /* The build fails: honest readout, and settling alone re-posts nothing. */
    await waitFor(() => expect(screen.getByText('Build failed with error')).toBeTruthy());
    await flushSettled();
    expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(1);
    failFirstBuilderPoll = false;

    /* Turn 3: a fresh reply — a FRESH verdict posts and run-2 lands. */
    await submitCreation('Yes, start fresh');
    await waitFor(() => expect(streams).toHaveLength(3));
    await act(async () => {
      streams[2].push(frame({ t: 'content', text: 'On it.' }));
      streams[2].push(frame({ t: 'done', credits: 0.05 }));
      streams[2].close();
    });
    await waitFor(() => expect(screen.getByText('On it.')).toBeTruthy());
    await waitFor(() => expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(2));
    const freshLink = await screen.findByRole('link', { name: BUILD_LINK_NAME });
    expect(freshLink.getAttribute('href')).toBe('/dashboard?runId=run-2');
    await flushSettled();
    expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(2);

    /* Turn 4: another reply — eligible by position (an assistant turn precedes
       it) WHILE run-2 is live (its poll stays non-terminal `queued`). A leaked
       failure marker would leave the run gate open and post a third verdict —
       the gate must hold it at exactly 2 and the run must stay run-2. */
    await submitCreation('Add XP roles too');
    await waitFor(() => expect(streams).toHaveLength(4));
    await act(async () => {
      streams[3].push(frame({ t: 'content', text: 'Sure — noted.' }));
      streams[3].push(frame({ t: 'done', credits: 0.05 }));
      streams[3].close();
    });
    await waitFor(() => expect(screen.getByText('Sure — noted.')).toBeTruthy());
    await flushSettled();
    expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(2);
    const heldLink = await screen.findByRole('link', { name: BUILD_LINK_NAME });
    expect(heldLink.getAttribute('href')).toBe('/dashboard?runId=run-2');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('a whitespace submit never chats, mints, or judges — no alert', async () => {
    const fetchStub = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/bots') {
        return Promise.resolve(mintResponse('11111111-1111-4111-8111-111111111111'));
      }
      const conversation = conversationStub(url, init, '11111111-1111-4111-8111-111111111111');
      if (conversation !== null) return conversation;
      return Promise.resolve(streamResponse(sseStream().stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);
    expect(screen.queryByRole('button', { name: 'Build this bot' })).toBeNull();
    const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    /* A whitespace submit is refused by the composer: no chat turn, no mint,
       no verdict post, no alert — the page stays honest instead of erroring. */
    expect(callsTo(fetchStub, '/api/chat')).toHaveLength(0);
    expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(0);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('a failed mint shows an error, keeps the chat, and never judges', async () => {
    const sse = sseStream();
    const fetchStub = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/bots') {
        return Promise.resolve({
          ok: false,
          status: 500,
          body: null,
          json: async () => ({ error: 'mint blew up' }),
        });
      }
      const conversation = conversationStub(url, init, BOT_ID);
      if (conversation !== null) return conversation;
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
    expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(0);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('a failed mint retries on the next submit and the id still lands', async () => {
    const first = sseStream();
    const second = sseStream();
    const third = sseStream();
    let mintCalls = 0;
    let chatCalls = 0;
    const fetchStub = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/bots') {
        mintCalls += 1;
        if (mintCalls <= 1) {
          return Promise.resolve({
            ok: false,
            status: 500,
            body: null,
            json: async () => ({ error: 'mint blew up' }),
          });
        }
        return Promise.resolve(mintResponse(BOT_ID));
      }
      const conversation = conversationStub(url, init, BOT_ID);
      if (conversation !== null) return conversation;
      chatCalls += 1;
      if (chatCalls <= 1) return Promise.resolve(streamResponse(first.stream));
      if (chatCalls <= 2) return Promise.resolve(streamResponse(second.stream));
      return Promise.resolve(streamResponse(third.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    await submitCreation('First idea');
    await act(async () => {
      first.push(frame({ t: 'content', text: 'First answer.' }));
      first.push(frame({ t: 'done', credits: 0.05 }));
      first.close();
    });
    await waitFor(() => expect(screen.getByText('First answer.')).toBeTruthy());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('mint blew up');
    expect(callsTo(fetchStub, '/api/bots')).toHaveLength(1);
    await flushSettled();

    await submitCreation('Second idea');
    await act(async () => {
      second.push(frame({ t: 'content', text: 'Second answer.' }));
      second.push(frame({ t: 'done', credits: 0.05 }));
      second.close();
    });
    await waitFor(() => expect(screen.getByText('Second answer.')).toBeTruthy());
    await flushSettled();
    /* The retry re-minted instead of skipping forever. */
    expect(callsTo(fetchStub, '/api/bots')).toHaveLength(2);

    /* The retried id committed: the next turn carries it, so the verdict
       gate (botId === null → return) can open again. No third mint fires. */
    await submitCreation('Third idea');
    await waitFor(() => expect(callsTo(fetchStub, '/api/chat')).toHaveLength(3));
    const chats = callsTo(fetchStub, '/api/chat');
    expect(JSON.parse(String((chats[2][1] as RequestInit).body)).botId).toBe(BOT_ID);
    expect(callsTo(fetchStub, '/api/bots')).toHaveLength(2);
    expect(consoleError).not.toHaveBeenCalled();
  });

  /* KI-033: the mint gate refuses an expired trial with 403
     { error: 'trial_expired', message: <the honest sentence> }. The page shows
     the sentence the server wrote — a code like "trial_expired" is not
     something a person can act on. */
  it('shows the server’s honest sentence when the mint is refused by the trial gate', async () => {
    const sse = sseStream();
    const fetchStub = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/bots') {
        return Promise.resolve({
          ok: false,
          status: 403,
          body: null,
          json: async () => ({ error: 'trial_expired', message: TRIAL_EXPIRED_MESSAGE }),
        });
      }
      const conversation = conversationStub(url, init, BOT_ID);
      if (conversation !== null) return conversation;
      return Promise.resolve(streamResponse(sse.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    await submitCreation('One more idea');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(TRIAL_EXPIRED_MESSAGE);
    expect(alert.textContent).not.toContain('trial_expired');
    expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(0);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows the server’s honest sentence when the verdict is refused by the trial gate', async () => {
    const first = sseStream();
    const second = sseStream();
    const fetchStub = vi.fn();
    let chatCalls = 0;
    fetchStub.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/bots') {
        return Promise.resolve(mintResponse(BOT_ID));
      }
      const conversation = conversationStub(url, init, BOT_ID);
      if (conversation !== null) return conversation;
      if (url === '/api/builder/verdict') {
        return Promise.resolve({
          ok: false,
          status: 403,
          body: null,
          json: async () => ({ error: 'trial_expired', message: TRIAL_EXPIRED_MESSAGE }),
        });
      }
      chatCalls += 1;
      return Promise.resolve(streamResponse(chatCalls <= 1 ? first.stream : second.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    await submitCreation('A moderation helper');
    await act(async () => {
      first.push(frame({ t: 'content', text: PLAN_REPLY }));
      first.push(frame({ t: 'done', credits: 0.05 }));
      first.close();
    });
    await waitFor(() => expect(screen.getByText(PLAN_REPLY)).toBeTruthy());
    await flushSettled();

    await submitCreation(YES_REPLY);
    await act(async () => {
      second.push(frame({ t: 'content', text: ACK_REPLY }));
      second.push(frame({ t: 'done', credits: 0.05 }));
      second.close();
    });
    await waitFor(() => expect(screen.getByText(ACK_REPLY)).toBeTruthy());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(TRIAL_EXPIRED_MESSAGE);
    expect(screen.queryByRole('link', { name: BUILD_LINK_NAME })).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('repro: composer is interactive after the reply completes', async () => {
    const sse = sseStream();
    const fetchStub = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/bots') {
        return Promise.resolve(mintResponse('11111111-1111-4111-8111-111111111111'));
      }
      const conversation = conversationStub(url, init, '11111111-1111-4111-8111-111111111111');
      if (conversation !== null) return conversation;
      return Promise.resolve(streamResponse(sse.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    await submitCreation('A welcome bot for my study server');
    /* Positive control: the chat turn left while the stream stays open… */
    await waitFor(() => expect(callsTo(fetchStub, '/api/chat')).toHaveLength(1));
    /* …the send gate is up, and the composer stays editable — never inert. */
    expectSendGated();

    await act(async () => {
      sse.push(frame({ t: 'content', text: 'Got it — drafting.' }));
      sse.push(frame({ t: 'done', credits: 1.1 }));
      sse.close();
    });
    await waitFor(() => expect(screen.getByText('Got it — drafting.')).toBeTruthy());
    await expectComposerUnlocked();
    /* The mid-stream draft survived the reply arriving. */
    expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe(
      'held while streaming',
    );

    /* Interactive means the held text actually sends now. */
    const sse2 = sseStream();
    fetchStub.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/bots') {
        return Promise.resolve(mintResponse('11111111-1111-4111-8111-111111111111'));
      }
      const conversation = conversationStub(url, init, '11111111-1111-4111-8111-111111111111');
      if (conversation !== null) return conversation;
      return Promise.resolve(streamResponse(sse2.stream));
    });
    fireEvent.keyDown(screen.getByLabelText('Prompt'), { key: 'Enter' });
    await waitFor(() => expect(callsTo(fetchStub, '/api/chat')).toHaveLength(2));
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('repro: composer unlocks after an error event', async () => {
    const sse = sseStream();
    const fetchStub = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/bots') {
        return Promise.resolve(mintResponse('11111111-1111-4111-8111-111111111111'));
      }
      const conversation = conversationStub(url, init, '11111111-1111-4111-8111-111111111111');
      if (conversation !== null) return conversation;
      return Promise.resolve(streamResponse(sse.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    await submitCreation('Trigger an error');
    await waitFor(() => expect(callsTo(fetchStub, '/api/chat')).toHaveLength(1));
    expectSendGated();
    await act(async () => {
      sse.push(frame({ t: 'error', message: 'Upstream blew up.' }));
      sse.close();
    });
    await waitFor(() => expect(screen.getByText('Upstream blew up.')).toBeTruthy());
    await expectComposerUnlocked();
    /* The draft survived the error and sends on the next Enter. */
    fireEvent.keyDown(screen.getByLabelText('Prompt'), { key: 'Enter' });
    await waitFor(() => expect(callsTo(fetchStub, '/api/chat')).toHaveLength(2));
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('repro: composer unlocks on a chat HTTP error', async () => {
    let chatCalls = 0;
    const fetchStub = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/bots') {
        return Promise.resolve(mintResponse('11111111-1111-4111-8111-111111111111'));
      }
      const conversation = conversationStub(url, init, '11111111-1111-4111-8111-111111111111');
      if (conversation !== null) return conversation;
      chatCalls += 1;
      if (chatCalls <= 1) {
        return Promise.resolve({
          ok: false,
          status: 500,
          body: null,
          json: async () => ({ error: 'chat blew up' }),
        });
      }
      const retryStream = sseStream();
      return Promise.resolve(streamResponse(retryStream.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    await submitCreation('Trigger a 500');
    await waitFor(() => expect(callsTo(fetchStub, '/api/chat')).toHaveLength(1));
    await expectComposerUnlocked();
    /* Sends again after the HTTP error. */
    const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Retry after 500' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await waitFor(() => expect(callsTo(fetchStub, '/api/chat')).toHaveLength(2));
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('repro: composer unlocks on a chat network throw', async () => {
    let chatCalls = 0;
    const fetchStub = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/bots') {
        return Promise.resolve(mintResponse('11111111-1111-4111-8111-111111111111'));
      }
      const conversation = conversationStub(url, init, '11111111-1111-4111-8111-111111111111');
      if (conversation !== null) return conversation;
      chatCalls += 1;
      if (chatCalls <= 1) {
        return Promise.reject(new Error('connection reset'));
      }
      const retryStream = sseStream();
      return Promise.resolve(streamResponse(retryStream.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    await submitCreation('Trigger a throw');
    await waitFor(() => expect(callsTo(fetchStub, '/api/chat')).toHaveLength(1));
    await expectComposerUnlocked();
    /* Sends again after the network throw. */
    const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Retry after throw' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await waitFor(() => expect(callsTo(fetchStub, '/api/chat')).toHaveLength(2));
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('repro: mint resolving mid-stream still unlocks and commits', async () => {
    const sse = sseStream();
    let resolveMint: (value: unknown) => void = () => {};
    const mintGate = new Promise((gate) => {
      resolveMint = gate;
    });
    const fetchStub = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/bots') {
        return mintGate.then(() => mintResponse('33333333-3333-4333-8333-333333333333'));
      }
      const conversationMid = conversationStub(url, init, '33333333-3333-4333-8333-333333333333');
      if (conversationMid !== null) return conversationMid;
      return Promise.resolve(streamResponse(sse.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    await submitCreation('Mint me mid-stream');
    await waitFor(() => expect(callsTo(fetchStub, '/api/chat')).toHaveLength(1));
    /* The send gate is up while the mint is still in flight — and the
       composer stays editable, never inert. */
    expectSendGated();

    /* The stream finishes while the mint is still in flight: the lock clears
       now, not when the mint lands. */
    await act(async () => {
      sse.push(frame({ t: 'content', text: 'Drafting.' }));
      sse.push(frame({ t: 'done', credits: 0.05 }));
      sse.close();
    });
    await waitFor(() => expect(screen.getByText('Drafting.')).toBeTruthy());
    await expectComposerUnlocked();
    expect(callsTo(fetchStub, '/api/builder/verdict')).toHaveLength(0);

    /* The late mint still commits: the next turn carries the id. */
    await act(async () => {
      resolveMint(null);
    });
    await flushSettled();
    const sse2 = sseStream();
    fetchStub.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/bots') {
        return Promise.resolve(mintResponse('33333333-3333-4333-8333-333333333333'));
      }
      const conversation = conversationStub(url, init, '33333333-3333-4333-8333-333333333333');
      if (conversation !== null) return conversation;
      return Promise.resolve(streamResponse(sse2.stream));
    });
    await submitCreation('Second question');
    await waitFor(() => expect(callsTo(fetchStub, '/api/chat')).toHaveLength(2));
    const chats = callsTo(fetchStub, '/api/chat');
    expect(JSON.parse(String((chats[1][1] as RequestInit).body)).botId).toBe(
      '33333333-3333-4333-8333-333333333333',
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('repro: mint 500 unlocks the composer', async () => {
    const sse = sseStream();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url === '/api/bots') {
          return Promise.resolve({
            ok: false,
            status: 500,
            body: null,
            json: async () => ({ error: 'mint blew up' }),
          });
        }
        const conversation = conversationStub(url, init, BOT_ID);
        if (conversation !== null) return conversation;
        return Promise.resolve(streamResponse(sse.stream));
      }),
    );
    render(<NewBotPage />);

    await submitCreation('Keep chatting');
    await act(async () => {
      sse.push(frame({ t: 'content', text: 'Still here.' }));
      sse.push(frame({ t: 'done', credits: 0.05 }));
      sse.close();
    });
    await waitFor(() => expect(screen.getByText('Still here.')).toBeTruthy());
    await expectComposerUnlocked();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('composer draws no focus ring of any color — only the border shift', () => {
    render(<NewBotPage />);
    /* The no-ring scope rides with the composer shell on this page and cannot
       leak onto other surfaces; the old teal scope class is gone. */
    expect(composerShell().className).toContain(threadStyles.composerNoRing);
    expect(composerShell().className).not.toContain(threadStyles.composerLocked);
    expect(composerShell().className).not.toContain('composerFocus');
    const css = readFileSync(join(process.cwd(), 'components/ui/chat-thread.module.css'), 'utf8');
    expect(css).not.toContain('#2dd4bf');
    expect(css).not.toContain('composerFocus');
    expect(css).toContain('composerNoRing');
    expect(css).toMatch(/outline:\s*none/);
    /* The global kit ring stays byte-identical for every other surface. */
    const globals = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
    expect(globals).toMatch(/:focus-visible\s*\{/);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('type-while-streaming: textarea stays editable and chips keep filling', async () => {
    const sse = sseStream();
    const fetchStub = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/bots') {
        return Promise.resolve(mintResponse('11111111-1111-4111-8111-111111111111'));
      }
      const conversation = conversationStub(url, init, '11111111-1111-4111-8111-111111111111');
      if (conversation !== null) return conversation;
      return Promise.resolve(streamResponse(sse.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    await submitCreation('First question');
    await waitFor(() => expect(callsTo(fetchStub, '/api/chat')).toHaveLength(1));
    /* Editable mid-stream: never inert, never dimmed, never disabled. */
    const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'typed mid-stream' } });
    expect(textarea.value).toBe('typed mid-stream');
    expect(textarea.disabled).toBe(false);
    expect(composerShell().hasAttribute('inert')).toBe(false);
    expect(composerShell().className).not.toContain(threadStyles.composerLocked);
    /* Chips only fill while streaming — they never send. */
    const group = screen.getByRole('group', { name: 'Önerilen değişiklikler' });
    fireEvent.click(within(group).getByRole('button', { name: CHIP_NAME }));
    expect(textarea.value).toBe(CHIP_NAME);
    expect(callsTo(fetchStub, '/api/chat')).toHaveLength(1);
    /* The reply arriving drops nothing. */
    await act(async () => {
      sse.push(frame({ t: 'content', text: 'First answer.' }));
      sse.push(frame({ t: 'done', credits: 0.05 }));
      sse.close();
    });
    await waitFor(() => expect(screen.getByText('First answer.')).toBeTruthy());
    expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe(CHIP_NAME);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('send click and Enter do nothing while streaming and the text is preserved', async () => {
    const sse = sseStream();
    const fetchStub = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/bots') {
        return Promise.resolve(mintResponse('11111111-1111-4111-8111-111111111111'));
      }
      const conversation = conversationStub(url, init, '11111111-1111-4111-8111-111111111111');
      if (conversation !== null) return conversation;
      return Promise.resolve(streamResponse(sse.stream));
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<NewBotPage />);

    await submitCreation('First question');
    await waitFor(() => expect(callsTo(fetchStub, '/api/chat')).toHaveLength(1));
    const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'do not send yet' } });
    /* The send button is a real disabled control with its own visible style —
       status is never conveyed by a dimmed parent alone. */
    const send = sendButton();
    expect(send.disabled).toBe(true);
    expect(send.getAttribute('aria-disabled')).toBe('true');
    expect(send.className).toContain('opacity-50');
    expect(send.className).toContain('cursor-not-allowed');
    /* Neither path sends, and neither clears: the second-submit-today
       drop-and-clear dies here. */
    fireEvent.click(send);
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(callsTo(fetchStub, '/api/chat')).toHaveLength(1);
    expect(textarea.value).toBe('do not send yet');
    /* Finishing the stream still drops nothing. */
    await act(async () => {
      sse.push(frame({ t: 'content', text: 'First answer.' }));
      sse.push(frame({ t: 'done', credits: 0.05 }));
      sse.close();
    });
    await waitFor(() => expect(screen.getByText('First answer.')).toBeTruthy());
    expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe('do not send yet');
    expect(consoleError).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { fetchBots, mapLiveStatus, MOCK_BOTS, readLiveBotRows, resolveBotId } from '@/lib/bots';
import BotsPage from './page';

/* ?runId= is the real builder run a started build hands back; the progress
   panel polls it. Absent, the panel shows its honest no-run state. */
const navState = vi.hoisted(() => ({ runId: null as string | null }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === 'runId' ? navState.runId : null),
  }),
}));

/* Moved verbatim from the old dashboard ?view=bots branch coverage — the
   bots list is its own page at /dashboard/bots now. The page speaks the
   owner's language (Turkish). `ENGLISH_RESIDUE` sweeps `document.body.textContent`,
   so it catches text-node strings only — it is structurally blind to strings
   carried by attributes. The one attribute-carried string this page owns with
   no compensating assertion is the search input's `placeholder`, and it is
   covered by the direct `getByPlaceholderText` assertion in the search-control
   test below, not by the sweep. */
/* Model names may never appear in user copy — verified against the rendered text. */
const MODEL_NAMES = ['Sonnet', 'GPT', 'Gemini', 'GLM', 'grok'];

/* English words this page must never show again: each was a live string before
   the Turkish pass, so the check fails if one comes back. Two sources are
   deliberately NOT listed because they are owned by other files and still
   English on purpose — the KI-033 trial banner (`TRIAL_EXPIRED_MESSAGE`, byte
   locked in `lib/bots.ts`) and everything the shared `BuilderProgress`
   component renders (`No run started`, `Queued`, `Generating`, …), which
   `/dashboard` also shows.

   The search input's `placeholder` baseline (`Search bots...`) is also absent
   from this list, for a different reason: it is an *attribute*, and this sweep
   reads `document.body.textContent`, which never contains attribute values — an
   entry for it here could never fire, whatever text it held. It is guarded
   instead by the direct `getByPlaceholderText('Botlarda ara…')` assertion in
   the search-control test below; do not re-add it here. */
const ENGLISH_RESIDUE: [string, string][] = [
  ['page title', 'Bots'],
  ['page sub', 'Describe one and it lands here.'],
  ['section title', 'Your bots'],
  ['section region', 'Your bots'],
  ['new bot action', 'New bot'],
  ['counts line', 'No data yet'],
  ['counts line', 'Live '],
  ['counts line', 'Loading…'],
  ['tabs', 'All'],
  ['tab group', 'Filter bots by status'],
  ['search label', 'Search bots'],
  ['sort label', 'Sort bots'],
  ['sort option', 'Name A-Z'],
  ['sort option', 'Status'],
  ['loading line', 'Loading your bots'],
  ['empty state', 'No bots yet — describe your first bot.'],
  ['empty action', 'Describe your first bot'],
  ['no-match state', 'No bots match this filter.'],
  ['no-match action', 'Clear search'],
  ['logged-out line', 'You are logged out'],
  ['logged-out action', 'Log in'],
  ['status pill', 'Offline'],
  ['status pill', 'Trial'],
  ['card action', 'Open'],
  ['card action', 'Activity'],
  ['card action', 'Pre-flight'],
  ['card aria', 'open bot detail'],
  ['cards list aria', 'Bot cards'],
  ['build panel', 'Build progress'],
  ['build panel sub', 'Follow your bot from draft to saved version.'],
  ['count unit', 'members'],
  ['count unit', 'servers'],
];

/* The non-coder voice list from Docs/04_design_language.md §6 — none may ship. */
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

beforeEach(() => {
  navState.runId = null;
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

function renderBotsPage(props: { bots?: Parameters<typeof BotsPage>[0]['bots'] } = {}) {
  return render(<BotsPage {...props} />);
}

function botListItems(): HTMLElement[] {
  const list = screen.getByRole('list', { name: 'Bot kartları' });
  return within(list).getAllByRole('listitem');
}

function firstCardText(): string {
  return botListItems()[0].textContent ?? '';
}

function expectNoForbiddenJargon() {
  const text = (document.body.textContent ?? '').toLowerCase();
  for (const term of FORBIDDEN) {
    expect(text, `forbidden term shipped: ${term}`).not.toContain(term.toLowerCase());
  }
  for (const name of MODEL_NAMES) {
    expect(text, `model name shipped: ${name}`).not.toContain(name.toLowerCase());
  }
}

/* Criterion: no string this page owned in English survives the Turkish pass.
   The online pill's name is checked here too — during the Turkish pass the
   guard as first written let an English `Live` pill through, because that
   string only appears when a row is online and the other cases inject offline
   rows. Both spellings are listed, `Live` and the counts-line tab word. */
function expectNoEnglishResidue() {
  const text = document.body.textContent ?? '';
  for (const [what, english] of ENGLISH_RESIDUE) {
    expect(text, `${what} still English: ${english}`).not.toContain(english);
  }
}

/* The one row shape that shows every status word at once: pills read
   Canlı / Deneme / Çevrimdışı, the tabs read Tümü / Canlı / Deneme, and the
   counts line reads Canlı n / Deneme n / Çevrimdışı n. */
function renderAllThreeStatuses() {
  renderBotsPage({
    bots: [
      { id: 'bot-1', name: 'Alpha', status: 'online' },
      { id: 'bot-2', name: 'Beta', status: 'trial' },
      { id: 'bot-3', name: 'Gamma', status: 'offline' },
    ],
  });
}

describe('dashboard bots page', () => {
  it('renders the Bots title block with the search control', () => {
    renderBotsPage({ bots: [{ id: 'bot-9', name: 'Seed Bot', status: 'offline' }] });
    expect(screen.getByRole('heading', { level: 1, name: 'Botlar' })).toBeTruthy();
    expect(screen.getByText('Anlat, botun burada belirsin.')).toBeTruthy();
    const bots = screen.getByRole('region', { name: 'Botların' });
    expect(within(bots).getByLabelText('Botlarda ara')).toBeTruthy();
    /* The search input's placeholder is Turkish too (page.tsx:225), and it is
       visible on first paint. Asserted directly through its own channel: the
       placeholder is an attribute, so the `ENGLISH_RESIDUE` textContent sweep
       cannot see it — this assertion is the sole guard on that string. */
    expect(screen.getByPlaceholderText('Botlarda ara…')).toBeTruthy();
    /* KI-030: no example rows passed off as the account's data. */
    expect(document.body.textContent).not.toContain('(example)');
    expectNoEnglishResidue();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('links New bot to the creation page and carries no overlay', () => {
    renderBotsPage({ bots: [{ id: 'bot-9', name: 'Seed Bot', status: 'offline' }] });
    const action = screen.getByRole('link', { name: 'Yeni bot' });
    expect(action.getAttribute('href')).toBe('/dashboard/new');
    /* The overlay era is over — no dialog, no prompt composer on the list. */
    expect(screen.queryByRole('dialog', { name: 'Yeni bot' })).toBeNull();
    expect(screen.queryByLabelText('Prompt')).toBeNull();
    const bots = screen.getByRole('region', { name: 'Botların' });
    expect(within(bots).getByRole('list', { name: 'Bot kartları' })).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('holds a loading shell until the list fetch resolves — never a false empty flash', async () => {
    renderBotsPage();
    /* Fetch still in flight: the shell holds, not "No bots yet". */
    expect(screen.getByText('Botların yükleniyor…')).toBeTruthy();
    /* Counts line has its own loading branch (page.tsx:192) — guarded here so
       an English revert trips the suite. */
    const botsRegion = screen.getByRole('region', { name: 'Botların' });
    expect(within(botsRegion).getByText('Yükleniyor…')).toBeTruthy();
    expectNoEnglishResidue();
    expect(screen.queryByText('Henüz botun yok — ilk botunu anlat.')).toBeNull();
    /* The rejected stub resolves to an honest empty list: the empty state lands. */
    expect(await screen.findByText('Henüz botun yok — ilk botunu anlat.')).toBeTruthy();
    const bots = screen.getByRole('region', { name: 'Botların' });
    expect(within(bots).getByText('Henüz veri yok')).toBeTruthy();
    expect(document.body.textContent).not.toContain('(example)');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('ships no forbidden jargon on the bots surface', () => {
    renderBotsPage({ bots: [{ id: 'bot-9', name: 'Seed Bot', status: 'offline' }] });
    expectNoForbiddenJargon();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('names every status in Turkish — pills, tabs and the counts line', () => {
    renderAllThreeStatuses();
    /* Pills. The default order is urgency (offline, trial, online), so the
       cards are looked up by name rather than by index. */
    const items = botListItems();
    const cardOf = (name: string) => items.find((item) => item.textContent?.includes(name));
    expect(within(cardOf('Gamma') as HTMLElement).getByText('Çevrimdışı')).toBeTruthy();
    expect(within(cardOf('Beta') as HTMLElement).getByText('Deneme')).toBeTruthy();
    expect(within(cardOf('Alpha') as HTMLElement).getByText('Canlı')).toBeTruthy();
    /* Counts line + tabs, each of the three words spelled the same way. */
    expect(screen.getByText('Canlı 1 / Deneme 1 / Çevrimdışı 1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tümü' })).toBeTruthy();
    /* The sort options read Turkish, and the group label too. */
    expect(screen.getByRole('option', { name: 'Durum' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'İsim A-Z' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Botları duruma göre filtrele' })).toBeTruthy();
    expectNoEnglishResidue();
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('dashboard bot cards — links to the detail page', () => {
  it('renders a media box, title, status pill and three real links per card', () => {
    renderBotsPage({ bots: MOCK_BOTS });
    const items = botListItems();
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByTestId('bot-media-box')).toBeTruthy();
    expect(within(items[0]).getByText('Night Market mods')).toBeTruthy();
    expect(within(items[0]).getByText('Çevrimdışı')).toBeTruthy();
    /* KI-030: injected mock rows carry example counts, so the counts line shows;
       no fabricated activity or timestamps are presented. */
    expect(within(items[0]).getByText('2,013 üye · 2 sunucu')).toBeTruthy();
    expect(items[0].textContent).not.toContain('Published');
    expect(items[0].textContent).not.toContain('2h ago');
    const open = within(items[0]).getByRole('link', { name: 'Aç' });
    expect(open.getAttribute('href')).toBe('/dashboard/bots/bot-3');
    const activity = within(items[0]).getByRole('link', { name: 'Etkinlik' });
    expect(activity.getAttribute('href')).toBe('/dashboard/bots/bot-3?tab=activity');
    const preflight = within(items[0]).getByRole('link', { name: 'Ön kontrol' });
    expect(preflight.getAttribute('href')).toBe('/dashboard/bots/bot-3?tab=preflight');
    /* The card body itself links to the detail page. */
    const body = within(items[0]).getByRole('link', { name: /Night Market mods.*bot detayını aç/ });
    expect(body.getAttribute('href')).toBe('/dashboard/bots/bot-3');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('omits the counts line for live rows with no server counts', () => {
    renderBotsPage({ bots: [{ id: 'bot-9', name: 'Seed Bot', status: 'offline' }] });
    const items = botListItems();
    expect(items).toHaveLength(1);
    expect(items[0].textContent).not.toContain('üye');
    expect(items[0].textContent).not.toContain('Published');
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('dashboard filtering and sorting on the bots page', () => {
  it('filter tabs narrow the bot cards by status', () => {
    renderBotsPage({ bots: MOCK_BOTS });
    fireEvent.click(screen.getByRole('button', { name: 'Deneme' }));
    expect(screen.getByRole('button', { name: 'Deneme' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('link', { name: /Draft Arena/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Study Hall/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Night Market mods/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Canlı' }));
    expect(screen.getByRole('link', { name: /Study Hall/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Draft Arena/ })).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('toolbar search filters the bot cards client-side', () => {
    renderBotsPage({ bots: MOCK_BOTS });
    fireEvent.change(screen.getByLabelText('Botlarda ara'), { target: { value: 'draft' } });
    expect(screen.getByRole('link', { name: /Draft Arena/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Study Hall/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Night Market mods/ })).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('sort select reorders the cards A-Z and restores the default urgency order', () => {
    renderBotsPage({ bots: MOCK_BOTS });
    expect(firstCardText()).toContain('Night Market mods');

    fireEvent.change(screen.getByLabelText('Botları sırala'), { target: { value: 'name' } });
    expect(firstCardText()).toContain('Draft Arena');

    fireEvent.change(screen.getByLabelText('Botları sırala'), { target: { value: 'status' } });
    expect(firstCardText()).toContain('Night Market mods');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows the honest empty state when there are no bots', () => {
    renderBotsPage({ bots: [] });
    expect(screen.getByText('Henüz botun yok — ilk botunu anlat.')).toBeTruthy();
    expect(screen.getByText('Henüz veri yok')).toBeTruthy();
    const describe = screen.getByRole('link', { name: 'İlk botunu anlat' });
    expect(describe.getAttribute('href')).toBe('/dashboard/new');
    expect(screen.queryByRole('list', { name: 'Bot kartları' })).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows a no-match state and the Clear search action restores the list', () => {
    renderBotsPage({ bots: MOCK_BOTS });
    fireEvent.change(screen.getByLabelText('Botlarda ara'), {
      target: { value: 'zzz-no-such-bot' },
    });
    expect(screen.getByText('Bu filtreye uyan bot yok.')).toBeTruthy();
    const clear = screen.getByRole('button', { name: 'Aramayı temizle' });
    fireEvent.click(clear);
    expect(screen.getByRole('list', { name: 'Bot kartları' })).toBeTruthy();
    expect(botListItems()).toHaveLength(3);
    expect((screen.getByLabelText('Botlarda ara') as HTMLInputElement).value).toBe('');
    expect(consoleError).not.toHaveBeenCalled();
  });
});

const LIVE_ID = '11111111-2222-4333-8444-555555555555';

describe('dashboard bots page — live binding', () => {
  it('renders the caller own bots when the live list answers, with live ids in the links', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ id: LIVE_ID, name: 'Real Study', status: 'live' }],
      }),
    );
    renderBotsPage();

    expect(await screen.findByText('Real Study')).toBeTruthy();
    expect(screen.queryByText('Study Hall')).toBeNull();
    const bots = screen.getByRole('region', { name: 'Botların' });
    const body = within(bots).getByRole('link', { name: /Real Study.*bot detayını aç/ });
    expect(body.getAttribute('href')).toBe(`/dashboard/bots/${LIVE_ID}`);
    const open = within(bots).getByRole('link', { name: 'Aç' });
    expect(open.getAttribute('href')).toBe(`/dashboard/bots/${LIVE_ID}`);
    /* A live row carries no server-side counts or activity — the card omits
       the line instead of presenting mock values as the real bot's. */
    expect(bots.textContent).not.toContain('üye');
    expect(bots.textContent).not.toContain('Published');
    expect(fetch).toHaveBeenCalledWith(
      '/api/bots',
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows the logged-out line + login link when the live list answers 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: unknown) => {
        if (url === '/api/session/trial') {
          return Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
        }
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({ error: 'unauthorized' }),
        });
      }),
    );
    renderBotsPage();

    /* The [id] idiom, mirrored: the logged-out line + login link, never "No
       bots yet" — KI-030 still holds (no mock rows as the account's). */
    expect(
      await screen.findByText('Oturumun kapanmış — yeniden giriş yap, sonra tekrar dene.'),
    ).toBeTruthy();
    const login = screen.getByRole('link', { name: 'Giriş yap' });
    expect(login.getAttribute('href')).toBe('/api/auth/login');
    expect(screen.queryByText('Henüz botun yok — ilk botunu anlat.')).toBeNull();
    expect(screen.getByRole('region', { name: 'Botların' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('Study Hall');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows the trial pause banner on the list when the session trial expired', async () => {
    /* The sentence comes from `lib/bots.ts` (`TRIAL_EXPIRED_MESSAGE`) — the page
       prints it verbatim so all three surfaces read the same words. Asserted as
       the exact string, not as "some banner appeared". */
    const TRIAL_ENDED =
      '3 günlük deneme süren bitti — botların duraklatıldı. Hiçbir şey silinmedi.';
    vi.stubGlobal(
      'fetch',
      vi.fn((url: unknown) => {
        if (url === '/api/session/trial') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ trialExpired: true }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [{ id: LIVE_ID, name: 'Real Study', status: 'live' }],
        });
      }),
    );
    renderBotsPage();

    expect(await screen.findByText('Real Study')).toBeTruthy();
    const banner = screen.getByRole('status');
    expect(banner.textContent).toContain(TRIAL_ENDED);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('stays banner-free when the trial endpoint cannot be read (fail-open)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: unknown) => {
        if (url === '/api/session/trial') {
          return Promise.reject(new Error('network disabled in tests'));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [{ id: LIVE_ID, name: 'Real Study', status: 'live' }],
        });
      }),
    );
    renderBotsPage();

    expect(await screen.findByText('Real Study')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows the honest empty state when the live list answers 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'could not load bots' }),
      }),
    );
    renderBotsPage();

    expect(await screen.findByText('Henüz botun yok — ilk botunu anlat.')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Botların' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('Draft Arena');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows the honest empty state when the live list is a real but empty answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] }),
    );
    renderBotsPage();

    expect(await screen.findByText('Henüz botun yok — ilk botunu anlat.')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Botların' })).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('bots live-binding helpers (pure)', () => {
  it('maps stored statuses to UI statuses and never fabricates Live', () => {
    expect(mapLiveStatus('live')).toBe('online');
    expect(mapLiveStatus('staging')).toBe('trial');
    expect(mapLiveStatus('draft')).toBe('trial');
    expect(mapLiveStatus('sleeping')).toBe('offline');
    expect(mapLiveStatus('quarantined')).toBe('offline');
    expect(mapLiveStatus('mystery')).toBe('offline');
  });

  it('coerces a non-uuid display id to null and passes a real uuid through', () => {
    expect(resolveBotId('bot-1')).toBeNull();
    expect(resolveBotId(null)).toBeNull();
    expect(resolveBotId(undefined)).toBeNull();
    expect(resolveBotId(LIVE_ID)).toBe(LIVE_ID);
  });

  it('drops malformed rows and rejects a non-array body', () => {
    expect(readLiveBotRows({})).toBeNull();
    expect(
      readLiveBotRows([
        { id: 'a', name: 'A', status: 'live' },
        { id: 7, name: 'B', status: 'live' },
        { name: 'C', status: 'live' },
      ]),
    ).toEqual([{ id: 'a', name: 'A', status: 'live' }]);
  });

  it('fetchBots treats an empty 200 as a live but empty account', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] }),
    );
    const snapshot = await fetchBots();
    expect(snapshot).toEqual({ bots: [], source: 'live', isLive: true, unauthorized: false });
  });

  it('fetchBots returns an honest empty list on 401 and never throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );
    const snapshot = await fetchBots();
    expect(snapshot.isLive).toBe(false);
    expect(snapshot.unauthorized).toBe(true);
    /* KI-030: failure is empty, not example — never mock bots as the account's. */
    expect(snapshot.bots).toEqual([]);
  });
});

/* KI-014: the BuilderProgress component polled the run row but no dashboard
   page rendered it. Reproduce-first: these fail while the bots list lacks it.
   The panel's own labels are the shared component's (still English — it also
   serves `/dashboard`); only this page's shell around it is Turkish. */
describe('dashboard bots page — builder progress panel', () => {
  it('repro: builder progress was missing on the bots list — the panel now renders', async () => {
    renderBotsPage({ bots: [] });
    const region = screen.getByRole('region', { name: 'Kurulum ilerlemesi' });
    expect(within(region).getByText('Kurulum ilerlemesi')).toBeTruthy();
    expect(within(region).getByText('No run started')).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('polls the real run when opened with ?runId= and shows the current step', async () => {
    navState.runId = LIVE_ID;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: unknown) => {
        const url = String(input);
        if (url.startsWith('/api/builder?runId=')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ phase: 'generating', detail: {} }),
          });
        }
        return Promise.reject(new Error('network disabled in tests'));
      }),
    );
    renderBotsPage();

    expect(await screen.findByText('Generating')).toBeTruthy();
    const region = screen.getByRole('region', { name: 'Kurulum ilerlemesi' });
    expect(within(region).queryByText('No run started')).toBeNull();
    expect(fetch).toHaveBeenCalledWith(`/api/builder?runId=${LIVE_ID}`);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

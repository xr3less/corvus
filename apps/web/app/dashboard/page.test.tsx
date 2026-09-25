import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { TRIAL_DEAL, TRIAL_EXPIRED_MESSAGE } from '@/lib/bots';
import DashboardPage from './page';

/* The bots list is its own page at /dashboard/bots now. ?view=bots only
   triggers a redirect there for old back-links. ?runId= is the real builder
   run a started build hands back; the panel polls it. */
let mockView: string | null = null;
let mockRunId: string | null = null;
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === 'view' ? mockView : key === 'runId' ? mockRunId : null),
  }),
  useRouter: () => ({ replace: mockReplace }),
}));

/* The two trial lines are asserted from their single source of truth
   (`lib/bots.ts`), not retyped here: the page prints them verbatim, so a copy
   in this file could only ever drift from what actually renders. */
const TRIAL_LINE = TRIAL_DEAL;
const TRIAL_EXPIRED_BANNER = TRIAL_EXPIRED_MESSAGE;
const PAGE_TITLE = 'Ana sayfa';
const PAGE_SUB = 'Botlarına bir bakış.';
/* Model names may never appear in user copy — verified against the rendered text. */
const MODEL_NAMES = ['Sonnet', 'GPT', 'Gemini', 'GLM', 'grok'];

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

/* English words this page must never show again: each was a live string before
   the Turkish pass, so the check below fails if one comes back. The two trial
   sentences are owned by `lib/bots.ts` (asserted there), so they are pinned by
   import above rather than duplicated here. */
const ENGLISH_RESIDUE: [string, string][] = [
  ['page title', 'Home'],
  ['page sub', 'Your bots at a glance.'],
  ['get started heading', 'Get started'],
  ['get started sub', 'Two steps done'],
  ['setup step 1', 'Connect your server'],
  ['setup step 2', 'Describe your bot'],
  ['setup step 3', 'Test it'],
  ['setup step 4', 'Go live'],
  ['setup step state done', 'Done'],
  ['setup step state here', 'You are here'],
  ['setup step state next', 'Next'],
  ['build progress heading', 'Build progress'],
  ['build progress sub', 'Follow your bot from draft to saved version.'],
  ['stat live', 'Live bots'],
  ['stat trial', 'On trial'],
  ['stat servers', 'Servers'],
  ['stat credits', 'Credits left'],
  ['honest no-data value', 'No data yet'],
  ['credits loading fallback', '0 of 0 credits'],
  ['loading shell', 'Loading your bots'],
  ['empty state', 'No bots yet'],
  ['create first bot link', 'Create your first bot'],
  ['this week heading', 'This week'],
  ['this week empty', 'No activity yet.'],
  ['pre-flight heading', 'Pre-flight'],
  ['pre-flight empty', 'No scan yet'],
  ['workspace heading', 'Workspace'],
  ['workspace line', 'Workspace: My server'],
  ['upgrade button', 'Upgrade · Coming soon'],
  ['upgrade title', 'Coming soon'],
  ['templates heading', 'Start from a template'],
  ['templates link', 'See all templates'],
  ['overview region', 'Overview'],
];

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockView = null;
  mockRunId = null;
  mockReplace.mockClear();
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

/* A fetch response the test releases by hand, so an in-flight state can be
   asserted deterministically instead of depending on microtask timing. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
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

describe('dashboard home', () => {
  it('renders home with no bots grid and no redirect', () => {
    render(<DashboardPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Ana sayfa' })).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Bot kartları' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Botların' })).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
    /* Home anchors resolve on this view. */
    for (const id of ['#home', '#get-started', '#week', '#preflight', '#workspace']) {
      expect(document.querySelector(id), `missing target for ${id}`).toBeTruthy();
    }
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('redirects ?view=bots arrivals to the bots page (old subpage back-nav)', () => {
    mockView = 'bots';
    render(<DashboardPage />);
    expect(mockReplace).toHaveBeenCalledWith('/dashboard/bots');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders the Home title block and no search control', () => {
    render(<DashboardPage />);
    expect(screen.getByRole('heading', { level: 1, name: PAGE_TITLE })).toBeTruthy();
    expect(screen.getByText(PAGE_SUB)).toBeTruthy();
    expect(screen.queryByLabelText('Botlarda ara')).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders the Get started card with a 2/4 progress bar and four step minis', () => {
    render(<DashboardPage />);
    const region = screen.getByRole('region', { name: 'Başlangıç (2/4)' });
    expect(within(region).getByRole('heading', { name: 'Başlangıç (2/4)' })).toBeTruthy();
    const bar = within(region).getByRole('progressbar', { name: 'Kurulum durumu' });
    expect(bar.getAttribute('aria-valuenow')).toBe('2');
    expect(bar.getAttribute('aria-valuemax')).toBe('4');
    const steps = within(region).getAllByRole('listitem');
    expect(steps).toHaveLength(4);
    expect(steps[0].textContent).toContain('Sunucunu bağla');
    expect(steps[0].textContent).toContain('Tamam');
    expect(steps[1].textContent).toContain('Botunu anlat');
    expect(steps[1].textContent).toContain('Buradasın');
    expect(steps[2].textContent).toContain('Dene');
    expect(steps[2].textContent).toContain('Sırada');
    expect(steps[3].textContent).toContain('Canlıya al');
    expect(steps[3].textContent).toContain('Sırada');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders four stat cards with honest empty values and no mock counts', async () => {
    render(<DashboardPage />);
    const overview = screen.getByRole('region', { name: 'Genel bakış' });
    /* Live/trial/servers count nothing to measure on a bot-less read. The
       credits card shows the loading value mid-flight, then the 0 fallback
       once the credits read settles unread — never a dash after load, never a
       fabricated nonzero. */
    for (const stat of [
      { name: 'Canlı botlar', value: '—' },
      { name: 'Denemede', value: '—' },
      { name: 'Sunucular', value: '—' },
    ]) {
      const card = within(overview).getByRole('group', { name: stat.name });
      expect(within(card).getByText(stat.value)).toBeTruthy();
    }
    const creditsCard = within(overview).getByRole('group', { name: 'Kalan kredi' });
    expect(within(creditsCard).getByText('…')).toBeTruthy();
    await waitFor(() => expect(within(creditsCard).getByText('0 / 0 kredi')).toBeTruthy());
    expect(within(creditsCard).queryByText('…')).toBeNull();
    expect(document.body.textContent).not.toContain('— of —');
    expect(within(overview).getAllByRole('group')).toHaveLength(4);
    /* No (example)-marked numbers and no mock balances anywhere. */
    expect(document.body.textContent).not.toContain('(example)');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows the real balance when the credits endpoint answers', async () => {
    /* A bot-less account with trial credits is still a balance — the endpoint
       says 100 of 100, and the card must show it, not the 0 fallback. */
    vi.stubGlobal(
      'fetch',
      vi.fn((input: unknown) => {
        if (String(input) === '/api/credits') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ remaining: 100, allowance: 100 }),
          });
        }
        return Promise.reject(new Error('network disabled in tests'));
      }),
    );
    render(<DashboardPage />);
    const overview = screen.getByRole('region', { name: 'Genel bakış' });
    const creditsCard = within(overview).getByRole('group', { name: 'Kalan kredi' });
    expect(await within(creditsCard).findByText('100 / 100 kredi')).toBeTruthy();
    expect(within(creditsCard).queryByText('0 / 0 kredi')).toBeNull();
    expect(within(creditsCard).queryByText('…')).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders This week and Pre-flight side by side on home', () => {
    render(<DashboardPage />);
    const week = screen.getByRole('region', { name: 'Bu hafta' });
    expect(within(week).getByRole('heading', { name: 'Bu hafta' })).toBeTruthy();
    /* KI-030: no activity feed exists yet — honest empty state, never mock rows. */
    expect(within(week).queryByRole('listitem')).toBeNull();
    expect(within(week).getByText('Henüz etkinlik yok.')).toBeTruthy();

    const preflight = screen.getByRole('region', { name: 'Ön kontrol' });
    expect(within(preflight).getByRole('heading', { name: 'Ön kontrol' })).toBeTruthy();
    expect(within(preflight).queryByRole('listitem')).toBeNull();
    expect(within(preflight).getByText('Henüz tarama yok — bir botu açıp çalıştır.')).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('keeps This week honest when bots exist — no fabricated activity', () => {
    render(<DashboardPage bots={[{ id: 'bot-9', name: 'Real One', status: 'offline' }]} />);
    const week = screen.getByRole('region', { name: 'Bu hafta' });
    expect(within(week).queryByRole('listitem')).toBeNull();
    expect(within(week).getByText('Henüz etkinlik yok.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('(example)');
    const preflight = screen.getByRole('region', { name: 'Ön kontrol' });
    expect(within(preflight).queryByRole('listitem')).toBeNull();
    expect(within(preflight).getByText('Henüz tarama yok — bir botu açıp çalıştır.')).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders an honest empty state with a link to create the first bot', async () => {
    /* The empty line is a claim about the account's bots, so it may only render
       once the read has settled. The default stub rejects (network disabled in
       tests), so this awaits the resolved-empty state — the same contract the
       sibling failure test below covers for a 500. */
    render(<DashboardPage />);
    const empty = await screen.findByRole('region', { name: 'Henüz bot yok' });
    expect(
      within(empty).getByRole('heading', { name: 'Henüz botun yok — ilk botunu anlat.' }),
    ).toBeTruthy();
    const link = within(empty).getByRole('link', { name: 'İlk botunu anlat' });
    expect(link.getAttribute('href')).toBe('/dashboard/new');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('holds the loading shell while the bots read is in flight, never an empty flash', async () => {
    /* The defect this pins: `liveBots` starts null, so before the guard the page
       rendered "No bots yet" over an account that may well have bots. The fetch
       is held open by hand so the in-flight state is observable rather than
       raced — a rejected-but-unsettled stub exposes it the same way. */
    const pending = deferred<{ ok: boolean; status: number; json: () => Promise<unknown> }>();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: unknown) => {
        if (String(input) === '/api/bots') return pending.promise;
        return Promise.reject(new Error('network disabled in tests'));
      }),
    );
    render(<DashboardPage />);

    /* In flight: the shell is up and the empty claim is nowhere. */
    expect(await screen.findByRole('region', { name: 'Botların yükleniyor' })).toBeTruthy();
    expect(screen.getByText('Botların yükleniyor…')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Henüz bot yok' })).toBeNull();

    /* Releasing the read settles it: the shell yields to the empty state, so
       this asserts a transition and not merely a permanent loading screen. */
    pending.resolve({ ok: true, status: 200, json: async () => [] });
    expect(await screen.findByRole('region', { name: 'Henüz bot yok' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Botların yükleniyor' })).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders the Workspace strip with the trial deal and an honest Upgrade', () => {
    render(<DashboardPage />);
    const workspace = screen.getByRole('region', { name: 'Çalışma alanı' });
    expect(within(workspace).getByRole('heading', { name: 'Çalışma alanı' })).toBeTruthy();
    expect(within(workspace).getByText('Çalışma alanı: Sunucum')).toBeTruthy();
    expect(within(workspace).getByText(TRIAL_LINE)).toBeTruthy();
    expect(within(workspace).getByRole('button', { name: 'Yükselt · Yakında' })).toBeTruthy();
    /* KI-033: the deal line is present-tense truth now — the old "limits not
       enforced yet" wording may never ship again. */
    expect(document.body.textContent).not.toContain('not enforced yet');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows the honest expired banner when the trial clock has passed', async () => {
    render(<DashboardPage trialExpired />);
    expect(screen.getByText(TRIAL_EXPIRED_BANNER)).toBeTruthy();
    /* Nothing is deleted and nothing is hidden: the page still renders its
       real bots and the create link stays reachable. The injected prop settles
       the trial flag, not the bots read, so the empty state is awaited. */
    expect(await screen.findByRole('region', { name: 'Henüz bot yok' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'İlk botunu anlat' })).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('lights the banner from GET /api/session/trial when the endpoint says expired', async () => {
    /* No injected prop: the page reads the signal endpoint once on mount. */
    vi.stubGlobal(
      'fetch',
      vi.fn((input: unknown) => {
        const url = String(input);
        if (url === '/api/session/trial') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ trialExpired: true }),
          });
        }
        return Promise.reject(new Error('network disabled in tests'));
      }),
    );
    render(<DashboardPage />);

    expect(await screen.findByText(TRIAL_EXPIRED_BANNER)).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith('/api/session/trial', expect.objectContaining({}));
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('keeps the banner off when the signal endpoint says the trial runs (fail-open)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: unknown) => {
        const url = String(input);
        if (url === '/api/session/trial') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ trialExpired: false }),
          });
        }
        return Promise.reject(new Error('network disabled in tests'));
      }),
    );
    render(<DashboardPage />);

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText(TRIAL_EXPIRED_BANNER)).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('keeps the banner off when the signal endpoint fails (fail-open, never guesses)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: unknown) => {
        const url = String(input);
        if (url === '/api/session/trial') {
          return Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
        }
        return Promise.reject(new Error('network disabled in tests'));
      }),
    );
    render(<DashboardPage />);

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText(TRIAL_EXPIRED_BANNER)).toBeNull();
    /* Malformed shapes resolve the same way: only an explicit boolean true
       may light the banner. */
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('keeps the banner off on a malformed signal body (only boolean true counts)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: unknown) => {
        const url = String(input);
        if (url === '/api/session/trial') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ trialExpired: 'yes' }),
          });
        }
        return Promise.reject(new Error('network disabled in tests'));
      }),
    );
    render(<DashboardPage />);

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText(TRIAL_EXPIRED_BANNER)).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('repro: workspace Upgrade is honestly disabled with Coming soon', () => {
    render(<DashboardPage />);
    const workspace = screen.getByRole('region', { name: 'Çalışma alanı' });
    const upgrade = within(workspace).getByRole('button', { name: /yükselt/i });
    expect(upgrade.hasAttribute('disabled')).toBe(true);
    expect(upgrade.getAttribute('aria-disabled')).toBe('true');
    expect((upgrade.textContent ?? '').toLowerCase()).toContain('yakında');
  });

  it('renders the template strip with three cards and a real gallery link', () => {
    render(<DashboardPage />);
    const section = screen.getByRole('region', { name: 'Şablonlar' });
    expect(within(section).getByRole('heading', { name: 'Şablondan başla' })).toBeTruthy();
    /* Each preset label byte-matches the catalog seed name
       (apps/gateway/src/db/seed-templates.ts) — the single shared name set
       the landing showcase and the gallery detail pages use. The href is the
       assertion that makes this test able to catch dead cards next time. */
    const presets: { name: string; href: string }[] = [
      { name: 'Mod Shield', href: '/gallery/mod-shield' },
      { name: 'Ticket Desk', href: '/gallery/ticket-desk' },
      { name: 'Welcome Wagon', href: '/gallery/welcome-wagon' },
    ];
    const cards = within(section).getAllByRole('link');
    /* Three preset cards plus the strip's own "See all templates" link. */
    expect(cards).toHaveLength(presets.length + 1);
    for (const preset of presets) {
      const card = within(section).getByRole('link', { name: preset.name });
      expect(card.getAttribute('href')).toBe(preset.href);
    }
    /* No dead controls left behind: a card may not be a button with no handler. */
    expect(within(section).queryAllByRole('button')).toHaveLength(0);
    const link = within(section).getByRole('link', { name: 'Tüm şablonları gör' });
    expect(link.getAttribute('href')).toBe('/gallery');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('leaves no dead clickable control anywhere on home, not just in Templates', async () => {
    /* The defect class this pins is "a control that looks clickable and does
       nothing". The template cards were the surfaced instance; that assertion
       lives in the strip test above, scoped to its own region. This one covers
       the whole surface, so a dead control added to any other region (Overview,
       Get started, This week, Pre-flight, Build progress, Workspace) is caught
       here instead of shipping unnoticed.
       The set AND its size are both asserted on purpose — the costly regression
       is the control that is not in the list, which a per-item loop alone would
       never notice (LESSONS §8). */
    render(<DashboardPage />);
    /* Settle the bots read first: the empty state owns the /dashboard/new link
       and the in-flight shell owns no link at all, so the anchor set is only
       deterministic once the read resolves. */
    await screen.findByRole('region', { name: 'Henüz bot yok' });

    /* Exactly one button exists on this surface and it is the Workspace
       Upgrade — honestly disabled with a stated reason, never inert-but-live. */
    const buttons = Array.from(document.querySelectorAll('button'));
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toContain('Yükselt');
    expect(buttons[0].hasAttribute('disabled')).toBe(true);
    expect(buttons[0].getAttribute('aria-disabled')).toBe('true');
    expect(buttons[0].getAttribute('title')).toBe('Yakında');

    /* Anchors are the only other interactive surface, and every one of them
       must carry a real, in-app destination — never a bare or placeholder
       href. The expected set is enumerated so a removed destination fails
       here too, not only an added one. */
    const hrefs = Array.from(document.querySelectorAll('a'))
      .map((anchor) => anchor.getAttribute('href'))
      .sort();
    expect(hrefs).toEqual([
      '/dashboard/new',
      '/gallery',
      '/gallery/mod-shield',
      '/gallery/ticket-desk',
      '/gallery/welcome-wagon',
    ]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('ships no forbidden jargon on the down-to-home surface', () => {
    render(<DashboardPage />);
    expectNoForbiddenJargon();
    expect(consoleError).not.toHaveBeenCalled();
  });

  /* The Turkish pass, guarded: every string this page used to show in English
     is enumerated above with the Turkish string that replaced it. A revert of
     any line — or a new English string on this page — fails here. */
  it('speaks Turkish end to end: no English page string survives', async () => {
    render(<DashboardPage trialExpired />);
    await screen.findByRole('region', { name: 'Henüz bot yok' });
    const body = document.body.textContent ?? '';
    for (const [what, english] of ENGLISH_RESIDUE) {
      expect(body, `${what} still English: ${english}`).not.toContain(english);
    }
    /* Turkish copy in place, region by region. */
    expect(screen.getByRole('heading', { level: 1, name: PAGE_TITLE })).toBeTruthy();
    expect(screen.getByText('Botunu taslaktan kayıtlı sürüme kadar izle.')).toBeTruthy();
    expect(screen.getByText('Çalışma alanı: Sunucum')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yükselt · Yakında' }).getAttribute('title')).toBe(
      'Yakında',
    );
    /* The honest numeric placeholders survive the copy change: no dash that
       ever resolves, and the two shared trial lines still read verbatim. */
    expect(body).not.toContain('— of —');
    expect(screen.getByText(TRIAL_EXPIRED_BANNER)).toBeTruthy();
    expect(screen.getByText(TRIAL_LINE)).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows the saved-version line in Build progress, never a live promise', () => {
    render(<DashboardPage />);
    const region = screen.getByRole('region', { name: 'Kurulum ilerlemesi' });
    expect(within(region).getByText('Botunu taslaktan kayıtlı sürüme kadar izle.')).toBeTruthy();
    expect(region.textContent).not.toContain('taslaktan canlıya');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('counts the caller own bots when the live list answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          { id: '11111111-2222-4333-8444-555555555555', name: 'One', status: 'live' },
          { id: '66666666-7777-4888-8999-000000000000', name: 'Two', status: 'live' },
        ],
      }),
    );
    render(<DashboardPage />);

    const overview = screen.getByRole('region', { name: 'Genel bakış' });
    const liveCard = within(overview).getByRole('group', { name: 'Canlı botlar' });
    await waitFor(() => expect(within(liveCard).getByText('2')).toBeTruthy());
    const trialCard = within(overview).getByRole('group', { name: 'Denemede' });
    expect(within(trialCard).getByText('0')).toBeTruthy();
    /* Server counts are not wired — honest placeholder. The stub answers
       every URL with the bots array, so the credits read settles unread and
       the card shows the 0 fallback — never a dash after load, never the
       empty line. */
    const serversCard = within(overview).getByRole('group', { name: 'Sunucular' });
    expect(within(serversCard).getByText('Henüz veri yok')).toBeTruthy();
    const creditsCard = within(overview).getByRole('group', { name: 'Kalan kredi' });
    await waitFor(() => expect(within(creditsCard).getByText('0 / 0 kredi')).toBeTruthy());
    /* The honest empty state disappears once real rows exist. */
    expect(screen.queryByRole('region', { name: 'Henüz bot yok' })).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders an honest empty state when the live list fails, never mock rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );
    render(<DashboardPage />);

    const empty = await screen.findByRole('region', { name: 'Henüz bot yok' });
    expect(
      within(empty).getByRole('heading', { name: 'Henüz botun yok — ilk botunu anlat.' }),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain('Study Hall');
    expect(document.body.textContent).not.toContain('(example)');
    expect(consoleError).not.toHaveBeenCalled();
  });
});

/* KI-014: the BuilderProgress component polled the run row but no dashboard
   page rendered it. Reproduce-first: these fail while Home lacks the panel.
   The panel's own labels (Queued/Generating/…, "No run started") are rendered
   by the shared component, which also serves the bots list page — translating
   it is a cross-page wave owned by another file, not this task. */
describe('dashboard home — builder progress panel', () => {
  const RUN_ID = '11111111-2222-4333-8444-555555555555';

  it('repro: builder progress was API-only — Home now renders the panel with an honest no-run state', () => {
    render(<DashboardPage />);
    const region = screen.getByRole('region', { name: 'Kurulum ilerlemesi' });
    expect(within(region).getByText('No run started')).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('polls the real run when opened with ?runId= and shows the current step', async () => {
    mockRunId = RUN_ID;
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
    render(<DashboardPage />);

    expect(await screen.findByText('Generating')).toBeTruthy();
    const region = screen.getByRole('region', { name: 'Kurulum ilerlemesi' });
    expect(within(region).queryByText('No run started')).toBeNull();
    expect(fetch).toHaveBeenCalledWith(`/api/builder?runId=${RUN_ID}`);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

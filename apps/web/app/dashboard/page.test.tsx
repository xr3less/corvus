import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

const TRIAL_LINE = 'Free while in preview — limits not enforced yet.';
const PAGE_TITLE = 'Home';
const PAGE_SUB = 'Your bots at a glance.';
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
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Bot cards' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Your bots' })).toBeNull();
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
    expect(screen.queryByLabelText('Search bots')).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders the Get started card with a 2/4 progress bar and four step minis', () => {
    render(<DashboardPage />);
    const region = screen.getByRole('region', { name: 'Get started (2/4)' });
    expect(within(region).getByRole('heading', { name: 'Get started (2/4)' })).toBeTruthy();
    const bar = within(region).getByRole('progressbar', { name: 'Setup progress' });
    expect(bar.getAttribute('aria-valuenow')).toBe('2');
    expect(bar.getAttribute('aria-valuemax')).toBe('4');
    const steps = within(region).getAllByRole('listitem');
    expect(steps).toHaveLength(4);
    expect(steps[0].textContent).toContain('Connect your server');
    expect(steps[0].textContent).toContain('Done');
    expect(steps[1].textContent).toContain('Describe your bot');
    expect(steps[1].textContent).toContain('You are here');
    expect(steps[2].textContent).toContain('Test it');
    expect(steps[2].textContent).toContain('Next');
    expect(steps[3].textContent).toContain('Go live');
    expect(steps[3].textContent).toContain('Next');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders four stat cards with honest empty values and no mock counts', () => {
    render(<DashboardPage />);
    const overview = screen.getByRole('region', { name: 'Overview' });
    const expected = [
      { name: 'Live bots', value: '—' },
      { name: 'On trial', value: '—' },
      { name: 'Servers', value: '—' },
      { name: 'Credits left', value: '—' },
    ];
    for (const stat of expected) {
      const card = within(overview).getByRole('group', { name: stat.name });
      expect(within(card).getByText(stat.value)).toBeTruthy();
    }
    expect(within(overview).getAllByRole('group')).toHaveLength(4);
    /* No (example)-marked numbers and no mock balances anywhere. */
    expect(document.body.textContent).not.toContain('(example)');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders This week and Pre-flight side by side on home', () => {
    render(<DashboardPage />);
    const week = screen.getByRole('region', { name: 'This week' });
    expect(within(week).getByRole('heading', { name: 'This week' })).toBeTruthy();
    /* KI-030: no activity feed exists yet — honest empty state, never mock rows. */
    expect(within(week).queryByRole('listitem')).toBeNull();
    expect(within(week).getByText('No activity yet.')).toBeTruthy();

    const preflight = screen.getByRole('region', { name: 'Pre-flight' });
    expect(within(preflight).getByRole('heading', { name: 'Pre-flight' })).toBeTruthy();
    expect(within(preflight).queryByRole('listitem')).toBeNull();
    expect(within(preflight).getByText('No scan yet — open a bot to run one.')).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('keeps This week honest when bots exist — no fabricated activity', () => {
    render(<DashboardPage bots={[{ id: 'bot-9', name: 'Real One', status: 'offline' }]} />);
    const week = screen.getByRole('region', { name: 'This week' });
    expect(within(week).queryByRole('listitem')).toBeNull();
    expect(within(week).getByText('No activity yet.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('(example)');
    const preflight = screen.getByRole('region', { name: 'Pre-flight' });
    expect(within(preflight).queryByRole('listitem')).toBeNull();
    expect(within(preflight).getByText('No scan yet — open a bot to run one.')).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders an honest empty state with a link to create the first bot', () => {
    render(<DashboardPage />);
    const empty = screen.getByRole('region', { name: 'No bots yet' });
    expect(
      within(empty).getByRole('heading', { name: 'No bots yet — describe your first bot.' }),
    ).toBeTruthy();
    const link = within(empty).getByRole('link', { name: 'Create your first bot' });
    expect(link.getAttribute('href')).toBe('/dashboard/new');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders the Workspace strip with the preview deal and an honest Upgrade', () => {
    render(<DashboardPage />);
    const workspace = screen.getByRole('region', { name: 'Workspace' });
    expect(within(workspace).getByRole('heading', { name: 'Workspace' })).toBeTruthy();
    expect(within(workspace).getByText('Workspace: My server')).toBeTruthy();
    expect(within(workspace).getByText(TRIAL_LINE)).toBeTruthy();
    expect(within(workspace).getByRole('button', { name: 'Upgrade · Coming soon' })).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('repro: workspace Upgrade is honestly disabled with Coming soon', () => {
    render(<DashboardPage />);
    const workspace = screen.getByRole('region', { name: 'Workspace' });
    const upgrade = within(workspace).getByRole('button', { name: /upgrade/i });
    expect(upgrade.hasAttribute('disabled')).toBe(true);
    expect(upgrade.getAttribute('aria-disabled')).toBe('true');
    expect((upgrade.textContent ?? '').toLowerCase()).toContain('coming soon');
  });

  it('renders the template strip with three cards and a real gallery link', () => {
    render(<DashboardPage />);
    const section = screen.getByRole('region', { name: 'Templates' });
    expect(within(section).getByRole('heading', { name: 'Start from a template' })).toBeTruthy();
    const cards = within(section).getAllByRole('button');
    expect(cards).toHaveLength(3);
    for (const name of ['Community Guardian', 'AI Support Desk', 'Welcome & Role Picker']) {
      expect(within(section).getByRole('button', { name })).toBeTruthy();
    }
    const link = within(section).getByRole('link', { name: 'See all templates' });
    expect(link.getAttribute('href')).toBe('/gallery');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('ships no forbidden jargon on the down-to-home surface', () => {
    render(<DashboardPage />);
    expectNoForbiddenJargon();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows the saved-version line in Build progress, never a live promise', () => {
    render(<DashboardPage />);
    const region = screen.getByRole('region', { name: 'Build progress' });
    expect(within(region).getByText('Follow your bot from draft to saved version.')).toBeTruthy();
    expect(region.textContent).not.toContain('draft to live');
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

    const overview = screen.getByRole('region', { name: 'Overview' });
    const liveCard = within(overview).getByRole('group', { name: 'Live bots' });
    await waitFor(() => expect(within(liveCard).getByText('2')).toBeTruthy());
    const trialCard = within(overview).getByRole('group', { name: 'On trial' });
    expect(within(trialCard).getByText('0')).toBeTruthy();
    /* Server counts and credit balances are not wired — honest placeholders. */
    const serversCard = within(overview).getByRole('group', { name: 'Servers' });
    expect(within(serversCard).getByText('No data yet')).toBeTruthy();
    const creditsCard = within(overview).getByRole('group', { name: 'Credits left' });
    expect(within(creditsCard).getByText('No data yet')).toBeTruthy();
    /* The honest empty state disappears once real rows exist. */
    expect(screen.queryByRole('region', { name: 'No bots yet' })).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders an honest empty state when the live list fails, never mock rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );
    render(<DashboardPage />);

    const empty = await screen.findByRole('region', { name: 'No bots yet' });
    expect(
      within(empty).getByRole('heading', { name: 'No bots yet — describe your first bot.' }),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain('Study Hall');
    expect(document.body.textContent).not.toContain('(example)');
    expect(consoleError).not.toHaveBeenCalled();
  });
});

/* KI-014: the BuilderProgress component polled the run row but no dashboard
   page rendered it. Reproduce-first: these fail while Home lacks the panel. */
describe('dashboard home — builder progress panel', () => {
  const RUN_ID = '11111111-2222-4333-8444-555555555555';

  it('repro: builder progress was API-only — Home now renders the panel with an honest no-run state', () => {
    render(<DashboardPage />);
    const region = screen.getByRole('region', { name: 'Build progress' });
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
    const region = screen.getByRole('region', { name: 'Build progress' });
    expect(within(region).queryByText('No run started')).toBeNull();
    expect(fetch).toHaveBeenCalledWith(`/api/builder?runId=${RUN_ID}`);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

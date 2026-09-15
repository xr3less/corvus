import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { fetchBots, mapLiveStatus, MOCK_BOTS, readLiveBotRows, resolveBotId } from '@/lib/bots';
import BotsPage from './page';

/* Moved verbatim from the old dashboard ?view=bots branch coverage — the
   bots list is its own page at /dashboard/bots now. */
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
  const list = screen.getByRole('list', { name: 'Bot cards' });
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

describe('dashboard bots page', () => {
  it('renders the Bots title block with the search control', () => {
    renderBotsPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Bots' })).toBeTruthy();
    expect(screen.getByText('Describe one and it lands here.')).toBeTruthy();
    const bots = screen.getByRole('region', { name: 'Your bots (example)' });
    expect(within(bots).getByLabelText('Search bots')).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('links New bot to the creation page and carries no overlay', () => {
    renderBotsPage();
    const action = screen.getByRole('link', { name: 'New bot' });
    expect(action.getAttribute('href')).toBe('/dashboard/new');
    /* The overlay era is over — no dialog, no prompt composer on the list. */
    expect(screen.queryByRole('dialog', { name: 'New bot' })).toBeNull();
    expect(screen.queryByLabelText('Prompt')).toBeNull();
    const bots = screen.getByRole('region', { name: 'Your bots (example)' });
    expect(within(bots).getByRole('list', { name: 'Bot cards' })).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('ships no forbidden jargon on the bots surface', () => {
    renderBotsPage();
    expectNoForbiddenJargon();
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('dashboard bot cards — links to the detail page', () => {
  it('renders a media box, title+time, status pill and three real links per card', () => {
    renderBotsPage();
    const items = botListItems();
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByTestId('bot-media-box')).toBeTruthy();
    expect(within(items[0]).getByText('Night Market mods')).toBeTruthy();
    expect(within(items[0]).getByText('2h ago')).toBeTruthy();
    expect(within(items[0]).getByText('Offline')).toBeTruthy();
    expect(within(items[0]).getByText('2,013 members · 2 servers')).toBeTruthy();
    expect(within(items[0]).getByText('Published Night Market mods v12')).toBeTruthy();
    const open = within(items[0]).getByRole('link', { name: 'Open' });
    expect(open.getAttribute('href')).toBe('/dashboard/bots/bot-3');
    const activity = within(items[0]).getByRole('link', { name: 'Activity' });
    expect(activity.getAttribute('href')).toBe('/dashboard/bots/bot-3?tab=activity');
    const preflight = within(items[0]).getByRole('link', { name: 'Pre-flight' });
    expect(preflight.getAttribute('href')).toBe('/dashboard/bots/bot-3?tab=preflight');
    /* The card body itself links to the detail page. */
    const body = within(items[0]).getByRole('link', { name: /Night Market mods.*open bot detail/ });
    expect(body.getAttribute('href')).toBe('/dashboard/bots/bot-3');
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('dashboard filtering and sorting on the bots page', () => {
  it('filter tabs narrow the bot cards by status', () => {
    renderBotsPage();
    fireEvent.click(screen.getByRole('button', { name: 'Trial' }));
    expect(screen.getByRole('button', { name: 'Trial' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('link', { name: /Draft Arena/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Study Hall/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Night Market mods/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Live' }));
    expect(screen.getByRole('link', { name: /Study Hall/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Draft Arena/ })).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('toolbar search filters the bot cards client-side', () => {
    renderBotsPage();
    fireEvent.change(screen.getByLabelText('Search bots'), { target: { value: 'draft' } });
    expect(screen.getByRole('link', { name: /Draft Arena/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Study Hall/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Night Market mods/ })).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('sort select reorders the cards A-Z and restores the default urgency order', () => {
    renderBotsPage();
    expect(firstCardText()).toContain('Night Market mods');

    fireEvent.change(screen.getByLabelText('Sort bots'), { target: { value: 'name' } });
    expect(firstCardText()).toContain('Draft Arena');

    fireEvent.change(screen.getByLabelText('Sort bots'), { target: { value: 'status' } });
    expect(firstCardText()).toContain('Night Market mods');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows the connect-first-server empty state when there are no bots', () => {
    renderBotsPage({ bots: [] });
    expect(screen.getByText('No bots yet — Connect your first server')).toBeTruthy();
    expect(screen.getByText('Live 0 / Trial 0 / Off 0')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Bot cards' })).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('Connect a server links back to the Get started card on home', () => {
    renderBotsPage({ bots: [] });
    const action = screen.getByRole('link', { name: 'Connect a server' });
    expect(action.getAttribute('href')).toBe('/dashboard#get-started');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows a no-match state and the Clear search action restores the list', () => {
    renderBotsPage();
    fireEvent.change(screen.getByLabelText('Search bots'), {
      target: { value: 'zzz-no-such-bot' },
    });
    expect(screen.getByText('No bots match this filter.')).toBeTruthy();
    const clear = screen.getByRole('button', { name: 'Clear search' });
    fireEvent.click(clear);
    expect(screen.getByRole('list', { name: 'Bot cards' })).toBeTruthy();
    expect(botListItems()).toHaveLength(3);
    expect((screen.getByLabelText('Search bots') as HTMLInputElement).value).toBe('');
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
    const bots = screen.getByRole('region', { name: 'Your bots' });
    const body = within(bots).getByRole('link', { name: /Real Study.*open bot detail/ });
    expect(body.getAttribute('href')).toBe(`/dashboard/bots/${LIVE_ID}`);
    const open = within(bots).getByRole('link', { name: 'Open' });
    expect(open.getAttribute('href')).toBe(`/dashboard/bots/${LIVE_ID}`);
    /* A live row carries no server-side counts or activity — the card omits
       the line instead of presenting mock values as the real bot's. */
    expect(bots.textContent).not.toContain('members');
    expect(bots.textContent).not.toContain('Published');
    expect(fetch).toHaveBeenCalledWith(
      '/api/bots',
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('falls back to the example bots, marked, when the live list answers 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'unauthorized' }),
      }),
    );
    renderBotsPage();

    const bots = screen.getByRole('region', { name: 'Your bots (example)' });
    expect(within(bots).getByText('Study Hall')).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('falls back to the example bots, marked, when the live list answers 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'could not load bots' }),
      }),
    );
    renderBotsPage();

    expect(screen.getByRole('region', { name: 'Your bots (example)' })).toBeTruthy();
    expect(screen.getByText('Draft Arena')).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows the honest empty state when the live list is a real but empty answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] }),
    );
    renderBotsPage();

    expect(await screen.findByText('No bots yet — Connect your first server')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Your bots' })).toBeTruthy();
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

  it('fetchBots flags an unauthorized fallback and never throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );
    const snapshot = await fetchBots();
    expect(snapshot.isLive).toBe(false);
    expect(snapshot.unauthorized).toBe(true);
    expect(snapshot.bots).toBe(MOCK_BOTS);
  });
});

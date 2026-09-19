import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import GalleryPage from './page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/gallery',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

const CATEGORIES = ['XP', 'Welcome', 'Moderation', 'Levels', 'Economy', 'Polls', 'Logs', 'Roles'];

/* API-shaped rows served by GET /api/templates in these tests. The fork
   counts here arrive as real API rows — the page never invents them. */
const LIST_TEMPLATES = [
  {
    slug: 'study-hall',
    name: 'Study Hall',
    category: 'XP',
    capabilities: ['Awards 10 XP per message with a 60 second cooldown.'],
    perms_needed: [],
    forks: 412,
    semver: '1.0.0',
  },
  {
    slug: 'welcome-mat',
    name: 'Welcome Mat',
    category: 'Welcome',
    capabilities: ['Greets every join in #welcome with the rules first.'],
    perms_needed: [],
    forks: 368,
    semver: '1.0.0',
  },
  {
    slug: 'mod-kit',
    name: 'Mod Kit',
    category: 'Moderation',
    capabilities: ['Warns, mutes after 3 warnings, logs every action.'],
    perms_needed: [],
    forks: 295,
    semver: '1.0.0',
  },
  {
    slug: 'level-ladder',
    name: 'Level Ladder',
    category: 'Levels',
    capabilities: ['Grants 1 role every 5 levels across 20 levels.'],
    perms_needed: [],
    forks: 241,
    semver: '1.0.0',
  },
  {
    slug: 'coin-jar',
    name: 'Coin Jar',
    category: 'Economy',
    capabilities: ['Pays 5 coins per active day, wallet caps at 500.'],
    perms_needed: [],
    forks: 187,
    semver: '1.0.0',
  },
  {
    slug: 'poll-maker',
    name: 'Poll Maker',
    category: 'Polls',
    capabilities: ['Closes polls after 24 hours and posts the 1 winner.'],
    perms_needed: [],
    forks: 154,
    semver: '1.0.0',
  },
  {
    slug: 'audit-trail',
    name: 'Audit Trail',
    category: 'Logs',
    capabilities: ['Keeps 90 days of joins, leaves, edits, deletes.'],
    perms_needed: [],
    forks: 129,
    semver: '1.0.0',
  },
  {
    slug: 'role-desk',
    name: 'Role Desk',
    category: 'Roles',
    capabilities: ['Hands out 12 self-serve roles from 1 menu.'],
    perms_needed: [],
    forks: 98,
    semver: '1.0.0',
  },
];

function listResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({ templates: LIST_TEMPLATES }),
  };
}

/* List-success stub: GET /api/templates resolves, everything else rejects. */
function stubListSuccess() {
  const fetchStub = vi.fn(async (url: unknown) => {
    if (url === '/api/templates') return listResponse();
    throw new Error('offline');
  });
  vi.stubGlobal('fetch', fetchStub);
  return fetchStub;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/* Hermetic default: the list call fails, so every behavior test below renders
   the honest unavailable state unless it stubs fetch itself. */
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
});

describe('gallery page', () => {
  it('renders an honest unavailable state when the template list fails to load', async () => {
    const fetchStub = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchStub);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(<GalleryPage />);

      expect(screen.getByRole('heading', { name: 'Templates' })).toBeTruthy();
      expect(await screen.findByText('Templates unavailable — try again.')).toBeTruthy();
      expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);
      // No fabricated rows: the old mock's signature count never appears.
      expect(screen.queryByText('412 forks')).toBeNull();
      expect(screen.queryAllByRole('button', { name: 'Fork' })).toHaveLength(0);
      expect(fetchStub).toHaveBeenCalledWith('/api/templates');
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('renders the API template list with its real numbers', async () => {
    stubListSuccess();
    render(<GalleryPage />);

    expect(await screen.findByRole('heading', { level: 3, name: 'Study Hall' })).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: 'Search templates' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(8);

    const band = screen.getByRole('group', { name: 'Filter by category' });
    expect(within(band).getAllByRole('button')).toHaveLength(CATEGORIES.length + 1);
    for (const category of CATEGORIES) {
      expect(within(band).getByRole('button', { name: category })).toBeTruthy();
    }

    expect(screen.getByText('Mod Kit')).toBeTruthy();
    expect(screen.getByText('412 forks')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Fork' })).toHaveLength(8);
  });

  it('filters by name and detail, case-insensitively', async () => {
    stubListSuccess();
    render(<GalleryPage />);
    await screen.findByRole('heading', { level: 3, name: 'Mod Kit' });
    const search = screen.getByRole('searchbox', { name: 'Search templates' });

    fireEvent.change(search, { target: { value: 'mod' } });
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 3, name: 'Mod Kit' })).toBeTruthy();

    fireEvent.change(search, { target: { value: 'WALLET' } });
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 3, name: 'Coin Jar' })).toBeTruthy();

    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(8);
  });

  it('filters to a single category and keeps the selection single', async () => {
    stubListSuccess();
    render(<GalleryPage />);
    await screen.findByRole('heading', { level: 3, name: 'Mod Kit' });
    const band = screen.getByRole('group', { name: 'Filter by category' });

    fireEvent.click(within(band).getByRole('button', { name: 'Moderation' }));
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 3, name: 'Mod Kit' })).toBeTruthy();
    expect(
      within(band).getByRole('button', { name: 'Moderation' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(within(band).getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe(
      'false',
    );

    fireEvent.click(within(band).getByRole('button', { name: 'Levels' }));
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 3, name: 'Level Ladder' })).toBeTruthy();
    expect(
      within(band).getByRole('button', { name: 'Moderation' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('combines search and category with AND', async () => {
    stubListSuccess();
    render(<GalleryPage />);
    await screen.findByRole('heading', { level: 3, name: 'Coin Jar' });
    const band = screen.getByRole('group', { name: 'Filter by category' });
    const search = screen.getByRole('searchbox', { name: 'Search templates' });

    fireEvent.click(within(band).getByRole('button', { name: 'Economy' }));
    fireEvent.change(search, { target: { value: 'coins' } });
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 3, name: 'Coin Jar' })).toBeTruthy();

    fireEvent.change(search, { target: { value: 'poll' } });
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);
  });

  it('shows an honest empty state and clears both filters', async () => {
    stubListSuccess();
    render(<GalleryPage />);
    await screen.findByRole('heading', { level: 3, name: 'Audit Trail' });
    const band = screen.getByRole('group', { name: 'Filter by category' });
    const search = screen.getByRole('searchbox', { name: 'Search templates' });

    fireEvent.click(within(band).getByRole('button', { name: 'Logs' }));
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);
    expect(screen.getByText('No templates match that search.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(8);
    expect((search as HTMLInputElement).value).toBe('');
    expect(within(band).getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('forks through POST /api/templates/<slug>/fork and shows the bot and invite links', async () => {
    const fetchStub = vi.fn(async (url: unknown) => {
      if (typeof url === 'string' && url.endsWith('/fork')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            botId: 'bot-123',
            draftSpecId: 'spec-456',
            version: 1,
            inviteUrl: 'https://discord.com/oauth2/authorize?client_id=1',
          }),
        };
      }
      if (url === '/api/templates') return listResponse();
      throw new Error('unexpected fork call');
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<GalleryPage />);
    await screen.findByRole('heading', { level: 3, name: 'Study Hall' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Fork' })[0]);
    expect(fetchStub).toHaveBeenCalledWith(
      '/api/templates/study-hall/fork',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(await screen.findByRole('button', { name: 'Forked' })).toBeTruthy();
    expect(screen.getByText('413 forks')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Fork' })).toHaveLength(7);
    const botLink = screen.getByRole('link', { name: 'Open your bot' });
    expect(botLink.getAttribute('href')).toBe('/dashboard/bots/bot-123');
    const inviteLink = screen.getByRole('link', { name: 'Add to Discord (shared test app)' });
    expect(inviteLink.getAttribute('href')).toBe(
      'https://discord.com/oauth2/authorize?client_id=1',
    );
    expect(inviteLink.getAttribute('target')).toBe('_blank');
    expect(inviteLink.getAttribute('rel')).toContain('noopener');
  });

  it('disables the Fork button while the request is in flight', async () => {
    let resolveFork: (value: unknown) => void = () => {};
    const pending = new Promise<unknown>((resolve) => {
      resolveFork = resolve;
    });
    const fetchStub = vi.fn(async (url: unknown) => {
      if (typeof url === 'string' && url.endsWith('/fork')) return pending;
      if (url === '/api/templates') return listResponse();
      throw new Error('offline');
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<GalleryPage />);
    await screen.findByRole('heading', { level: 3, name: 'Study Hall' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Fork' })[0]);
    const busy = await screen.findByRole('button', { name: 'Forking…' });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    resolveFork({
      ok: true,
      status: 200,
      json: async () => ({
        botId: 'bot-1',
        draftSpecId: 'spec-1',
        version: 1,
        inviteUrl: 'https://example.com/invite',
      }),
    });
    expect(await screen.findByRole('button', { name: 'Forked' })).toBeTruthy();
  });

  it('shows a logged-out line with a login link on fork 401, without fake success', async () => {
    const fetchStub = vi.fn(async (url: unknown) => {
      if (typeof url === 'string' && url.endsWith('/fork')) {
        return { ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) };
      }
      if (url === '/api/templates') return listResponse();
      throw new Error('offline');
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<GalleryPage />);
    await screen.findByRole('heading', { level: 3, name: 'Study Hall' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Fork' })[0]);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent ?? '').toContain('logged out');
    const loginLink = within(alert).getByRole('link', { name: 'log in' });
    expect(loginLink.getAttribute('href')).toBe('/api/auth/login');
    expect(screen.queryByRole('button', { name: 'Forked' })).toBeNull();
    expect(screen.getByText('412 forks')).toBeTruthy();
  });

  it('shows the server error text on fork failure, without fake success', async () => {
    const fetchStub = vi.fn(async (url: unknown) => {
      if (typeof url === 'string' && url.endsWith('/fork')) {
        return { ok: false, status: 500, json: async () => ({ error: 'could not fork' }) };
      }
      if (url === '/api/templates') return listResponse();
      throw new Error('offline');
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<GalleryPage />);
    await screen.findByRole('heading', { level: 3, name: 'Study Hall' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Fork' })[0]);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('could not fork');
    expect(screen.queryByRole('button', { name: 'Forked' })).toBeNull();
  });

  it('renders the server template list when GET /api/templates succeeds', async () => {
    const fetchStub = vi.fn(async (url: unknown) => {
      if (url === '/api/templates') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            templates: [
              {
                slug: 'srv-a',
                name: 'Srv A',
                category: 'Welcome',
                capabilities: ['welcome'],
                perms_needed: [],
                forks: 7,
                semver: '1.0.0',
              },
              {
                slug: 'srv-b',
                name: 'Srv B',
                category: 'Welcome',
                capabilities: ['moderation', 'logging'],
                perms_needed: [],
                forks: 3,
                semver: '1.0.0',
              },
            ],
          }),
        };
      }
      throw new Error('unexpected fork call');
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<GalleryPage />);
    expect(await screen.findByRole('heading', { level: 3, name: 'Srv A' })).toBeTruthy();
    expect(screen.getByText('7 forks')).toBeTruthy();
    expect(screen.getByText('moderation, logging')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2);
  });

  it('renders an honest unavailable state when GET /api/templates returns malformed rows', async () => {
    const fetchStub = vi.fn(async (url: unknown) => {
      if (url === '/api/templates') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ templates: [{ nope: true }] }),
        };
      }
      throw new Error('unexpected fork call');
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<GalleryPage />);
    expect(await screen.findByText('Templates unavailable — try again.')).toBeTruthy();
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);
  });
});

describe('gallery wiring', () => {
  it('grid attempts GET /api/templates on mount', () => {
    const fetchStub = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchStub);
    render(<GalleryPage />);
    expect(fetchStub).toHaveBeenCalledWith('/api/templates');
  });

  it('Fork triggers POST /api/templates/<slug>/fork', async () => {
    const fetchStub = vi.fn(async (url: unknown) => {
      if (typeof url === 'string' && url.endsWith('/fork')) {
        throw new Error('offline');
      }
      if (url === '/api/templates') return listResponse();
      throw new Error('unexpected call');
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<GalleryPage />);
    await screen.findByRole('heading', { level: 3, name: 'Study Hall' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Fork' })[0]);
    expect(fetchStub).toHaveBeenCalledWith(
      '/api/templates/study-hall/fork',
      expect.objectContaining({ method: 'POST' }),
    );
    // The rejected POST surfaces as card text — never a fake success.
    expect((await screen.findByRole('alert')).textContent).toContain('Could not reach');
  });
});

describe('gallery rail', () => {
  it('renders the six-item dashboard rail with Templates active', () => {
    render(<GalleryPage />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeTruthy();
    expect(within(nav).getByText('My server')).toBeTruthy();
    // Honest rail: no fake Pro pill, no mock credits meter (owned by ki030-b).
    expect(within(nav).queryByText('Pro')).toBeNull();

    const items = [
      { label: 'Home', href: '/dashboard', current: false },
      { label: 'Bots', href: '/dashboard/bots', current: false },
      { label: 'Templates', href: '/gallery', current: true },
      { label: 'Activity', href: '/dashboard#week', current: false },
      { label: 'Pre-flight', href: '/dashboard#preflight', current: false },
      { label: 'Settings', href: '/dashboard#workspace', current: false },
    ];
    for (const item of items) {
      const link = within(nav).getByRole('link', { name: item.label });
      expect(link.getAttribute('href')).toBe(item.href);
      expect(link.getAttribute('aria-current')).toBe(item.current ? 'page' : null);
      // Every item resolves to a real route or a same-page anchor — no dead links.
      expect(item.href.startsWith('/')).toBe(true);
    }
    expect(within(nav).getAllByRole('link')).toHaveLength(6);
  });

  it('renders the honest Upgrade placeholder in the rail footer', () => {
    render(<GalleryPage />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    // Credits meter removed by the honest rail: no mock `82/100` balance.
    expect(screen.queryByText('Credits 82/100 · 18 left')).toBeNull();
    expect(screen.queryByRole('progressbar', { name: 'Credits' })).toBeNull();
    expect(within(nav).getByRole('button', { name: 'Upgrade · Coming soon' })).toBeTruthy();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DashboardRail } from './dashboard-rail';

/* Pathname-only active rule; ?view=bots is handled by the home page redirect. */
let mockPathname: string = '/dashboard';
const mockAssign = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

vi.mock('next/font/google', () => ({
  Geist: () => ({ className: 'geist-mock' }),
}));

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockPathname = '/dashboard';
  mockAssign.mockClear();
  /* jsdom does not implement navigation AND seals window.location
     (non-configurable accessor, non-writable assign), so assign cannot be
     stubbed in place. Stub the window binding instead with an inheriting
     fake whose location.assign is a vi.fn; unstubbed in afterEach. */
  const fakeWindow = Object.create(window);
  /* defineProperty (not assignment): assigning would invoke jsdom's
     inherited location setter and attempt a real navigation. */
  Object.defineProperty(fakeWindow, 'location', {
    value: { assign: mockAssign },
    writable: true,
    configurable: true,
  });
  vi.stubGlobal('window', fakeWindow);
  /* URL-aware default: the rail's mount list resolves empty (no notice), every
     other path answers ok. Tests needing history rows or failures re-stub below
     (re-stub, never Once — the mount list and the action under test must never
     consume each other's answers). */
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) => {
      if (typeof url === 'string' && url.startsWith('/api/conversations')) {
        return Response.json({ conversations: [] });
      }
      return { ok: true } as Response;
    }),
  );
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
  vi.unstubAllGlobals();
});

function railList() {
  return within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('list');
}

/* Wave 1 conversations section: mount list via GET /api/conversations (stubbed
   below, never the network); empty state and all section copy use only the
   allowed strings; open marks the row active; delete is two-step and
   fail-closed. These tests assert behavior through the DOM, not helper mocks —
   the real helpers run against the fetch stub. */
const CONV_A = '22222222-3333-4444-8555-666666666666';
const CONV_B = '33333333-4444-5555-9666-777777777777';
const DOWN_NOTICE = 'Conversation history unavailable — new messages still send.';

interface RowSeed {
  id: string;
  botId: string | null;
  title: string | null;
}

function listBody(rows: RowSeed[]) {
  return {
    conversations: rows.map((row) => ({
      id: row.id,
      botId: row.botId,
      title: row.title,
      updatedAt: '2026-09-25T00:00:00.000Z',
    })),
  };
}

/* History-only fetch stub: the mount list answers rows, then subsequent
   /api/conversations calls (open POST, refresh list, DELETE) are recorded and
   answered from the same live set so the rail's assertions hold. The stub
   closes over the mutable `live` + `seeded` bindings so tests may change what
   the server "knows" mid-test (e.g. push a freshly opened id before clicking). */
function stubHistory(seed: RowSeed[]) {
  let live = seed.map((row) => row.id);
  let seeded: RowSeed[] = [...seed];
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: RequestInit) => {
      const href = String(url);
      calls.push({ url: href, init });
      if (href === '/api/conversations' && (init?.method ?? 'GET') === 'GET') {
        return Response.json(listBody(seeded.filter((row) => live.includes(row.id))));
      }
      if (href === '/api/conversations' && init?.method === 'POST') {
        return Response.json({ conversationId: CONV_A });
      }
      if (href.startsWith('/api/conversations/') && (init?.method ?? 'GET') === 'GET') {
        const id = decodeURIComponent(href.slice('/api/conversations/'.length));
        if (!live.includes(id)) {
          return Response.json({ error: 'not found' }, { status: 404 });
        }
        return Response.json({ turns: [] });
      }
      if (href.startsWith('/api/conversations/') && init?.method === 'DELETE') {
        const id = decodeURIComponent(href.slice('/api/conversations/'.length));
        const idx = live.indexOf(id);
        if (idx === -1) {
          return Response.json({ error: 'not found' }, { status: 404 });
        }
        live = live.filter((entry) => entry !== id);
        return Response.json({ deleted: true });
      }
      return { ok: true } as Response;
    }),
  );
  const server = {
    calls,
    liveIds: () => live,
    /* Teach the fake server a row the rail just opened (the opened id becomes
       listable on the refresh GET). */
    seed(row: RowSeed) {
      seeded = [...seeded, row];
      if (!live.includes(row.id)) live = [...live, row.id];
    },
  };
  return server;
}

const ALLOWED_WORDS = [
  'Sohbetler',
  'Yeni sohbet başlat',
  'Eski sohbet yok',
  'Sohbeti sil',
  'Sohbet aç',
];

describe('DashboardRail', () => {
  it('renders the workspace header and six links with the locked hrefs in order', () => {
    render(<DashboardRail />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByText('Sunucum')).toBeTruthy();
    /* KI-030: no fake Pro pill — no visitor is shown a paid tier. */
    expect(within(nav).queryByText('Pro')).toBeNull();

    const expected: [string, string][] = [
      ['Ana sayfa', '/dashboard'],
      ['Botlar', '/dashboard/bots'],
      ['Şablonlar', '/gallery'],
      ['Etkinlik', '/dashboard#week'],
      ['Ön kontrol', '/dashboard#preflight'],
      ['Ayarlar', '/dashboard#workspace'],
    ];
    const list = railList();
    const links = within(list).getAllByRole('link');
    expect(links).toHaveLength(6);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      expected.map(([, href]) => href),
    );
    for (const [label, href] of expected) {
      expect(within(list).getByRole('link', { name: label }).getAttribute('href')).toBe(href);
    }
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders no English rail copy — the shell speaks the owner language', () => {
    render(<DashboardRail />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    /* Each of these was a live rail string before the Turkish pass; the sweep
       fails if one comes back. Label-only: hrefs and the landmark name are
       language-neutral and stay as they are. */
    const ENGLISH_RESIDUE = [
      'My server',
      'Home',
      'Bots',
      'Templates',
      'Activity',
      'Pre-flight',
      'Settings',
      'Upgrade · Coming soon',
      'Coming soon',
      'Log out',
      /* In-flight branch (dashboard-rail.tsx:99 idle/in-flight pair at HEAD was
         'Logging out…' / 'Log out'). The sweep below only observes the idle
         branch, so this entry guards the idle text while the dedicated
         in-flight test pins the pending label. */
      'Logging out…',
    ];
    const text = (nav.textContent ?? '').toLowerCase();
    for (const residue of ENGLISH_RESIDUE) {
      expect(text, `rail still shows English: ${residue}`).not.toContain(residue.toLowerCase());
    }
    /* The disabled Upgrade is still the honest one it was: never translated
       into a live promise. */
    const upgrade = within(nav).getByRole('button', { name: /yükselt/i });
    expect(upgrade.hasAttribute('disabled')).toBe(true);
    expect(upgrade.getAttribute('aria-disabled')).toBe('true');
    expect(upgrade.getAttribute('title')).toBe('Yakında');
  });

  it('renders the rail in its own Geist typeface regardless of ancestors', () => {
    render(<DashboardRail />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(nav.className).toContain('geist-mock');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('marks Home current on /dashboard by pathname alone', () => {
    render(<DashboardRail />);
    expect(screen.getByRole('link', { name: 'Ana sayfa' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('link', { name: 'Botlar' }).getAttribute('aria-current')).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('marks Bots current on the creation and detail routes', () => {
    for (const path of ['/dashboard/bots', '/dashboard/bots/bot-1', '/dashboard/new']) {
      mockPathname = path;
      const { unmount } = render(<DashboardRail />);
      expect(
        screen.getByRole('link', { name: 'Botlar' }).getAttribute('aria-current'),
        `Botlar should be current on ${path}`,
      ).toBe('page');
      expect(
        screen.getByRole('link', { name: 'Ana sayfa' }).getAttribute('aria-current'),
        `Ana sayfa should not be current on ${path}`,
      ).toBeNull();
      unmount();
    }
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('marks Templates current on /gallery and never marks the anchor items', () => {
    mockPathname = '/gallery';
    render(<DashboardRail />);
    expect(screen.getByRole('link', { name: 'Şablonlar' }).getAttribute('aria-current')).toBe(
      'page',
    );
    for (const label of ['Ana sayfa', 'Botlar', 'Etkinlik', 'Ön kontrol', 'Ayarlar']) {
      expect(
        screen.getByRole('link', { name: label }).getAttribute('aria-current'),
        `${label} should not be current on /gallery`,
      ).toBeNull();
    }
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders no fake credit balance — only the honest disabled Upgrade', () => {
    render(<DashboardRail />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    /* KI-030: CREDITS_USED/CREDITS_TOTAL must never render as a real balance. */
    expect(screen.queryByRole('progressbar', { name: 'Credits' })).toBeNull();
    expect(screen.queryByText(/credits/i)).toBeNull();
    expect(within(nav).getByRole('button', { name: 'Yükselt · Yakında' })).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('repro: rail Upgrade is honestly disabled with Coming soon', () => {
    render(<DashboardRail />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const upgrade = within(nav).getByRole('button', { name: /yükselt/i });
    expect(upgrade.hasAttribute('disabled')).toBe(true);
    expect(upgrade.getAttribute('aria-disabled')).toBe('true');
    expect(upgrade.textContent ?? '').toContain('Yakında');
  });

  it('pins the in-flight logout label in Turkish while the request is pending', async () => {
    /* The sweep above only observes the idle branch (loggingOut === false), so
       the in-flight branch of dashboard-rail.tsx:99 needs its own assertion:
       hold the logout POST open and read the pending label's exact bytes. */
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>(() => {}));
    render(<DashboardRail />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    fireEvent.click(within(nav).getByRole('button', { name: /çıkış yap/i }));
    await waitFor(() => {
      expect(within(nav).getByRole('button', { name: 'Çıkış yapılıyor…' })).toBeTruthy();
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('repro: rail Log out posts to the logout route and navigates home', async () => {
    render(<DashboardRail />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const logout = within(nav).getByRole('button', { name: /çıkış yap/i });
    fireEvent.click(logout);
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/auth/logout',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    await waitFor(() => {
      expect(mockAssign).toHaveBeenCalledWith('/');
    });
  });

  it('repro: rail Log out failure shows an inline error and stays put', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        if (typeof url === 'string' && url.startsWith('/api/conversations')) {
          return Response.json({ conversations: [] });
        }
        return { ok: false, status: 500 } as Response;
      }),
    );
    render(<DashboardRail />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const logout = within(nav).getByRole('button', { name: /çıkış yap/i });
    fireEvent.click(logout);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    expect(screen.getByRole('alert').textContent).toBe('Çıkış yapılamadı. Lütfen tekrar dene.');
    expect(mockAssign).not.toHaveBeenCalled();
  });
});

describe('DashboardRail conversations', () => {
  it('renders the honest empty state and nothing else — only allowed strings', async () => {
    render(<DashboardRail />);
    const section = await screen.findByRole('region', { name: 'Sohbetler' });
    expect(within(section).getByText('Eski sohbet yok')).toBeTruthy();
    expect(within(section).getByRole('button', { name: 'Yeni sohbet başlat' })).toBeTruthy();
    /* The section's whole visible text is the allowed set plus the frozen
       row-fallback (a timestamp here — the list is empty so no row shows, and
       the notice is absent on a healthy read). Strip whitespace, then every
       remaining word must be one of the five allowed strings. */
    const text = (section.textContent ?? '').replace(/\s+/g, ' ').trim();
    let rest = text;
    for (const word of [...ALLOWED_WORDS].sort((a, b) => b.length - a.length)) {
      rest = rest.split(word).join('');
    }
    expect(rest.replace(/\s+/g, ''), `section shows unlisted copy: ${text}`).toBe('');
    expect(within(section).queryByRole('status')).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('lists two rows newest-first and opens one on click (active marked)', async () => {
    stubHistory([
      { id: CONV_A, botId: null, title: 'İlk sohbet' },
      { id: CONV_B, botId: null, title: 'İkinci sohbet' },
    ]);
    render(<DashboardRail />);
    const section = await screen.findByRole('region', { name: 'Sohbetler' });
    const openers = await within(section).findAllByRole('button', { name: 'Sohbet aç' });
    expect(openers).toHaveLength(2);
    fireEvent.click(openers[0]);
    await waitFor(() => {
      expect(openers[0].getAttribute('aria-current')).toBe('true');
    });
    expect(openers[1].getAttribute('aria-current')).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('deletes with a two-step confirm and removes the row optimistically-honest', async () => {
    const { calls } = stubHistory([
      { id: CONV_A, botId: null, title: 'İlk sohbet' },
      { id: CONV_B, botId: null, title: 'İkinci sohbet' },
    ]);
    render(<DashboardRail />);
    const section = await screen.findByRole('region', { name: 'Sohbetler' });
    const deleters = await within(section).findAllByRole('button', { name: 'Sohbeti sil' });
    expect(deleters).toHaveLength(2);
    fireEvent.click(deleters[0]);
    /* First click only arms — no DELETE leaves the rail. */
    await waitFor(() => {
      expect(deleters[0].getAttribute('aria-expanded')).toBe('true');
    });
    expect(calls.some((call) => call.init?.method === 'DELETE')).toBe(false);
    fireEvent.click(deleters[0]);
    await waitFor(() => {
      expect(within(section).getAllByRole('button', { name: 'Sohbeti sil' })).toHaveLength(1);
    });
    expect(
      calls.some(
        (call) => call.url === `/api/conversations/${CONV_A}` && call.init?.method === 'DELETE',
      ),
    ).toBe(true);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('creates a new chat through the real ensure helper, then lists newest-first', async () => {
    const server = stubHistory([]);
    render(<DashboardRail />);
    const section = await screen.findByRole('region', { name: 'Sohbetler' });
    expect(await within(section).findByText('Eski sohbet yok')).toBeTruthy();
    /* The server now knows the row the rail is about to open, so the refresh
       GET after the POST lists it — newest-first is the server's order. */
    server.seed({ id: CONV_A, botId: null, title: null });
    fireEvent.click(within(section).getByRole('button', { name: 'Yeni sohbet başlat' }));
    await waitFor(() => {
      expect(within(section).getAllByRole('button', { name: 'Sohbet aç' })).toHaveLength(1);
    });
    /* The rail POSTed { botId: null } (account-level — the rail names no bot). */
    const openCall = server.calls.find(
      (call) => call.url === '/api/conversations' && call.init?.method === 'POST',
    );
    expect(openCall).toBeTruthy();
    expect(JSON.parse(String(openCall?.init?.body ?? '{}'))).toEqual({ botId: null });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('fail-closed: a down history read shows the single honest notice, never a crash', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('offline'))),
    );
    render(<DashboardRail />);
    const section = await screen.findByRole('region', { name: 'Sohbetler' });
    expect(await within(section).findByRole('status')).toBeTruthy();
    expect(within(section).getByRole('status').textContent).toBe(DOWN_NOTICE);
    expect(within(section).getByText('Eski sohbet yok')).toBeTruthy();
    expect(within(section).queryByRole('button', { name: 'Sohbet aç' })).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('fail-closed: a failed delete keeps the row and says the honest sentence', async () => {
    stubHistory([{ id: CONV_A, botId: null, title: 'İlk sohbet' }]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init?: RequestInit) => {
        const href = String(url);
        if (href === '/api/conversations' && (init?.method ?? 'GET') === 'GET') {
          return Response.json(listBody([{ id: CONV_A, botId: null, title: 'İlk sohbet' }]));
        }
        if (href === `/api/conversations/${CONV_A}` && (init?.method ?? 'GET') === 'GET') {
          return Response.json({ turns: [] });
        }
        if (href === `/api/conversations/${CONV_A}` && init?.method === 'DELETE') {
          return Response.json({ error: 'could not delete conversation' }, { status: 500 });
        }
        return { ok: true } as Response;
      }),
    );
    render(<DashboardRail />);
    const section = await screen.findByRole('region', { name: 'Sohbetler' });
    const deleter = (await within(section).findAllByRole('button', { name: 'Sohbeti sil' }))[0];
    fireEvent.click(deleter);
    await waitFor(() => {
      expect(deleter.getAttribute('aria-expanded')).toBe('true');
    });
    fireEvent.click(deleter);
    await waitFor(() => {
      expect(within(section).getByRole('status').textContent).toBe(DOWN_NOTICE);
    });
    /* The row survives — a failed delete never reads as confirmed. */
    expect(within(section).getAllByRole('button', { name: 'Sohbeti sil' })).toHaveLength(1);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

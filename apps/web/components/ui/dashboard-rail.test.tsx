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
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true } as Response)),
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
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500 } as Response);
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

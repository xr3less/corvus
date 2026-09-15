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
    expect(within(nav).getByText('My server')).toBeTruthy();
    expect(within(nav).getByText('Pro')).toBeTruthy();

    const expected: [string, string][] = [
      ['Home', '/dashboard'],
      ['Bots', '/dashboard/bots'],
      ['Templates', '/gallery'],
      ['Activity', '/dashboard#week'],
      ['Pre-flight', '/dashboard#preflight'],
      ['Settings', '/dashboard#workspace'],
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

  it('renders the rail in its own Geist typeface regardless of ancestors', () => {
    render(<DashboardRail />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(nav.className).toContain('geist-mock');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('marks Home current on /dashboard by pathname alone', () => {
    render(<DashboardRail />);
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Bots' }).getAttribute('aria-current')).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('marks Bots current on the creation and detail routes', () => {
    for (const path of ['/dashboard/bots', '/dashboard/bots/bot-1', '/dashboard/new']) {
      mockPathname = path;
      const { unmount } = render(<DashboardRail />);
      expect(
        screen.getByRole('link', { name: 'Bots' }).getAttribute('aria-current'),
        `Bots should be current on ${path}`,
      ).toBe('page');
      expect(
        screen.getByRole('link', { name: 'Home' }).getAttribute('aria-current'),
        `Home should not be current on ${path}`,
      ).toBeNull();
      unmount();
    }
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('marks Templates current on /gallery and never marks the anchor items', () => {
    mockPathname = '/gallery';
    render(<DashboardRail />);
    expect(screen.getByRole('link', { name: 'Templates' }).getAttribute('aria-current')).toBe(
      'page',
    );
    for (const label of ['Home', 'Bots', 'Activity', 'Pre-flight', 'Settings']) {
      expect(
        screen.getByRole('link', { name: label }).getAttribute('aria-current'),
        `${label} should not be current on /gallery`,
      ).toBeNull();
    }
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders the credits meter and Upgrade button from the shared source', () => {
    render(<DashboardRail />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(screen.getByText('Credits 82/100 · 18 left')).toBeTruthy();
    const meter = screen.getByRole('progressbar', { name: 'Credits' });
    expect(meter.getAttribute('aria-valuenow')).toBe('82');
    expect(meter.getAttribute('aria-valuemax')).toBe('100');
    expect(within(nav).getByRole('button', { name: 'Upgrade · Coming soon' })).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('repro: rail Upgrade is honestly disabled with Coming soon', () => {
    render(<DashboardRail />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const upgrade = within(nav).getByRole('button', { name: /upgrade/i });
    expect(upgrade.hasAttribute('disabled')).toBe(true);
    expect(upgrade.getAttribute('aria-disabled')).toBe('true');
    expect((upgrade.textContent ?? '').toLowerCase()).toContain('coming soon');
  });

  it('repro: rail Log out posts to the logout route and navigates home', async () => {
    render(<DashboardRail />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const logout = within(nav).getByRole('button', { name: /log\s?out/i });
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
    const logout = within(nav).getByRole('button', { name: /log\s?out/i });
    fireEvent.click(logout);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    expect(mockAssign).not.toHaveBeenCalled();
  });
});

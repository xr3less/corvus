import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import DashboardLayout from './layout';

vi.mock('next/font/google', () => ({
  Geist: () => ({ className: 'geist-mock' }),
}));

/* Active rule is pathname-only: Bots when the path opens /dashboard/new or
   /dashboard/bots; else Home on /dashboard. */
let mockPathname: string = '/dashboard';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockPathname = '/dashboard';
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

function renderLayout(children: React.ReactNode = <div>child page</div>) {
  return render(<DashboardLayout>{children}</DashboardLayout>);
}

function railLinks() {
  const nav = screen.getByRole('navigation', { name: 'Primary' });
  return within(nav).getAllByRole('link');
}

describe('dashboard layout rail', () => {
  it('renders the six-item rail as links with the locked hrefs', () => {
    renderLayout();
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeTruthy();
    expect(within(nav).getByText('My server')).toBeTruthy();
    /* KI-030: no fake Pro pill — no visitor is shown a paid tier. */
    expect(within(nav).queryByText('Pro')).toBeNull();

    const expected: [string, string][] = [
      ['Home', '/dashboard'],
      ['Bots', '/dashboard/bots'],
      ['Templates', '/gallery'],
      ['Activity', '/dashboard#week'],
      ['Pre-flight', '/dashboard#preflight'],
      ['Settings', '/dashboard#workspace'],
    ];
    const list = within(nav).getByRole('list');
    expect(within(list).getAllByRole('link')).toHaveLength(6);
    for (const [label, href] of expected) {
      const link = within(list).getByRole('link', { name: label });
      expect(link.getAttribute('href')).toBe(href);
    }

    /* KI-030: no fake credit balance — only the honest disabled Upgrade. */
    expect(screen.queryByText(/credits/i)).toBeNull();
    expect(screen.queryByRole('progressbar', { name: 'Credits' })).toBeNull();
    expect(within(nav).getByRole('button', { name: 'Upgrade · Coming soon' })).toBeTruthy();
    /* No Interview rail item — no honest target exists for it, and no old group labels. */
    expect(within(list).queryByRole('link', { name: 'Interview' })).toBeNull();
    for (const label of ['Work', 'Review', 'System']) {
      expect(within(nav).queryByText(label)).toBeNull();
    }
    /* No fake Sign-in button and no bell/help controls exist on the logged-in app. */
    expect(screen.queryByRole('button', { name: /sign in/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /help/i })).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('marks Home current on /dashboard and Bots current on /dashboard/bots', () => {
    const { unmount } = renderLayout();
    const list = within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('list');
    expect(within(list).getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(
      within(list).getByRole('link', { name: 'Bots' }).getAttribute('aria-current'),
    ).toBeNull();
    unmount();

    mockPathname = '/dashboard/bots';
    renderLayout();
    const botsList = within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('list');
    expect(within(botsList).getByRole('link', { name: 'Bots' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(
      within(botsList).getByRole('link', { name: 'Home' }).getAttribute('aria-current'),
    ).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('marks Bots current on the creation and detail routes', () => {
    for (const path of ['/dashboard/new', '/dashboard/bots/bot-1']) {
      mockPathname = path;
      const { unmount } = renderLayout();
      const list = within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('list');
      expect(
        within(list).getByRole('link', { name: 'Bots' }).getAttribute('aria-current'),
        `Bots should be current on ${path}`,
      ).toBe('page');
      expect(
        within(list).getByRole('link', { name: 'Home' }).getAttribute('aria-current'),
        `Home should not be current on ${path}`,
      ).toBeNull();
      unmount();
    }
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('wraps children in the main content landmark', () => {
    renderLayout(<p>bot detail goes here</p>);
    const main = screen.getByRole('main');
    expect(main.getAttribute('id')).toBe('main-content');
    expect(within(main).getByText('bot detail goes here')).toBeTruthy();
    expect(railLinks()).toHaveLength(6);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import HomePage from './page';

vi.mock('next/font/google', () => ({
  Geist_Mono: () => ({ className: 'mono-mock', variable: '--landing-mono' }),
  Plus_Jakarta_Sans: () => ({ className: 'jakarta-mock' }),
}));

vi.mock('lenis', () => ({
  default: class {
    raf(): void {}
    scrollTo(): void {}
    destroy(): void {}
  },
}));

describe('homepage (antigravity port)', () => {
  it('renders the H1, trial line, pricing tiers, and FAQ without console errors', () => {
    const fetchStub = vi.fn();
    vi.stubGlobal('fetch', fetchStub);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(<HomePage />);
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: /build custom ai discord bots in minutes, not weeks/i,
        }),
      ).toBeTruthy();
      expect(screen.getByText(/100 ai credits for 3 days/i)).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Starter Trial' })).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Corvus Pro' })).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Corvus Studio' })).toBeTruthy();
      expect(screen.getByText('$10')).toBeTruthy();
      expect(screen.getByText('$29')).toBeTruthy();
      expect(screen.getAllByTestId('faq-item')).toHaveLength(5);
      expect(screen.getByRole('link', { name: 'Skip to content' })).toBeTruthy();
      expect(fetchStub).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('points sign-in CTAs at the login route and product CTAs at the dashboard', () => {
    render(<HomePage />);
    const signIns = screen.getAllByRole('link', { name: /sign in with discord/i });
    expect(signIns.length).toBeGreaterThanOrEqual(2);
    for (const link of signIns) {
      expect(link.getAttribute('href')).toBe('/api/auth/login');
    }
    const trials = screen.getAllByRole('link', { name: 'Start 3-Day Free Trial' });
    expect(trials.length).toBeGreaterThanOrEqual(2);
    for (const link of trials) {
      expect(link.getAttribute('href')).toBe('/dashboard');
    }
    expect(screen.getByRole('link', { name: 'Upgrade to Pro' }).getAttribute('href')).toBe(
      '/dashboard',
    );
    expect(screen.getByRole('link', { name: 'Select Studio Plan' }).getAttribute('href')).toBe(
      '/dashboard',
    );
    const demos = screen.getAllByRole('link', { name: 'Interactive Demo' });
    expect(demos.length).toBeGreaterThanOrEqual(2);
    for (const link of demos) {
      expect(link.getAttribute('href')).toBe('/demo');
    }
    const galleryLinks = screen.getAllByRole('link', { name: /use this template/i });
    expect(galleryLinks).toHaveLength(3);
    for (const link of galleryLinks) {
      expect(link.getAttribute('href')).toBe('/gallery');
    }
  });

  it('keeps every template tile honest and opens the FAQ on the first item', () => {
    render(<HomePage />);
    expect(screen.getAllByText('Template')).toHaveLength(3);
    const items = screen.getAllByTestId('faq-item');
    expect(items[0]?.getAttribute('data-open')).toBe('true');
    for (const item of items.slice(1)) {
      expect(item.getAttribute('data-open')).toBe('false');
    }
  });

  it('leaves community entries as plain text with no placeholder hrefs', () => {
    const { container } = render(<HomePage />);
    expect(screen.getByText('Community Discord').tagName).toBe('SPAN');
    expect(screen.getByText('X (Twitter)').tagName).toBe('SPAN');
    expect(screen.queryByRole('link', { name: 'Community Discord' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'X (Twitter)' })).toBeNull();
    expect(container.querySelector('a[href="https://discord.com"]')).toBeNull();
    expect(container.querySelector('a[href="https://x.com"]')).toBeNull();
  });
});

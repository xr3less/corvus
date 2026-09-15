import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PrivacyPolicyPage from './page';
// The landing footer is the only surface that links the two legal routes, and
// app/page.test.tsx is outside this task's write scope — so its guard lives
// here. HomePage pulls in next/font + lenis, so both are stubbed.
import HomePage from '../page';

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

const JARGON = [
  'OAuth',
  'OAuth2',
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
  'Enterprise-Grade',
  'Architectural Breakthroughs',
];

describe('privacy policy page', () => {
  it('renders the H1 and every key section', () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeTruthy();
    for (const heading of [
      'The short version',
      'What we keep',
      'What we never keep',
      'Your bot token',
      'Who else handles your data',
      'How long we keep it',
      'Your choices',
      'If something goes wrong',
      'Changes to this policy',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeTruthy();
    }
  });

  it('covers storage, never-stored, sub-processors, 72h notice, access/delete and the 12-month wake', () => {
    const { container } = render(<PrivacyPolicyPage />);
    const text = container.textContent ?? '';
    expect(text).toContain('Your Discord account ID');
    expect(text).toContain('No card numbers');
    expect(text).toContain('No Discord password');
    expect(text).toContain('Creem');
    expect(text).toContain('Contabo');
    expect(text).toContain('Hetzner');
    expect(text).toContain('72 hours');
    expect(text).toContain('12 months');
    expect(text).toContain('support@corvus.ai');
    const dashboard = screen.getByRole('link', { name: 'Open your dashboard' });
    expect(dashboard.getAttribute('href')).toBe('/dashboard');
  });

  it('skips to content and links both legal routes from its footer', () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe(
      '#main-content',
    );
    expect(screen.getByRole('link', { name: 'Privacy policy' }).getAttribute('href')).toBe(
      '/privacy',
    );
    expect(screen.getByRole('link', { name: 'Terms of service' }).getAttribute('href')).toBe(
      '/terms',
    );
  });

  it('keeps developer jargon off the page', () => {
    const { container } = render(<PrivacyPolicyPage />);
    const text = container.textContent ?? '';
    for (const term of JARGON) {
      expect(text).not.toContain(term);
    }
  });
});

describe('landing footer legal links', () => {
  it('points Privacy Policy and Terms of Service at the real routes', () => {
    render(<HomePage />);
    expect(screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe(
      '/privacy',
    );
    expect(screen.getByRole('link', { name: 'Terms of Service' }).getAttribute('href')).toBe(
      '/terms',
    );
  });
});

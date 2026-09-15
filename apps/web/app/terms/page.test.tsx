import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import TermsOfServicePage from './page';

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

describe('terms of service page', () => {
  it('renders the H1 and every key section', () => {
    render(<TermsOfServicePage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of service' })).toBeTruthy();
    for (const heading of [
      'The short version',
      'Who can use Corvus',
      'Your account and your servers',
      'Plans, trial, and billing',
      'Acceptable use',
      'Your content and your bot',
      'How the service runs',
      'Ending your account',
      'Changes to these terms',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeTruthy();
    }
  });

  it('states the trial, prices, credit shape, sleep-not-delete and contact in plain words', () => {
    const { container } = render(<TermsOfServicePage />);
    const text = container.textContent ?? '';
    expect(text).toContain('3 days of full Pro access');
    expect(text).toContain('no card required');
    expect(text).toContain('$10');
    expect(text).toContain('$29');
    expect(text).toContain('$5 refill pack');
    expect(text).toContain('12 months');
    expect(text).toContain('naps');
    expect(text).toContain('Creem');
    expect(text).toContain('support@corvus.ai');
  });

  it('skips to content and links both legal routes from its footer', () => {
    render(<TermsOfServicePage />);
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
    const { container } = render(<TermsOfServicePage />);
    const text = container.textContent ?? '';
    for (const term of JARGON) {
      expect(text).not.toContain(term);
    }
  });
});

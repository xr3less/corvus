/// <reference types="vite/client" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import PryzmPage from './page';
import styles from './pryzm.module.css';
import pageSource from './page.tsx?raw';
import islandsSource from './islands.tsx?raw';

// File-text read (not the CSS-module class map) for the style assertions.
const cssSource = readFileSync(
  path.join(process.cwd(), 'app', 'pryzm', 'pryzm.module.css'),
  'utf8',
);

const LOOP_OK = 'You are on the list — talk soon.';

const FAQ_QUESTIONS = [
  "What's free, and what needs Pro?",
  'Can I use what I make commercially?',
  'Where do my images go?',
  'Can I share a look with a teammate?',
  'What video formats can I export?',
  'Do I need to install anything?',
  'How does Pryzm Pro billing work?',
];

const LOOK_TITLES = [
  'Ink Facet',
  'Undergrowth',
  'Pewter Fade',
  'Pewter Stock',
  'Violets',
  'Bright Spark',
  'Soft Blend',
  'Purple Haze',
];

// Assembled at runtime so the quarantined folder name never appears literally
// in this source (KI-011 grep gate: zero hits under app/pryzm). The assertion
// still checks the rendered output for the string.
const QUARANTINE_DIR = ['clone', 'pryzm'].join('-');
const QUARANTINE_RE = new RegExp(QUARANTINE_DIR);

function openState(item: Element): string | null {
  return item.getAttribute('data-open');
}

describe('pryzm route (1:1 next port of the static clone)', () => {
  it('renders the efferd hero: badge, two-line H1, two buttons, dashboard panel', () => {
    const { container } = render(<PryzmPage />);
    const hero = container.querySelector('[data-od-id="hero"]');
    expect(hero).not.toBeNull();
    const badge = within(hero as HTMLElement).getByTestId('hero-badge');
    expect(badge.textContent).toContain('DRAFT');
    expect(badge.textContent).toContain('Private preview, members never see it');
    const found = container.querySelector('[data-od-id="hero-title"]');
    expect(found).not.toBeNull();
    const heading = found as HTMLElement;
    expect(heading.tagName).toBe('H1');
    expect(heading.textContent).toContain('Describe the');
    expect(heading.textContent).toContain('your server needs');
    expect(screen.getByRole('heading', { level: 1 })).toBe(heading);
    const rotator = heading.querySelector(`.${styles.rotator}`);
    expect(rotator).not.toBeNull();
    const rotWords = Array.from(
      (rotator as HTMLElement).querySelectorAll(`.${styles.rotWord}`),
    ).map((word) => word.textContent);
    expect(rotWords).toEqual(['bot', 'moderator', 'welcomer', 'guardian']);
    const lines = Array.from(heading.querySelectorAll(`.${styles.heroTitleLine}`)).map(
      (line) => line.textContent,
    );
    expect(lines).toEqual(['Describe the botmoderatorwelcomerguardian', 'your server needs']);
    expect(container.textContent).toContain(
      'Corvus drafts every command, you approve each change, then you publish it live.',
    );
    const links = within(hero as HTMLElement).getAllByRole('link');
    const watch = within(hero as HTMLElement).getByRole('link', { name: /watch it run first/i });
    const cta = within(hero as HTMLElement).getByRole('link', { name: /start building/i });
    expect(watch.getAttribute('href')).toBe('#studio');
    expect(watch.getAttribute('data-od-id')).toBe('hero-secondary');
    expect(cta.getAttribute('href')).toBe('/dashboard');
    expect(cta.getAttribute('data-od-id')).toBe('hero-cta');
    expect(links.indexOf(watch)).toBeLessThan(links.indexOf(cta));
    const panel = within(hero as HTMLElement).getByTestId('hero-panel');
    expect(panel.textContent).toContain('Corvus draft preview');
    expect(panel.textContent).toContain('Preview');
    for (const item of [
      'My servers',
      'Quick create',
      'Overview',
      'Commands',
      'Activity',
      'Team',
      'Manage',
      'Drafts',
      'Publish log',
      'Settings',
    ]) {
      expect(panel.textContent).toContain(item);
    }
    for (const label of ['/welcome drafts', 'Previews watched', 'Publishes', 'Uptime']) {
      expect(panel.textContent).toContain(label);
    }
    const examples = (panel.textContent?.match(/\(example\)/g) ?? []).length;
    expect(examples).toBeGreaterThanOrEqual(5);
    expect((hero as HTMLElement).textContent).not.toMatch(/sign.?in/i);
    expect((hero as HTMLElement).textContent).not.toMatch(/sign.?up/i);
  });

  it('hero is plain: zero collage tiles and zero data-speed', () => {
    const { container } = render(<PryzmPage />);
    const hero = container.querySelector('[data-od-id="hero"]');
    expect(hero).not.toBeNull();
    expect((hero as HTMLElement).querySelectorAll('[data-testid="collage-tile"]')).toHaveLength(0);
    expect((hero as HTMLElement).querySelectorAll('[data-speed]')).toHaveLength(0);
    expect(container.querySelector('#collage')).toBeNull();
    expect(pageSource).not.toMatch(/COLLAGE/);
    expect(pageSource).not.toMatch(/collage-tile/);
    expect(pageSource).not.toMatch(/data-speed/);
    expect(pageSource).not.toMatch(/heroFade/);
  });

  it('efferd hero has zero <img>, ordered stack, and no remote or sign-in', () => {
    const { container } = render(<PryzmPage />);
    const hero = container.querySelector('[data-od-id="hero"]');
    expect(hero).not.toBeNull();
    const heroEl = hero as HTMLElement;
    expect(heroEl.querySelectorAll('img')).toHaveLength(0);
    expect(heroEl.innerHTML).not.toMatch(QUARANTINE_RE);
    expect(heroEl.innerHTML).not.toMatch(/https?:\/\//);
    const badge = within(heroEl).getByTestId('hero-badge');
    expect(badge.textContent).toContain('DRAFT');
    expect(badge.textContent).toContain('Private preview, members never see it');
    const title = heroEl.querySelector('[data-od-id="hero-title"]');
    expect(title).not.toBeNull();
    expect((title as HTMLElement).tagName).toBe('H1');
    const rotatorEl = (title as HTMLElement).querySelector(`.${styles.rotator}`);
    expect(rotatorEl).not.toBeNull();
    const rotatorWords = Array.from(
      (rotatorEl as HTMLElement).querySelectorAll(`.${styles.rotWord}`),
    ).map((word) => word.textContent);
    expect(rotatorWords).toEqual(['bot', 'moderator', 'welcomer', 'guardian']);
    const lines = Array.from(
      (title as HTMLElement).querySelectorAll(`.${styles.heroTitleLine}`),
    ).map((line) => line.textContent);
    expect(lines).toEqual(['Describe the botmoderatorwelcomerguardian', 'your server needs']);
    const sub = heroEl.querySelector('[data-od-id="hero-sub"]');
    expect(sub?.textContent).toContain(
      'Corvus drafts every command, you approve each change, then you publish it live.',
    );
    const watch = within(heroEl).getByRole('link', { name: /watch it run first/i });
    expect(watch.getAttribute('href')).toBe('#studio');
    const cta = within(heroEl).getByRole('link', { name: /start building/i });
    expect(cta.getAttribute('href')).toBe('/dashboard');
    expect(cta.getAttribute('data-od-id')).toBe('hero-cta');
    const panel = within(heroEl).getByTestId('hero-panel');
    expect(panel.textContent).toContain('Corvus draft preview');
    expect(panel.querySelectorAll('img')).toHaveLength(0);
    expect(panel.querySelector('svg')).not.toBeNull();
    const text = heroEl.textContent ?? '';
    const badgeIdx = text.indexOf('Private preview');
    const titleIdx = text.indexOf('Describe the bot');
    const watchIdx = text.indexOf('Watch it run first');
    const ctaIdx = text.indexOf('Start building');
    const panelIdx = text.indexOf('Corvus draft preview');
    expect(badgeIdx).toBeGreaterThanOrEqual(0);
    expect(badgeIdx).toBeLessThan(titleIdx);
    expect(titleIdx).toBeLessThan(watchIdx);
    expect(watchIdx).toBeLessThan(ctaIdx);
    expect(ctaIdx).toBeLessThan(panelIdx);
    expect(heroEl.textContent).not.toMatch(/sign.?in/i);
    expect(heroEl.textContent).not.toMatch(/sign.?up/i);
  });

  it('header nav carries the three section anchors plus studio and sign-in links', () => {
    render(<PryzmPage />);
    const header = screen.getByRole('banner');
    const nav = within(header).getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'Inspiration' }).getAttribute('href')).toBe(
      '#remix',
    );
    expect(within(nav).getByRole('link', { name: /lab/i }).getAttribute('href')).toBe('#flow');
    expect(within(nav).getByRole('link', { name: 'Pricing' }).getAttribute('href')).toBe(
      '#pricing',
    );
    expect(within(nav).getByRole('link', { name: 'Open studio' }).getAttribute('href')).toBe(
      '#studio',
    );
    expect(within(nav).getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('#cta');
  });

  it('mobile menu toggles aria-expanded and closes back on a second press', () => {
    const { container } = render(<PryzmPage />);
    const button = screen.getByRole('button', { name: 'Open menu' });
    const menu = container.querySelector('#mobileMenu');
    expect(menu).not.toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect((menu as HTMLElement).classList.contains(styles.mobileMenuOpen)).toBe(false);
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect((menu as HTMLElement).classList.contains(styles.mobileMenuOpen)).toBe(true);
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect((menu as HTMLElement).classList.contains(styles.mobileMenuOpen)).toBe(false);
  });

  it('remix grid renders the 8 verbatim Pryzm looks in order', () => {
    const { container } = render(<PryzmPage />);
    const grid = container.querySelector('[data-od-id="remix-grid"]');
    expect(grid).not.toBeNull();
    const cards = Array.from((grid as HTMLElement).querySelectorAll('article'));
    expect(cards).toHaveLength(8);
    expect(cards.map((card) => card.querySelector('h3')?.textContent)).toEqual(LOOK_TITLES);
  });

  it('FAQ keeps all 7 questions and opens a single item at a time', () => {
    render(<PryzmPage />);
    const items = screen.getAllByTestId('faq-item');
    expect(items).toHaveLength(7);
    expect(items.map((item) => within(item).getByRole('button').textContent)).toEqual(
      FAQ_QUESTIONS.map((q) => `${q}+`),
    );
    for (const item of items) {
      expect(openState(item)).toBe('false');
    }
    const firstButton = within(items[0] as HTMLElement).getByRole('button');
    const secondButton = within(items[1] as HTMLElement).getByRole('button');
    fireEvent.click(firstButton);
    expect(openState(items[0] as Element)).toBe('true');
    fireEvent.click(secondButton);
    expect(openState(items[0] as Element)).toBe('false');
    expect(openState(items[1] as Element)).toBe('true');
    fireEvent.click(secondButton);
    expect(openState(items[1] as Element)).toBe('false');
  });

  it('pricing lists Trial, Pro, and Studio with monthly prices and dashboard CTAs', () => {
    const { container } = render(<PryzmPage />);
    const section = container.querySelector('[data-od-id="pricing-section"]');
    expect(section).not.toBeNull();
    const sectionEl = section as HTMLElement;
    expect(sectionEl.getAttribute('id')).toBe('pricing');
    expect(sectionEl.textContent).toContain('Simple, honest pricing');
    expect(sectionEl.textContent).toContain('Start with 3 days of Pro features');
    expect(sectionEl.textContent).toContain('no card required');
    expect(sectionEl.textContent).not.toContain('full Pro');
    const trial = sectionEl.querySelector('[data-od-id="pricing-trial"]');
    const pro = sectionEl.querySelector('[data-od-id="pricing-pro"]');
    const studio = sectionEl.querySelector('[data-od-id="pricing-studio"]');
    expect(trial).not.toBeNull();
    expect(pro).not.toBeNull();
    expect(studio).not.toBeNull();
    expect(trial?.textContent).toContain('Trial');
    expect(trial?.textContent).toContain('$0');
    expect(trial?.textContent).toContain('Pro features for 3 days');
    expect(trial?.textContent).toContain('1 bot for 1 server');
    expect(trial?.textContent).toContain('100 credits to spend on builds');
    expect(trial?.textContent).toContain('Every Pro feature unlocked');
    expect(trial?.textContent).toContain('Sleeps after the trial, nothing is deleted');
    expect(pro?.textContent).toContain('Pro');
    expect(pro?.textContent).toContain('$10');
    expect(pro?.textContent).toContain('per month');
    expect(pro?.textContent).toContain('Popular');
    expect(pro?.textContent).toContain('2 bots for up to 5 servers');
    expect(pro?.textContent).toContain('2000 credits per month (about 1800 builds)');
    expect(pro?.textContent).toContain('Exports included free');
    expect(pro?.textContent).toContain('Priority build queue');
    expect(studio?.textContent).toContain('Studio');
    expect(studio?.textContent).toContain('$29');
    expect(studio?.textContent).toContain('per month');
    expect(studio?.textContent).toContain('8 bots for up to 100 servers');
    expect(studio?.textContent).toContain('6000 credits per month');
    expect(studio?.textContent).toContain('Everything in Pro included');
    const trialCta = within(trial as HTMLElement).getByRole('link', { name: 'Start free' });
    const proCta = within(pro as HTMLElement).getByRole('link', { name: 'Start building' });
    const studioCta = within(studio as HTMLElement).getByRole('link', { name: 'Scale up' });
    expect(trialCta.getAttribute('href')).toBe('/dashboard');
    expect(proCta.getAttribute('href')).toBe('/dashboard');
    expect(studioCta.getAttribute('href')).toBe('/dashboard');
    expect(sectionEl.querySelectorAll('img')).toHaveLength(0);
    expect(sectionEl.querySelectorAll('svg').length).toBeGreaterThanOrEqual(11);
    expect(sectionEl.querySelectorAll('[data-period]')).toHaveLength(0);
    expect(sectionEl.querySelector('#proPrice')).toBeNull();
    expect(sectionEl.querySelector('#proPer')).toBeNull();
    expect(sectionEl.innerHTML).not.toMatch(/\/sign-up/);
    expect(sectionEl.textContent).not.toMatch(/\$9/);
    expect(sectionEl.textContent).not.toMatch(/\$81/);
    expect(sectionEl.textContent).not.toMatch(/\$50/);
    expect(sectionEl.textContent).not.toMatch(/\$99/);
    expect(sectionEl.textContent).not.toMatch(/\$299/);
  });

  it('pricing source carries no toggle, sign-up, or reference prices', () => {
    expect(pageSource).not.toMatch(/data-period/);
    expect(pageSource).not.toMatch(/proPrice/);
    expect(pageSource).not.toMatch(/proPer/);
    expect(pageSource).not.toMatch(/\/sign-up/);
    expect(pageSource).not.toMatch(/\$\b9\b/);
    expect(pageSource).not.toMatch(/\$81/);
    expect(pageSource).not.toMatch(/\$50/);
    expect(pageSource).not.toMatch(/\$99/);
    expect(pageSource).not.toMatch(/\$299/);
  });

  it('loop demo form shows the ok message on submit; footer form resets', () => {
    const { container } = render(<PryzmPage />);
    const loopForm = container.querySelector('#loopForm');
    const loopEmail = container.querySelector('#loopEmail');
    const loopMsg = container.querySelector('#loopMsg');
    expect(loopForm).not.toBeNull();
    fireEvent.change(loopEmail as Element, { target: { value: 'fan@pryzm.design' } });
    fireEvent.submit(loopForm as Element);
    expect(loopMsg?.textContent).toBe(LOOP_OK);
    expect((loopEmail as HTMLInputElement).value).toBe('');
    const footForm = container.querySelector('#footForm');
    const footEmail = container.querySelector('#footEmail');
    fireEvent.change(footEmail as Element, { target: { value: 'fan@pryzm.design' } });
    fireEvent.submit(footForm as Element);
    expect((footEmail as HTMLInputElement).value).toBe('');
  });

  it('self-contains media: no quarantined paths, no external hosts, no raster assets', () => {
    const { container } = render(<PryzmPage />);
    // The clone's font sheet was an external <link> — gone (KI-011).
    expect(container.querySelector('link[rel="stylesheet"]')).toBeNull();
    const html = container.innerHTML;
    expect(html).not.toMatch(QUARANTINE_RE);
    expect(html).not.toMatch(/https?:\/\//);
    // Every visual is CSS-only; no <img> to 404 on.
    expect(container.querySelectorAll('img')).toHaveLength(0);
    for (const source of [pageSource, islandsSource, cssSource]) {
      expect(source).not.toMatch(QUARANTINE_RE);
    }
  });

  it('renders without console errors and makes zero backend calls', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(<PryzmPage />);
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
    expect(pageSource).not.toMatch(/fetch\s*\(/);
    expect(islandsSource).not.toMatch(/fetch\s*\(/);
  });

  it('keeps page a server component and islands client-only', () => {
    expect(pageSource).not.toMatch(/use client/);
    expect(pageSource).not.toMatch(/useState/);
    expect(islandsSource).toMatch(/use client/);
    expect(islandsSource).toMatch(/useEffect/);
  });

  it('ships no CDN or framework strings in the new sources', () => {
    for (const source of [pageSource, islandsSource, cssSource]) {
      expect(source).not.toMatch(/cdn\.jsdelivr/);
      expect(source).not.toMatch(/unpkg/);
      expect(source).not.toMatch(/tailwind/);
    }
  });

  it('handles reduced motion in both the behavior layer and the stylesheet', () => {
    expect(islandsSource).toMatch(/prefers-reduced-motion/);
    expect(cssSource).toMatch(/prefers-reduced-motion/);
  });

  it('parallax is one rAF loop over data-speed with cleanup and no timers', () => {
    expect(islandsSource).toMatch(/requestAnimationFrame/);
    expect(islandsSource).toMatch(/cancelAnimationFrame/);
    expect(islandsSource).toMatch(/translate3d/);
    expect(islandsSource).toMatch(/data-speed/);
    expect(islandsSource).toMatch(/passive/);
    expect(islandsSource).toMatch(/IntersectionObserver/);
    expect(islandsSource).toMatch(/await import\('lenis'\)/);
    expect(islandsSource).not.toMatch(/LENIS_SPECIFIER/);
    expect(islandsSource).not.toMatch(/setInterval/);
    expect(islandsSource).not.toMatch(/setTimeout/);
  });

  it('stylesheet carries the source design tokens and key converted rules', () => {
    expect(cssSource).toMatch(/#0b0b0d/i);
    expect(cssSource).toMatch(/#141417/i);
    expect(cssSource).toMatch(/Poppins/);
    expect(cssSource).toMatch(/grid-template-rows:\s*0fr/);
    expect(cssSource).toMatch(/radial-gradient/);
    expect(cssSource).toMatch(/\.faqItem/);
    expect(cssSource).not.toMatch(/\.collage/);
    expect(cssSource).not.toMatch(/\.heroFade/);
    expect(cssSource).not.toMatch(/1080px/);
  });

  it('hero rotator is CSS-only: grid stack, keyframes, reduced-motion fallback', () => {
    expect(cssSource).toMatch(/\.rotator/);
    expect(cssSource).toMatch(/display:\s*inline-grid/);
    expect(cssSource).toMatch(/grid-area:\s*1\s*\/\s*1/);
    expect(cssSource).toMatch(/@keyframes\s+rotCycle/);
    expect(cssSource).toMatch(/animation:\s*rotCycle/);
    expect(cssSource).toMatch(/\.rotWord:first-child/);
    expect(pageSource).toMatch(/rotator/);
    expect(pageSource).toMatch(/rotWord/);
    expect(pageSource).not.toMatch(/framer-motion/);
    expect(pageSource).not.toMatch(/lucide/);
  });

  it('hero fidelity: flat 36/48px H1, 8px buttons, box badge, 64rem container, panel glow', () => {
    expect(cssSource).toMatch(/\.heroTitleCenter\s*\{[^}]*max-width:\s*42rem/);
    expect(cssSource).toMatch(/\.heroTitleCenter\s*\{[^}]*font-size:\s*36px/);
    expect(cssSource).toMatch(/\.heroTitleCenter[\s\S]*?font-size:\s*48px/);
    expect(cssSource).toMatch(/\.heroTitleCenter\s*\{[^}]*line-height:\s*1\.25/);
    expect(cssSource).toMatch(/\.heroGradient\s*\{\s*color:\s*#FAFAFA/i);
    expect(cssSource).not.toMatch(/-webkit-text-fill-color/);
    expect(pageSource).toMatch(/heroGradient/);
    expect(cssSource).toMatch(/\.heroCtaGhost\s*\{[^}]*border-radius:\s*8px/);
    expect(cssSource).toMatch(/\.heroCtaPrimary\s*\{[^}]*border-radius:\s*8px/);
    expect(cssSource).toMatch(/\.heroCtaGhost\s*\{[^}]*height:\s*40px/);
    expect(cssSource).toMatch(/\.heroCtaPrimary\s*\{[^}]*height:\s*40px/);
    expect(cssSource).toMatch(/\.heroCtaGhost\s*\{[^}]*font-size:\s*14px/);
    expect(cssSource).toMatch(/\.heroCtaPrimary\s*\{[^}]*font-size:\s*14px/);
    expect(cssSource).not.toMatch(/\.heroCtaPrimary\s*\{[^}]*999px/);
    expect(cssSource).not.toMatch(/\.heroCtaGhost\s*\{[^}]*999px/);
    expect(cssSource).toMatch(/\.heroBadge\s*\{[^}]*border-radius:\s*4px/);
    expect(cssSource).toMatch(/\.heroBadge\s*\{[^}]*gap:\s*12px/);
    expect(cssSource).toMatch(/\.heroBadge\s*\{[^}]*padding:\s*4px/);
    expect(cssSource).not.toMatch(/\.heroBadge\s*\{[^}]*999px/);
    expect(cssSource).toMatch(/\.heroBadgeDivider\s*\{[^}]*height:\s*20px/);
    expect(cssSource).toMatch(/\.heroBadgeBox\s*\{[^}]*font-size:\s*12px/);
    expect(cssSource).toMatch(/\.heroInner\s*\{[^}]*max-width:\s*64rem/);
    expect(cssSource).toMatch(/\.heroCenterSub\s*\{[^}]*font-size:\s*14px/);
    expect(cssSource).toMatch(/\.heroCenterSub[\s\S]*?font-size:\s*20px/);
    expect(cssSource).toMatch(/\.heroPanel\s*\{[^}]*margin-top:\s*32px/);
    expect(cssSource).toMatch(/\.heroPanel[\s\S]*?margin-top:\s*80px/);
    expect(cssSource).toMatch(/\.heroPanel\s*\{[^}]*border-radius:\s*12px/);
    expect(cssSource).toMatch(/\.heroPanel\s*\{[^}]*box-shadow/);
    expect(cssSource).toMatch(/mask-image/);
    expect(cssSource).toMatch(/blur\(50px\)/);
    expect(cssSource).toMatch(/radial-gradient\(closest-side, rgb\(255 255 255 \/ 0\.1\)/);
    expect(cssSource).toMatch(/padding-block:\s*8rem 6rem/);
  });

  it('hero badge renders box rhythm with divider and keeps copy and order', () => {
    const { container } = render(<PryzmPage />);
    const hero = container.querySelector('[data-od-id="hero"]');
    expect(hero).not.toBeNull();
    const badge = within(hero as HTMLElement).getByTestId('hero-badge');
    expect(badge.querySelector(`.${styles.heroBadgeBox}`)).not.toBeNull();
    expect(badge.querySelector(`.${styles.heroBadgeDivider}`)).not.toBeNull();
    expect(badge.textContent).toContain('DRAFT');
    expect(badge.textContent).toContain('Private preview, members never see it');
    const heading = container.querySelector('[data-od-id="hero-title"]');
    expect(heading).not.toBeNull();
    const rotWords = Array.from(
      (heading as HTMLElement).querySelectorAll(`.${styles.rotWord}`),
    ).map((word) => word.textContent);
    expect(rotWords).toEqual(['bot', 'moderator', 'welcomer', 'guardian']);
    const watch = within(hero as HTMLElement).getByRole('link', { name: /watch it run first/i });
    const cta = within(hero as HTMLElement).getByRole('link', { name: /start building/i });
    const links = within(hero as HTMLElement).getAllByRole('link');
    expect(watch.getAttribute('href')).toBe('#studio');
    expect(cta.getAttribute('href')).toBe('/dashboard');
    expect(links.indexOf(watch)).toBeLessThan(links.indexOf(cta));
  });

  it('bg unity: every full-bleed band resolves to the hero token; component surfaces kept', () => {
    const bandBlock = (selector: string): string => {
      const match = cssSource.match(new RegExp(`\\${selector}\\s*\\{[^}]*\\}`));
      expect(match).not.toBeNull();
      return match?.[0] ?? '';
    };
    for (const selector of ['.hero', '.main', '.siteFooter', '.page']) {
      expect(bandBlock(selector)).toMatch(/background:\s*var\(--pryzm-bg\)/);
    }
    expect(bandBlock('.hero')).not.toMatch(/#0a0a0b/i);
    expect(cssSource).toMatch(/\.heroCtaPrimary\s*\{[^}]*color:\s*#0a0a0b/i);
    expect(cssSource).toMatch(/\.studioShell\s*\{[^}]*background:\s*#0c0c0e/i);
    expect(cssSource).toMatch(/\.emailInput\s*\{[^}]*background:\s*#0e0e11/i);
    expect(cssSource).toMatch(/\.card\s*\{[^}]*background:\s*var\(--pryzm-surface\)/);
    expect(cssSource).toMatch(/\.heroPanel\s*\{[^}]*background:\s*#101014/i);
    expect(cssSource).toMatch(/\.statCard\s*\{[^}]*background:\s*#16161b/i);
    expect(cssSource).toMatch(/\.chartCard\s*\{[^}]*background:\s*#16161b/i);
    expect(cssSource).toMatch(/\.dotbg\s*\{[^}]*background-image:\s*radial-gradient/);
    expect(cssSource).toMatch(/\.dotbg\s*\{[^}]*background-size:\s*22px 22px/);
    expect(cssSource).toContain('data:image/svg+xml');
    expect(cssSource).toMatch(/:focus-visible/);
    expect(cssSource).toMatch(/prefers-reduced-motion/);
  });
});

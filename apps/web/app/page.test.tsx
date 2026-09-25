import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import HomePage from './page';
import styles from './landing.module.css';

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

// jsdom ships no canvas backend, so every render of HomePage lets VelarisCanvas's
// WebGL probe reach jsdom's unimplemented getContext() and log to console.error.
// Returning null makes the component take the null-context early return it already handles.
let getContextSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterAll(() => {
  getContextSpy.mockRestore();
});

/* F13 (2026-09-24): the landing page ships in Turkish. Every page-owned string
   was translated; plan names, prices and credit figures did NOT move. This list
   is the pre-translation English copy that must not come back — it is a
   regression guard for the language change, not a claim that the text is
   wrong in English. Shared literals that legitimately stay (Corvus, Starter,
   Corvus Pro, Corvus Studio, BOT, template names, X (Twitter), the
   corvus.ai/studio URL, the #-prefixed capability tags and MEE6/Dyno) are
   deliberately absent from it.

   The honesty qualifiers are the other half of the guard: the page's planned
   claims are qualified in Turkish exactly where the English page qualified
   them — 14 `(planlı)` suffixes and 13 `Planlı:` prefixes, the same counts as
   the source strings (proved against the pre-change file). */
const ENGLISH_RESIDUE = [
  'Build Custom AI Discord Bots in Minutes, Not Weeks',
  'Stop paying for 4-5 rigid bots on every server',
  'No code | No token paste | free preview',
  'Start building free',
  'Interactive Demo',
  'Sign in with Discord',
  'Skip to content',
  'Three things we promise.',
  'Your server. Your bot. No surprises.',
  'Permission preview',
  'Send Messages',
  'Kick Members',
  'Manage Messages',
  'View Audit Log',
  'Administrator',
  'Always on. Always remembered.',
  'Describe it. We build it.',
  'Browse templates',
  'Start from a template',
  'Use this template',
  'Open gallery',
  'Transparent pricing, no per-server fees',
  'No Card Required',
  'Most Popular',
  'Recommended',
  'Networks & Agencies',
  'Pro — coming soon',
  'Studio — coming soon',
  'Frequently Asked Questions',
  'Community Discord',
  'All rights reserved.',
  'not enforced yet',
];

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
          name: /özel ai discord botlarını haftalar değil, dakikalar içinde kur/i,
        }),
      ).toBeTruthy();
      // KI-033: the trial is enforced now, so the old "limits not enforced yet"
      // promise is gone from every surface. Both the hero and the Starter card
      // carry the locked replacement, byte-for-byte (Turkish since F13).
      expect(
        screen.getAllByText('Ücretsiz 3 günlük deneme — 1 bot, 100 AI kredisi, kart gerekmez.')
          .length,
      ).toBeGreaterThanOrEqual(2);
      expect(screen.queryByText(/not enforced yet/i)).toBeNull();
      expect(screen.getByRole('heading', { name: 'Starter' })).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Corvus Pro' })).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Corvus Studio' })).toBeTruthy();
      expect(screen.getByText('$10')).toBeTruthy();
      expect(screen.getByText('$29')).toBeTruthy();
      expect(screen.getAllByTestId('faq-item')).toHaveLength(5);
      expect(screen.getByRole('link', { name: 'İçeriğe geç' })).toBeTruthy();
      expect(fetchStub).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('leaves no pre-translation English copy on the page', () => {
    const { container } = render(<HomePage />);
    const text = container.textContent ?? '';
    for (const english of ENGLISH_RESIDUE) {
      expect(text).not.toContain(english);
    }
  });

  it('answers the trial-expiry FAQ with the enforced behaviour, not a promise', () => {
    render(<HomePage />);
    // The FAQ item is closed by default, so the answer is asserted through the
    // component's own copy rather than a visible-text query: expand-by-default
    // is item[0] only (proved below).
    const items = screen.getAllByTestId('faq-item');
    const expiry = items.find((item) => /deneme sürem biterse/i.test(item.textContent ?? ''));
    expect(expiry).toBeDefined();
    expect(expiry?.textContent).toContain(
      'Deneme süren bittiğinde botların duraklar ve olduğu gibi kalır — hiçbir şey silinmez.',
    );
    expect(expiry?.textContent).not.toContain('not enforced yet');
  });

  it('states the enforced trial allowance in the credits FAQ alongside the still-planned plans', () => {
    render(<HomePage />);
    const items = screen.getAllByTestId('faq-item');
    const credits = items.find((item) =>
      /ai kredileri nasıl işliyor/i.test(item.textContent ?? ''),
    );
    expect(credits).toBeDefined();
    expect(credits?.textContent).toContain('Deneme 3 gün için 100 kredi içerir;');
    // The trial line is live, so it must NOT carry a "Planlı:" label; the Pro
    // figure is still a plan and keeps its own wording without the retired
    // "(not enforced yet)" disclaimer.
    expect(credits?.textContent).not.toContain('Planlı:');
    expect(credits?.textContent).not.toContain('(not enforced yet)');
  });

  it('describes the Starter tier as a planned price with an enforced trial', () => {
    render(<HomePage />);
    expect(
      screen.getAllByText(
        'Fiyatlar ve limitler planlı — deneme (1 bot, 100 AI kredisi) uygulanıyor.',
      ).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('points sign-in CTAs at the login route and product CTAs at the dashboard', () => {
    render(<HomePage />);
    const signIns = screen.getAllByRole('link', { name: /discord ile giriş yap/i });
    expect(signIns.length).toBeGreaterThanOrEqual(2);
    for (const link of signIns) {
      expect(link.getAttribute('href')).toBe('/api/auth/login');
    }
    const starts = screen.getAllByRole('link', { name: 'Ücretsiz kurmaya başla' });
    expect(starts.length).toBeGreaterThanOrEqual(2);
    for (const link of starts) {
      expect(link.getAttribute('href')).toBe('/dashboard');
    }
    expect(screen.getAllByText(/fiyatlar ve limitler planlı/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('link', { name: 'Pro — çok yakında' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Studio — çok yakında' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Pro — çok yakında' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Studio — çok yakında' })).toBeTruthy();
    const demos = screen.getAllByRole('link', { name: 'Etkileşimli demo' });
    expect(demos.length).toBeGreaterThanOrEqual(2);
    for (const link of demos) {
      expect(link.getAttribute('href')).toBe('/demo');
    }
    const galleryLinks = screen.getAllByRole('link', { name: /bu şablonu kullan/i });
    expect(galleryLinks).toHaveLength(3);
    for (const link of galleryLinks) {
      expect(link.getAttribute('href')).toBe('/gallery');
    }
  });

  it('keeps every template tile honest and opens the FAQ on the first item', () => {
    render(<HomePage />);
    expect(screen.getAllByText('Şablon')).toHaveLength(3);
    const items = screen.getAllByTestId('faq-item');
    expect(items[0]?.getAttribute('data-open')).toBe('true');
    for (const item of items.slice(1)) {
      expect(item.getAttribute('data-open')).toBe('false');
    }
  });

  it('leaves community entries as plain text with no placeholder hrefs', () => {
    const { container } = render(<HomePage />);
    expect(screen.getByText('Topluluk Discord').tagName).toBe('SPAN');
    expect(screen.getByText('X (Twitter)').tagName).toBe('SPAN');
    expect(screen.queryByRole('link', { name: 'Topluluk Discord' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'X (Twitter)' })).toBeNull();
    expect(container.querySelector('a[href="https://discord.com"]')).toBeNull();
    expect(container.querySelector('a[href="https://x.com"]')).toBeNull();
  });

  /* Landing minors wave (2026-09-23). Three guards, each mutation-shaped:
     the heading qualifier, the nav anchor set, and the "no dead link
     affordance" invariant for the two community entries. File-text reads for
     the source-level invariants, same idiom as
     dashboard/bots/[id]/page-disabled-guard.test.tsx:12.
     F13 (2026-09-24) kept all three while translating: the qualifier is now
     "(planlı)" and the locked copy is the Turkish one. */
  const pageSource = readFileSync(path.join(process.cwd(), 'app', 'page.tsx'), 'utf8');

  it('qualifies the always-on heading with (planlı), like its own body', () => {
    render(<HomePage />);
    const heading = screen.getByRole('heading', { level: 3, name: /hep açık/i });
    expect(heading.textContent).toMatch(/\(planlı\)/);
    // The bare claim must not survive anywhere as a standalone assertion.
    expect(heading.textContent?.trim()).not.toBe('Hep açık. Hep hatırlar.');
  });

  it('gives every top-nav entry a distinct anchor that exists in the page', () => {
    const navBlock = /const NAV_LINKS = \[([\s\S]*?)\];/.exec(pageSource)?.[1] ?? '';
    const hrefs = [...navBlock.matchAll(/href: '([^']+)'/g)].map((m) => m[1] ?? '');
    // Set AND size (LESSONS §4.3): the duplicate-anchor defect was an entry
    // that existed twice under two labels.
    expect(hrefs).toHaveLength(5);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) {
      expect(href.startsWith('#')).toBe(true);
      // Every target resolves to a real id in the same file.
      expect(pageSource).toContain(`id="${href.slice(1)}"`);
    }
    // The retired label promised a section that never existed.
    expect(navBlock).not.toContain('Architecture');
  });

  it('keeps the community footer entries free of any link affordance', () => {
    const { container } = render(<HomePage />);
    for (const label of ['Topluluk Discord', 'X (Twitter)']) {
      const node = screen.getByText(label);
      expect(node.tagName).toBe('SPAN');
      // No dead-link affordance: not an anchor, not styled as a footer link.
      expect(container.querySelector(`a[href="${label}"]`)).toBeNull();
      expect(node.getAttribute('href')).toBeNull();
      expect(node.className).toBe(styles.footerTag);
      expect(node.className).not.toBe(styles.footerLink);
    }
    // No invented URLs: the page carries no external http(s) anchor at all.
    const externalLinks = [...container.querySelectorAll('a')].filter((a) =>
      (a.getAttribute('href') ?? '').startsWith('http'),
    );
    expect(externalLinks).toHaveLength(0);
  });

  it('keeps the Starter template line intact (templates are live, not planned-off)', () => {
    render(<HomePage />);
    expect(screen.getByText('Planlı: 8 başlangıç şablonunun tümüne tam erişim')).toBeTruthy();
  });

  /* F13 honesty parity: the translation must not have dropped, added, or moved
     a qualifier. The English page carried 14 `(planned)` suffixes and 13
     `Planned:` prefixes; the Turkish page must carry the same counts as
     `(planlı)` / `Planlı:`, and every qualifier must stay attached to its own
     claim — moving one qualifier from claim X to unrelated claim Y must fail. */
  it('keeps every planned qualifier attached to its own claim', () => {
    const normalizedSource = pageSource.replace(/\s+/g, ' ');
    // Claim cores exactly as they read in app/page.tsx (whitespace-normalised).
    // Partials after the &rsquo; entity keep the guard free of HTML escaping.
    const expectedSuffixClaims = [
      'Gece güncellemesi, üye görünümü',
      'Güncellemeler arka planda kurulacak',
      'botun bu sırada çevrimiçi kalacak',
      'Her XP kaydı saklanacak',
      'roller, uyarılar ve bakiyeler olduğu gibi kalacak',
      'Kimse bir şey fark etmeyecek',
      'üyelerin için kesinti olmayacak',
      'Hep açık. Hep hatırlar.',
      'Bu çalışırlık ve veri saklama sözlerinin hiçbiri henüz yayında değil',
      'başlatmalar ve güncellemeler kimse fark etmeden olacak',
      've rolleri her yeniden başlatmadan sonra yaşayacak',
      'Güncellemeler arka planda olacak, kesinti olmayacak',
    ];
    const expectedPrefixClaims = [
      'ödeme yapmayı bıraksan bile 12 aylık veri saklanır',
      '1 aktif canlı Discord botu',
      '1 bağlı Discord sunucusu',
      '100 AI kredisi - kurulumlar ve akıllı yanıtlar',
      '8 başlangıç şablonunun tümüne tam erişim',
      '2 aktif canlı Discord botu',
      'en fazla 5 bağlı Discord sunucusu',
      '2.000 AI kredisi (~1.800 kurulum)',
      'XP, roller ve ayarlar her yeniden başlatmadan sonra yaşar',
      'sen kurarken çevrimiçi kalır - düzenleme botu düşürmez',
      '8 aktif canlı Discord botu',
      'en fazla 100 bağlı Discord sunucusu',
      'ayda 6.000 AI kredisi',
    ];
    // Size: no dropped or added qualifier (12 distinct suffix texts plus the
    // '/ ay' price pair, which reads twice — Pro and Studio — makes 14).
    expect((pageSource.match(/\(planlı\)/g) ?? []).length).toBe(14);
    expect((pageSource.match(/Planlı:/g) ?? []).length).toBe(expectedPrefixClaims.length);
    expect(expectedPrefixClaims).toHaveLength(13);
    // Set: each expected claim keeps its own qualifier. A move from claim X to
    // unrelated claim Y leaves X unqualified, so the sets stop matching.
    const foundSuffixClaims = expectedSuffixClaims.filter((claim) =>
      normalizedSource.includes(`${claim} (planlı)`),
    );
    expect([...foundSuffixClaims].sort()).toEqual([...expectedSuffixClaims].sort());
    const foundPrefixClaims = expectedPrefixClaims.filter((claim) =>
      normalizedSource.includes(`Planlı: ${claim}`),
    );
    expect([...foundPrefixClaims].sort()).toEqual([...expectedPrefixClaims].sort());
    // Uniqueness: no qualifier is silently double-used on two claims.
    for (const claim of expectedSuffixClaims) {
      expect(normalizedSource.split(`${claim} (planlı)`).length - 1).toBe(1);
    }
    for (const claim of expectedPrefixClaims) {
      expect(normalizedSource.split(`Planlı: ${claim}`).length - 1).toBe(1);
    }
    // The '/ ay' price qualifier belongs to its own price card, once each.
    expect(normalizedSource.split('/ ay (planlı)').length - 1).toBe(2);
    expect(pageSource).toMatch(/\$10[\s\S]{0,200}\/ ay \(planlı\)/);
    expect(pageSource).toMatch(/\$29[\s\S]{0,200}\/ ay \(planlı\)/);
    // The two claim headings that carry a qualifier keep it attached.
    expect(pageSource).toContain('Hep açık. Hep hatırlar. (planlı)');
    expect(pageSource).not.toContain('Hep açık. Hep hatırlar.</h3>');
  });
});

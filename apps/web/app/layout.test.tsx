import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/* Root-layout metadata guard (F14, 2026-09-24). The root layout once shipped
   the scaffold's English showcase title/description with lang="en" plus a
   dev-gated unpkg react-grab <Script>, and nothing pinned any of it — no test
   imported app/layout.tsx, so the stale copy shipped unnoticed. These
   deterministic file-text assertions (no network, no browser) lock the exact
   Turkish title, the exact Turkish description, lang="tr", and the absence of
   the loader, so the same regression fails here instead of shipping silently. */

const layoutSource = readFileSync(path.join(process.cwd(), 'app', 'layout.tsx'), 'utf8');

const LOCKED_TITLE = "title: 'Corvus — Sade Dille Discord Botu Kur'";

const LOCKED_DESCRIPTION =
  'Corvus, Discord toplulukları için kod yazmadan bot kurma aracı: botunu sade bir dille anlat, taslağını gör ve canlıya almadan önce test et. Ücretsiz 3 günlük deneme — kart gerekmez.';

function checkTitle(source: string): void {
  expect(source).toContain(LOCKED_TITLE);
  expect(source).not.toContain('UI primitives showcase');
}

function checkDescription(source: string): void {
  expect(source).toContain(LOCKED_DESCRIPTION);
  expect(source).not.toContain('Mock-data showcase');
}

function checkLang(source: string): void {
  expect(source).toContain('<html lang="tr"');
  expect(source).not.toMatch(/lang="en"/);
}

function checkNoCdn(source: string): void {
  expect(source).not.toContain('unpkg');
  expect(source).not.toContain('react-grab');
}

function checkNoScript(source: string): void {
  expect(source).not.toMatch(/next\/script/);
  expect(source).not.toMatch(/<Script/);
}

describe('root layout metadata guard (app/layout.tsx)', () => {
  it('locks the exact Turkish title and drops the showcase title', () => {
    checkTitle(layoutSource);
  });

  it('locks the exact Turkish description and drops the mock-data description', () => {
    checkDescription(layoutSource);
  });

  it('declares html lang tr and no lang en', () => {
    checkLang(layoutSource);
  });

  it('ships no unpkg or react-grab loader', () => {
    checkNoCdn(layoutSource);
  });

  it('imports no next/script Script loader', () => {
    checkNoScript(layoutSource);
  });

  it('trips when the showcase title is restored — in-memory only', () => {
    const variant = layoutSource.replace(LOCKED_TITLE, "title: 'Corvus — UI primitives showcase'");
    /* Instrument check: the break landed, and the real file is untouched. */
    expect(variant).not.toBe(layoutSource);
    expect(variant).toContain('UI primitives showcase');
    expect(layoutSource).not.toContain('UI primitives showcase');
    /* Failing count: exactly the title check trips; the other four pass. */
    expect(() => checkTitle(variant)).toThrow();
    expect(() => checkDescription(variant)).not.toThrow();
    expect(() => checkLang(variant)).not.toThrow();
    expect(() => checkNoCdn(variant)).not.toThrow();
    expect(() => checkNoScript(variant)).not.toThrow();
  });
});

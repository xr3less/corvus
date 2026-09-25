import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/* Regression guard for the three bot-detail `:disabled` rules in
   page.module.css — `.ghostAction:disabled` (:143-150),
   `.primaryAction:disabled` (:188-195), `.textAction:disabled` (:219-224) —
   plus the enabled `:hover` rules they must not regress. A future edit that
   drops a rule or weakens a declaration fails here instead of shipping a
   pressable-looking disabled control. */

// File-text read (not the CSS-module class map), same idiom as
// dashboard/new/page.test.tsx:1265 and pryzm/page.test.tsx:12.
const cssSource = readFileSync(
  path.join(process.cwd(), 'app', 'dashboard', 'bots', '[id]', 'page.module.css'),
  'utf8',
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Body of the `.cls:disabled, .cls:disabled:hover` rule, or a failed expect. */
function disabledBody(css: string, cls: string): string {
  const pattern = new RegExp(
    `${escapeRegExp(cls)}:disabled\\s*,\\s*${escapeRegExp(cls)}:disabled:hover\\s*\\{([^}]*)\\}`,
  );
  const match = pattern.exec(css);
  expect(match, `missing ${cls}:disabled / ${cls}:disabled:hover rule`).not.toBeNull();
  return match?.[1] ?? '';
}

/** Body of the enabled `.cls:hover` rule, or a failed expect. */
function hoverBody(css: string, cls: string): string {
  const pattern = new RegExp(`${escapeRegExp(cls)}:hover\\s*\\{([^}]*)\\}`);
  const match = pattern.exec(css);
  expect(match, `missing enabled ${cls}:hover rule`).not.toBeNull();
  return match?.[1] ?? '';
}

function checkGhostDisabled(css: string): void {
  const body = disabledBody(css, '.ghostAction');
  expect(body).toMatch(/background:\s*transparent/);
  expect(body).toMatch(/border-color:\s*rgb\(255\s+255\s+255\s*\/\s*0\.15\)/);
  expect(body).toMatch(/opacity:\s*0\.5/);
  expect(body).toMatch(/cursor:\s*not-allowed/);
  expect(body).toMatch(/transform:\s*none/);
}

function checkPrimaryDisabled(css: string): void {
  const body = disabledBody(css, '.primaryAction');
  expect(body).toMatch(/background:\s*#fafafa/i);
  expect(body).toMatch(/border-color:\s*#fafafa/i);
  expect(body).toMatch(/opacity:\s*0\.5/);
  expect(body).toMatch(/cursor:\s*not-allowed/);
  expect(body).toMatch(/transform:\s*none/);
}

function checkTextDisabled(css: string): void {
  const body = disabledBody(css, '.textAction');
  expect(body).toMatch(/color:\s*#a1a1aa/i);
  expect(body).toMatch(/opacity:\s*0\.5/);
  expect(body).toMatch(/cursor:\s*not-allowed/);
}

function checkEnabledHovers(css: string): void {
  expect(hoverBody(css, '.ghostAction')).toMatch(/background:\s*#141417/i);
  expect(hoverBody(css, '.primaryAction')).toMatch(/background:\s*#d4d4d8/i);
  expect(hoverBody(css, '.textAction')).toMatch(/color:\s*#fafafa/i);
}

function checkAll(css: string): void {
  checkGhostDisabled(css);
  checkPrimaryDisabled(css);
  checkTextDisabled(css);
  checkEnabledHovers(css);
}

describe('bot-detail disabled honesty guard (page.module.css)', () => {
  it('keeps all three :disabled rules with :disabled:hover arms and locked declarations', () => {
    checkAll(cssSource);
  });

  it('keeps the enabled :hover rules the disabled arms must not regress', () => {
    checkEnabledHovers(cssSource);
  });

  it('trips when one :disabled block is removed — 1 of 4 checks fails, in-memory only', () => {
    const variant = cssSource.replace(
      /\.primaryAction:disabled,\s*\.primaryAction:disabled:hover\s*\{[^}]*\}/,
      '',
    );
    /* Instrument check: the cut landed, and the real file is untouched. */
    expect(variant).not.toBe(cssSource);
    expect(variant).not.toContain('.primaryAction:disabled');
    expect(cssSource).toContain('.primaryAction:disabled');
    /* Failing count: exactly the primary check trips; the other three pass. */
    expect(() => checkGhostDisabled(variant)).not.toThrow();
    expect(() => checkPrimaryDisabled(variant)).toThrow();
    expect(() => checkTextDisabled(variant)).not.toThrow();
    expect(() => checkEnabledHovers(variant)).not.toThrow();
    expect(() => checkAll(variant)).toThrow();
  });

  it('trips when one locked declaration is altered — 1 of 4 checks fails, in-memory only', () => {
    const variant = cssSource.replace(
      /(border-color:\s*#fafafa;\s*opacity:\s*0\.5;\s*)cursor:\s*not-allowed/,
      '$1cursor: pointer',
    );
    /* Instrument check: the alteration landed, and the real file is untouched. */
    expect(variant).not.toBe(cssSource);
    /* Instrument check: exactly one `cursor: pointer` was added (the enabled
       rules already use it), and the real file is untouched. */
    const countPointers = (text: string): number => text.match(/cursor:\s*pointer/g)?.length ?? 0;
    expect(countPointers(variant)).toBe(countPointers(cssSource) + 1);
    expect(disabledBody(variant, '.primaryAction')).toContain('cursor: pointer');
    /* Failing count: exactly the primary check trips; the other three pass. */
    expect(() => checkGhostDisabled(variant)).not.toThrow();
    expect(() => checkPrimaryDisabled(variant)).toThrow();
    expect(() => checkTextDisabled(variant)).not.toThrow();
    expect(() => checkEnabledHovers(variant)).not.toThrow();
  });
});

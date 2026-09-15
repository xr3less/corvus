import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { templates } from './v13.js';

// No live DB required: assert the Drizzle definition against SPEC section 4
// (V1-6) and diff it against the shipped SQL text (v13.ts and 0004_v13.sql
// must agree column-for-column).
const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, '..', '..', 'drizzle', '0004_v13.sql'), 'utf8');

describe('gateway db v13 templates (SPEC section 4)', () => {
  it('uses the exact SPEC table name', () => {
    expect(getTableName(templates)).toBe('templates');
  });

  it('defines every SPEC templates column in snake_case', () => {
    const names = Object.values(getTableColumns(templates)).map(
      (c) => (c as { name: string }).name,
    );
    expect([...names].sort()).toEqual(
      [
        'capabilities',
        'category',
        'created_at',
        'forks',
        'id',
        'name',
        'perms_needed',
        'semver',
        'slug',
        'source_spec',
      ].sort(),
    );
    for (const name of names) {
      expect(name).not.toMatch(/[A-Z]/);
    }
  });

  it('marks SPEC-required columns NOT NULL in the schema definition', () => {
    const t = getTableColumns(templates);
    expect(t.id.notNull).toBe(true);
    expect(t.slug.notNull).toBe(true);
    expect(t.name.notNull).toBe(true);
    expect(t.category.notNull).toBe(true);
    expect(t.capabilities.notNull).toBe(true);
    expect(t.sourceSpec.notNull).toBe(true);
    expect(t.semver.notNull).toBe(true);
    expect(t.permsNeeded.notNull).toBe(true);
    expect(t.forks.notNull).toBe(true);
    expect(t.createdAt.notNull).toBe(true);
  });

  it('migration creates the table with UNIQUE(slug) + defaults + category index', () => {
    expect(sql).toContain('"templates"');
    expect(sql).toContain('CONSTRAINT "templates_slug_unique"');
    expect(sql).toContain('UNIQUE("slug")');
    expect(sql).toContain('DEFAULT gen_random_uuid()');
    expect(sql).toContain('DEFAULT now()');
    expect(sql).toContain("DEFAULT '1.0.0'");
    expect(sql).toContain('DEFAULT 0');
    expect(sql).toContain('"templates_category_idx"');
    expect(sql).toContain('ON "templates" ("category")');
  });

  it('migration carries the table only — no row data in SQL', () => {
    expect(sql).not.toMatch(/INSERT INTO/i);
    expect(sql).not.toContain('welcome-wagon');
  });
});

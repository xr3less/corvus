import { describe, expect, it } from 'vitest';
import { TEMPLATE_SEEDS, seedTemplates } from './seed-templates.js';

// Pure unit tests — no DB. Every row of the SPEC-locked 8-template set is
// validated against the seed contract (SPEC section 4 wins on ranges: the
// task brief said behaviors 3-6, the SPEC says 3-5 — the test enforces 3-5;
// all authored rows carry exactly 4, valid under both).
const LOCKED_CATEGORIES = [
  'welcome',
  'moderation',
  'tickets',
  'leveling',
  'reaction-roles',
  'logging',
  'giveaways',
  'economy',
];

const INVITE_VOCAB = ['welcome', 'moderation', 'tickets', 'leveling', 'reaction-roles', 'logging'];

const LOCKED_ROWS = [
  { slug: 'welcome-wagon', name: 'Welcome Wagon', category: 'welcome', capabilities: ['welcome'] },
  {
    slug: 'mod-shield',
    name: 'Mod Shield',
    category: 'moderation',
    capabilities: ['moderation', 'logging'],
  },
  { slug: 'ticket-desk', name: 'Ticket Desk', category: 'tickets', capabilities: ['tickets'] },
  { slug: 'level-lounge', name: 'Level Lounge', category: 'leveling', capabilities: ['leveling'] },
  {
    slug: 'role-reactor',
    name: 'Role Reactor',
    category: 'reaction-roles',
    capabilities: ['reaction-roles'],
  },
  { slug: 'mod-log', name: 'Mod Log', category: 'logging', capabilities: ['logging'] },
  {
    slug: 'giveaway-grove',
    name: 'Giveaway Grove',
    category: 'giveaways',
    capabilities: ['welcome'],
  },
  { slug: 'coin-cellar', name: 'Coin Cellar', category: 'economy', capabilities: ['leveling'] },
];

describe('template seeds (SPEC section 4, locked 8-template set)', () => {
  it('ships exactly the 8 locked rows (slug/name/category/capabilities)', () => {
    expect(TEMPLATE_SEEDS).toHaveLength(8);
    for (const locked of LOCKED_ROWS) {
      const row = TEMPLATE_SEEDS.find((r) => r.slug === locked.slug);
      expect(row).toBeDefined();
      expect(row?.name).toBe(locked.name);
      expect(row?.category).toBe(locked.category);
      expect(row?.capabilities).toEqual(locked.capabilities);
    }
  });

  it('slugs are unique and URL-safe', () => {
    const slugs = TEMPLATE_SEEDS.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('every category is one of the 8 locked names', () => {
    for (const row of TEMPLATE_SEEDS) {
      expect(LOCKED_CATEGORIES).toContain(row.category);
    }
  });

  it('capabilities are a non-empty subset of the 6 invite vocab', () => {
    for (const row of TEMPLATE_SEEDS) {
      expect(row.capabilities.length).toBeGreaterThan(0);
      for (const cap of row.capabilities) {
        expect(INVITE_VOCAB).toContain(cap);
      }
    }
  });

  it('semver is MAJOR.MINOR.PATCH', () => {
    for (const row of TEMPLATE_SEEDS) {
      expect(row.semver).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('perms_needed holds 1-3 well-formed { perm, why } entries', () => {
    for (const row of TEMPLATE_SEEDS) {
      expect(row.permsNeeded.length).toBeGreaterThanOrEqual(1);
      expect(row.permsNeeded.length).toBeLessThanOrEqual(3);
      for (const entry of row.permsNeeded) {
        expect(entry.perm.trim().length).toBeGreaterThan(0);
        expect(entry.why.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('source_spec is a v1 envelope with 3-5 behaviors and a short server_pack', () => {
    for (const row of TEMPLATE_SEEDS) {
      expect(row.sourceSpec.version).toBe(1);
      expect(row.sourceSpec.behaviors.length).toBeGreaterThanOrEqual(3);
      expect(row.sourceSpec.behaviors.length).toBeLessThanOrEqual(5);
      for (const b of row.sourceSpec.behaviors) {
        expect(b.kind.trim().length).toBeGreaterThan(0);
        expect(b.title.trim().length).toBeGreaterThan(0);
        expect(b.detail.trim().length).toBeGreaterThan(0);
      }
      expect(typeof row.sourceSpec.server_pack).toBe('string');
      expect(row.sourceSpec.server_pack.trim().length).toBeGreaterThan(0);
      expect(row.sourceSpec.server_pack.length).toBeLessThanOrEqual(300);
    }
  });

  it('every name trims to 1-32 chars (doubles as default botName)', () => {
    for (const row of TEMPLATE_SEEDS) {
      const name = row.name.trim();
      expect(name.length).toBeGreaterThanOrEqual(1);
      expect(name.length).toBeLessThanOrEqual(32);
    }
  });
});

describe('seedTemplates upsert (fake pool, no DB)', () => {
  it('upserts on slug, refreshes content columns, never touches forks', async () => {
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    let nextInserted = true;
    const fakePool = {
      query: async (text: string, params?: unknown[]) => {
        calls.push({ text, params });
        return { rows: [{ inserted: nextInserted }] };
      },
    };

    const first = await seedTemplates(fakePool);
    expect(first).toEqual({ inserted: 8, updated: 0 });
    expect(calls).toHaveLength(8);

    for (const call of calls) {
      expect(call.text).toContain('ON CONFLICT (slug) DO UPDATE');
      expect(call.text).toContain('EXCLUDED');
      expect(call.text).not.toContain('forks');
      expect(call.params).toHaveLength(7);
    }
    const firstParams = calls[0]?.params;
    expect(firstParams?.[0]).toBe('welcome-wagon');
    expect(typeof firstParams?.[3]).toBe('string');
    expect(typeof firstParams?.[4]).toBe('string');
    expect(typeof firstParams?.[6]).toBe('string');

    nextInserted = false;
    const second = await seedTemplates(fakePool);
    expect(second).toEqual({ inserted: 0, updated: 8 });
    expect(calls).toHaveLength(16);
  });
});

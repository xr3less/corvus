import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Curated bot templates — SPEC section 4 (V1-6), verbatim.
// - One row per gallery template, keyed by human-stable `slug` (the fork
//   route looks rows up by slug; UNIQUE keeps reseed idempotent).
// - `category` is exactly one of the 8 locked names (welcome, moderation,
//   tickets, leveling, reaction-roles, logging, giveaways, economy); the
//   vocab is enforced in seed unit tests + the T-fork seam test, not by a
//   DB CHECK — same philosophy as status enums elsewhere.
// - `capabilities` is a non-empty subset of the invite vocabulary
//   (welcome|moderation|tickets|leveling|reaction-roles|logging).
// - `source_spec` is the `{ version: 1, behaviors: [...], server_pack }`
//   envelope the fork copies verbatim into spec_versions v1.
// - `perms_needed` is <=3 `{ perm, why }` entries, a subset of what
//   CAPABILITY_MAP yields for the row's capabilities (seam-tested).
// - `forks` counts forks transactionally (+1 inside the fork mint); the
//   seed upsert NEVER writes it, so reseed never resets the counter.
// - No `template_reviews` table: verified-purchase reviews ship with the
//   12-template V2 (out of scope here).
export const templates = pgTable(
  'templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    capabilities: jsonb('capabilities').$type<string[]>().notNull().default([]),
    sourceSpec: jsonb('source_spec').$type<unknown>().notNull(),
    semver: text('semver').default('1.0.0').notNull(),
    permsNeeded: jsonb('perms_needed').$type<unknown>().notNull().default([]),
    forks: integer('forks').default(0).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('templates_category_idx').on(t.category)],
);

export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;

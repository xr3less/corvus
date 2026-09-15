import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Append-only audit trail — 06_data_model.md section 2, verbatim.
// - One row per recorded action; the V1-3b publish/rollback routes INSERT a
//   'publish'/'rollback' row inside the same transaction that repoints
//   bots.prod_spec_id. Rows are never updated or deleted.
// - `account_id` / `bot_id` are nullable for system events and carry no FK:
//   06 §2 marks both nullable and draws no `->` reference, so an audit row
//   outlives the account/bot it describes.
// - `actor` is `owner:<id> | ai:<model> | system`; `action` is the verb
//   (`publish`, `rollback`, `grant`, `quarantine`, `invite`, …).
// - `detail` carries the event payload (publish/rollback write
//   `{ version, preflight }`); rollback reads it back via
//   `detail->>'version'`.
// - Index on bot_id serves that reader's per-bot history lookup.
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id'),
    botId: uuid('bot_id'),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    detail: jsonb('detail').$type<unknown>().notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('audit_events_bot_id_idx').on(t.botId)],
);

export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;

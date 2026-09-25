// Site-engine bridge A1: runtime-config row contract (SPEC section 1).
//
// The durable home is bot_runtime_config (drizzle/0012_bot_runtime_config.sql
// plus the botRuntimeConfig catalog block in db/schema.ts — both owned by
// sibling wave A2, never touched here). This module is the TYPE + validation
// leaf the translator and the future handlers share: the closed kind
// vocabulary, the row shape, and a pure row-validation function.
//
// No I/O, no Discord, no secrets, no code execution of any kind.

export const RUNTIME_KINDS = [
  'welcome',
  'moderation',
  'xp',
  'giveaway',
  'connector',
  'status',
  'tickets',
  'reaction-roles',
] as const;

export type RuntimeKind = (typeof RUNTIME_KINDS)[number];

export interface RuntimeConfigRow {
  botId: string;
  /** Null means bot-global default; per-guild rows override it at read time. */
  guildId: string | null;
  kind: RuntimeKind;
  /** Per-kind DATA payload (never code — TRIGGER-SANDBOX-1). */
  params: Record<string, unknown>;
  /** Which published spec_version produced the row. */
  specVersion: number;
}

export function isRuntimeKind(value: unknown): value is RuntimeKind {
  return typeof value === 'string' && (RUNTIME_KINDS as readonly string[]).includes(value);
}

export type RowValidation = { ok: true; value: RuntimeConfigRow } | { ok: false; error: string };

export function validateRuntimeConfigRow(row: unknown): RowValidation {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) {
    return { ok: false, error: 'row must be an object' };
  }
  const record = row as Record<string, unknown>;

  const botId = record['botId'];
  if (typeof botId !== 'string' || botId.length === 0) {
    return { ok: false, error: 'botId must be a non-empty string' };
  }

  const guildId = record['guildId'];
  if (guildId !== null && typeof guildId !== 'string') {
    return { ok: false, error: 'guildId must be a string or null' };
  }

  const kind = record['kind'];
  if (!isRuntimeKind(kind)) {
    return {
      ok: false,
      error: 'kind must be one of welcome|moderation|xp|giveaway|connector|status|tickets|reaction-roles',
    };
  }

  const params = record['params'];
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    return { ok: false, error: 'params must be an object' };
  }

  const specVersion = record['specVersion'];
  if (typeof specVersion !== 'number' || !Number.isInteger(specVersion) || specVersion < 1) {
    return { ok: false, error: 'specVersion must be a positive integer' };
  }

  return {
    ok: true,
    value: {
      botId,
      guildId: guildId === null ? null : guildId,
      kind,
      params: params as Record<string, unknown>,
      specVersion,
    },
  };
}

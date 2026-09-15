// Template gallery read + fork helpers (V1-6, T-fork).
//
// Pure module: no I/O, no database, no framework imports. The fork route
// keeps all SQL; this file owns only shapes and boundary validation.
//
// Design grounding (L-008, researched 2026-09-09 before writing):
// - payloadcms/payload duplicate endpoint (MIT,
//   https://github.com/payloadcms/payload/blob/main/packages/payload/src/collections/endpoints/duplicate.ts):
//   borrowed the duplicate-as-draft shape — a fork copies source content into
//   a NEW draft row (never mutates the template) and returns the new id.
// - Next.js App Router nested dynamic route handlers (MIT docs/examples,
//   https://nextjs.org/docs/app/building-your-application/routing/route-handlers):
//   borrowed the [slug]/fork nested-segment layout for the fork action.
// - payloadcms/payload versions/drafts (MIT,
//   https://payloadcms.com/docs/versions/drafts): borrowed the
//   immutable-revision + pointer shape the fork mints (spec_versions rows are
//   append-only; bots.draft_spec_id points at latest).
import { validateBotName } from '../interview/tree';

export interface PermNeed {
  perm: string;
  why: string;
}

export interface TemplateCard {
  slug: string;
  name: string;
  category: string;
  capabilities: string[];
  perms_needed: PermNeed[];
  forks: number;
  semver: string;
}

export interface TemplateFull extends TemplateCard {
  source_spec: unknown;
}

// Raw row shape behind the list/detail SELECTs (jsonb arrives parsed).
export interface TemplateRow extends TemplateCard {
  source_spec: unknown;
}

const SLUG_RE = /^[a-z0-9-]{1,64}$/;

export type SlugCheck = { ok: true; value: string } | { ok: false };

// Slugs are URL path segments: lowercase alphanumerics and dashes only.
// Callers map failure to 404 (never a distinct "malformed" signal).
export function validateSlug(input: unknown): SlugCheck {
  if (typeof input !== 'string' || !SLUG_RE.test(input)) {
    return { ok: false };
  }
  return { ok: true, value: input };
}

export type ForkName = { ok: true; value: string } | { ok: false; error: string };

// No override (undefined) -> the template's own name, which the seed
// guarantees fits the bot-name limit. Any other value goes through the same
// validateBotName boundary the interview start route uses.
export function buildForkName(templateName: string, override: unknown): ForkName {
  if (override === undefined) {
    return validateBotName(templateName);
  }
  return validateBotName(override);
}

// Card projection: the list route must never leak source_spec.
export function toTemplateCard(row: TemplateRow): TemplateCard {
  return {
    slug: row.slug,
    name: row.name,
    category: row.category,
    capabilities: row.capabilities,
    perms_needed: row.perms_needed,
    forks: row.forks,
    semver: row.semver,
  };
}

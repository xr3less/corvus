# Task Report: expansion-e3a-gallery-copy

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/gallery/page.tsx

## Dependencies Added
None.

## Assumptions Made
- "Cards link to /gallery/[slug]" was implemented as the card title linking to `/gallery/<slug>` (slug URI-encoded). The full card was deliberately not made clickable to keep fork behavior and existing layout untouched. The detail route itself is a separate agent's job — linking to a not-yet-existing route is per-spec acceptable.
- The "Customize with AI" CTA points at the bot detail page `/dashboard/bots/[botId]` (same destination as "Open your bot"), which is the Customize-with-AI entry point per the fork handoff contract (`fork/route.ts:62-66`: the 200 payload's `{ botId, version }` plugs into POST /api/spec/patch as `{ botId, baseVersion, ... }` — "describe the diff"). The bot detail page is where that diff-customize step happens.
- Sub-copy wording chosen: "Fork a template to your bots, then customize it with AI." — fork-then-customize order, no describe-before-fork claim.
- Exact changes (3 minimal edits, fork logic byte-identical):
  1. Header sub-copy `Start from a template — describe the diff, then fork it to your bots.` → `Fork a template to your bots, then customize it with AI.`
  2. Card title `{template.name}` wrapped in `<a href={\`/gallery/${encodeURIComponent(template.id)}\`}>`.
  3. Fork-success block gained third link `Customize with AI` → `/dashboard/bots/${result.botId}` after the existing `Open your bot · Add to Discord` links.

## Open Questions for Orchestrator
None.

## Public Interface Exposed
No new API, no new exports. UI surface changes only on `/gallery`:
- Page sub-copy: fork-first wording.
- Card titles link to `/gallery/[slug]` (route lands separately).
- Fork-success block exposes three CTAs: `Open your bot` → `/dashboard/bots/[botId]`, `Add to Discord` → invite URL (new tab), `Customize with AI` → `/dashboard/bots/[botId]`.

## Known Limitations
- `/gallery/[slug]` does not exist yet (separate agent's scope); the new title links 404 until that route lands.
- "Customize with AI" and "Open your bot" share the same destination today; the bot detail page's spec-patch composer wiring is outside this task's scope.
- Grep-proof check: case-insensitive grep for `describe` in `apps/web/app/gallery/page.tsx` returns zero matches — no describe-before-fork claim remains on the page.
- Verification: root `npm run typecheck` passes zero errors across all workspaces; `eslint` on the file passes zero warnings. Fork behavior untouched (no changes to `forkTemplate`, state, or success/failure handling). No secrets, no new API, no manifest edits, no installs, no git commands run.

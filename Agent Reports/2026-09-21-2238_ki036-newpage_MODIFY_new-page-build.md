# Task Report: ki036-newpage-retry

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/app/dashboard/new/page.tsx
- MODIFIED: apps/web/app/dashboard/new/page.test.tsx

## Dependencies Added
- None (no manifest edits, no installs; existing `BuilderProgress` reused as required).

## Assumptions Made
- Brief stitch rule: all `messages` rows with `role === 'user'`, in render/send order, each trimmed, empties dropped, joined with `'\n'`, then `.slice(0, 2000).trim()`. This mirrors the start-route `1..2000` rule (`apps/web/app/api/builder/start/route.ts:142-144`) so the page never sends a brief the route would 422.
- Build is pure concat of on-screen state: NO model call, NO new network call to build the brief.
- Mint name derivation unchanged: first submit text via existing `mintOnce`/`deriveBotName`; only the deleted `firstBriefRef` first-message-only build path was removed.
- Inline progress reuses `BuilderProgress` exact props (`runId`, default `intervalMs`); no new timers, no client-faked phases (D-104). Rendered inside `<section aria-label="Build progress">` next to the KEPT `?runId=` link.
- Next.js research: read `node_modules/next/dist/docs/01-app/02-guides/client-side-data-fetching/index.md` (client fetching patterns; confirms reuse of the existing polling hook over adding SWR/TanStack for one run-scoped poll) plus repo `apps/web/AGENTS.md` agent-rules block. No Next API used beyond existing client-component patterns, so no deprecation risk.
- OSS patterns applied from SPEC §3 only (Lovable explicit-Build-action, v0 runId-server-owned, SSE-narrates-only, tool-only-actions); not re-derived.
- Pre-existing uncommitted composer changes in the working tree (composerNoRing shell, `sendDisabled`, repro tests) were left intact and built upon, per task instruction to continue from that state.

## Open Questions for Orchestrator
- None. Detail-page twin deliberately untouched (SPEC §8, out of scope).

## Public Interface Exposed
- `POST /api/builder/start` body from `handleBuild`: `{ botId: string, brief: string }` where `brief` is the stitched user thread (1..2000 chars).
- Rendered on `runId !== null`: `<section aria-label="Build progress"><BuilderProgress runId={runId} /><a href="/dashboard?runId={runId}">View build progress</a></section>`.
- Internal `stitchBrief(rows)` + `BRIEF_MAX_CHARS = 2000` (not exported; tested through the page).
- Preserved verbatim: mint-on-first-submit incl. pendingBotId quiet-commit; `Build disabled until botId !== null`; trial 403 copy via `readRefusalMessage`; 401 (`You are logged out. Log in again to start the build.`), 404 (`This bot is not saved yet. Send a message and try again.`), empty (`Describe your bot in a few words before building.`), oversize (`Keep the brief under 2000 characters.`) copies; hero copy; FORBIDDEN-words list (all pre-existing assertions still pass).

## Known Limitations
- The empty-stitch guard (`Describe your bot…`) is defensive and unreachable via UI (composer refuses whitespace; mint rides on the first submit so botId implies a user row). Tests prove the reachable half (whitespace submit is a no-op: no chat/mint/build post, no alert) and pin the guard copy in source so deleting it reddens the suite.
- Over-2000-char clamp (`Keep the brief under 2000 characters.`) is likewise defensive (route enforces the same bound); covered by the clamp logic, not a dedicated UI test, since reaching it requires a >2000-char thread.
- Did NOT touch: `packages/ai/**`, detail page, chat route, manifests. No git restore commands used. Nothing committed.
- Gates (all run from `apps/web`): `npx tsc --noEmit` clean; `npx eslint app/dashboard/new/` clean; `npx prettier --check` on both touched files clean; `npx vitest run app/dashboard/new` 26/26 green; `builder-progress.test.tsx` 8/8 green alongside (34/34 combined).

# Wave 1 pack — conversation persistence + rail list + hook stop

SPEC: `2026-09-25-1806_orchestrator_SPEC_agentic-dashboard.md` (read it first; frozen motor §1 applies).
Research is done — do not launch research agents.

## Objective

Threads survive refresh and navigation and are listable; chat still sends when persistence is down;
the hook gains an honest local stop foundation without new fetch paths.

## Files in scope

You may CREATE (if any target already exists: STOP, report PARTIAL, do not overwrite):

- `apps/gateway/drizzle/0014_conversations.sql`
- `apps/web/app/api/conversations/route.ts`
- `apps/web/app/api/conversations/[id]/route.ts`
- `apps/web/lib/conversations/client.ts` (SOLE OWNER — wave4-hub consumes read-only)

You may MODIFY:

- `apps/web/lib/chat/thread.ts`
- `apps/web/components/ui/use-chat-stream.ts`
- `apps/web/components/ui/dashboard-rail.tsx`

You may NOT touch: SPEC §1 frozen files, `apps/web/app/dashboard/new/page.tsx`, `package.json`/lockfiles
(no new runtime dependencies; declare needs in your report).

## Contracts

- Conversations API (new): `POST /api/conversations` with `botId` or null returns `conversationId`;
  `POST` turns append-only, bounded; `GET` limit 50 ending at last user row; ownership scoped by
  `account_id`, soft-deleted bots excluded.
- Migration additive + nullable, no backfill.
- `botId` persisted BEFORE the verdict effect runs (no stale verdict re-POST on refresh).
- Fail-closed: persistence down → local fallback, chat still sends.

## Acceptance criteria

- [ ] Refresh mid-thread rehydrates up to 50 turns with `botId` intact, no verdict re-POST.
- [ ] Rail lists/opens/deletes conversations; empty state uses only the new strings below.
- [ ] Persistence-down path: message still sends (fallback), honest notice shown.
- [ ] `stop()` in hook halts local polling only; copy never claims the server build stopped.
- [ ] Typecheck + eslint clean; new history-store tests green (open/delete, 50-cap with
      older-history-truncated note, double path no duplicate rows).
- [ ] No frozen string altered (SPEC §3); no new dependency installed.

## New strings (only these; correct Turkish diacritics; no emoji/exclamation)

`Sohbetler`, `Yeni sohbet başlat`, `Eski sohbet yok`, `Sohbeti sil`, `Sohbet aç`,
`Conversation history unavailable — new messages still send.`

## Report

Write to `Agent Reports/<timestamp>_wave1-conv_CREATE_conversation-persistence.md` in the standard schema
(Status / Files Touched / Dependencies Added / Assumptions / Open Questions / Public Interface Exposed /
Known Limitations). Whitelist: you needed only this pack + the SPEC.

## Toolchain + docs notes (2026-09-25 correction, applies to all waves)

- npm workspaces (NOT pnpm): typecheck `npm run typecheck --workspace @corvus/web`, lint
  `npx eslint <touched-files> --max-warnings 0` from the repo root, tests `npx vitest run <files>` in
  `apps/web`. Never create `pnpm-*` files (a stray pair was created and deleted 2026-09-25).
- apps/web/AGENTS.md: before writing App Router / client-component / route-handler code, read the relevant
  guide in `node_modules/next/dist/docs/` — in this monorepo `next` is hoisted to the repo root
  (`C:\Users\xr3less\Desktop\corvus\node_modules\next\dist\docs\`), NOT under `apps/web` — and heed
  deprecation notices.

# Orchestrator SPEC — Agentic Dashboard (Option B, founder-approved 2026-09-25)

Timestamp: `2026-09-25-1806`. Wave packs: `2026-09-25-1806_wave-1-pack_conversation-persistence.md`,
`2026-09-25-1806_wave-2-pack_run-timeline.md`, `2026-09-25-1806_wave-3-pack_checkpoint-resume.md`,
`2026-09-25-1806_wave-4-pack_approval-ribbon-hub.md`.

Approach: additive, fail-closed, no hot-path edits. Proposal 3 is the skeleton
(server-persisted conversations, honest timeline, checkpoint + resume-by-fresh-run, diff + undo)
with grafts from proposals 1 and 2. Research is DONE (workflows `wf_fef4a35c-4f6` understand+research
and `wf_2bd3727b-7f5` design-judge-synthesize). No new research agents.

## 1. Frozen motor (DO NOT TOUCH — all waves)

- `POST /api/builder/verdict` accepts `{botId uuid, turns max 12}`. On `yes` ONLY: `INSERT builder_runs(bot_id)
RETURNING id`, then pg-boss send on `builder` queue `{runId, botId, brief}` with
  `singletonKey=runId, retryLimit=3, retryDelay=30, expireInSeconds=3600, deleteAfterSeconds=604800`.
  Enqueue failure flips the row to `failed` with `detail={error: enqueue_failed}`.
  `no`/`unclear` writes NO row and NO job.
- Gate order (all builder routes): `401 unauthorized` → `403 trial_expired` → `422 botId uuid + turns shape` →
  `404 ownership with deleted_at IS NULL` → `403 trial_budget_exceeded` → `409 no_plan_asked`. Unchanged.
- `apps/web/lib/verdict/bounds.ts` untouched: `TURNS_MAX 12`, `TURN_MAX 2000`, `PLAN_MAX`/`REPLY_MAX`/`THREAD_MAX`
  plus kept-ends `boundedView`.
- Polling: `useBuilderProgress` polls `GET /api/builder?runId` every 2000ms until `live` or `failed`,
  returns `{phase, detail, error}`; phase allowlist `queued generating syncing live failed` (`live`/`failed` terminal).
- Thread shape `ThreadRow {id, role, text, status, reasoning, credits}` unchanged.
- Frozen files (no wave may CREATE-over or MODIFY): `apps/web/app/api/builder/verdict/route.ts`,
  `apps/web/app/api/builder/start/route.ts`, `apps/web/lib/verdict/bounds.ts`,
  `packages/ai/src/persona-prompt.ts`, `package.json` + lockfiles (no new runtime dependencies, all waves).
- Approve path: plan-approval-card `onApprove` calls the page `handleSubmit` with a canned approval word through
  `useChatStream` submit, so mint-once + verdict once-guards apply unchanged. Typed `evet` and paraphrase
  approvals keep position-based auto-start (D-153 — never re-gate this).

## 2. Migration order

`0014_conversations.sql` (Wave 1) then `0015_builder_checkpoint.sql` (Wave 3). Both additive + nullable,
no backfill, no lock on `builder_runs`. Rollback-reuse claim (undo via existing publish rollback pointer swap)
must be verified on disk by Wave 4 BEFORE touching DiffView — only go-live was confirmed present.
0014 and 0015 are adjacent: no new migration may renumber between them; follow-ups touching `builder_runs`
or conversations wait for BOTH to land.

## 3. Copy rules (translation freeze)

Every existing Turkish string stays byte-identical (`VERDICT_HINT`, `PLAN_MISSING_MESSAGE`,
`MINT_FALLBACK_ERROR`, `START_FALLBACK_ERROR`, hero/instruction/rail/refusal strings) and existing English in
shared components stays untouched (`Queued Generating Syncing Live`, `No run started`, `Build failed`,
`Could not reach the builder`, `Unexpected builder phase`, `ATTACHMENTS_UNSUPPORTED`, KI-033 403 sentences).
New strings only, Turkish with correct diacritics for owner surface, English quarantined to diagnostics,
no emoji, no exclamation marks.

- Wave 1: `Sohbetler`, `Yeni sohbet başlat`, `Eski sohbet yok`, `Sohbeti sil`, `Sohbet aç`,
  `Conversation history unavailable — new messages still send.`
- Wave 2: `Kurulum adımları`, `Ayrıntıları göster`, `Ayrıntıları gizle`, `Ayrıntı henüz yok`,
  `Build timeline`, `Step detail`, `Build failed with error`, `Retry check`.
- Wave 3: `Resume build`, `Starting a fresh build from the last checkpoint — the failed run is kept for audit.`,
  `Checkpoint unavailable — starting from the approved brief.`
- Wave 4: `Plan hazır — doğru görünüyor mu?`, `Planı onayla ve kurulumu başlat`,
  `Değişiklik istersen yazman yeterli.`, `Onayın gönderiliyor…`, `Hazır`, `Sohbet yazıyor`,
  `Onay gönderiliyor`, `Kurulum sürüyor`, `Durduruldu`, `Durdur`, `Devam et`,
  `Sunucudaki kurulum devam eder.`, `Compare versions`, `No earlier version to undo to.`,
  `Undo to previous version`, `Undo keeps the current version for re-apply.`
- `globals.css` existing `:root` byte-identical; new additive `--dashboard-*` vars only.

## 4. Coordination (disjoint scopes — parallel-safe)

- `conversations/client.ts` owned ONLY by wave1-conv; wave4-hub consumes it read-only.
- `builder/checkpoints.ts` owned ONLY by wave3-resume; wave2-time + wave4-hub consume read-only.
- `builder/gates.ts` owned ONLY by wave3-resume, DESIGN-FIRST: emit the shared 401/403-trial/403-budget/
  404-ownership gate excerpt in the SPEC-shaped report section, do NOT import it into any route in this wave,
  do NOT re-derive it independently (9-file read cap), do NOT let parallel reviewers rewrite it, and on
  `PARTIAL-or-drift` verdicts accuse the SPEC (`§6 build-then-review here is the SUSPECT`), never the robots.
- wave4-hub consumes `gates.ts` read-only and accepts accuse-the-SPEC verdicts; escalate drift, do not fork the file.
- `page.tsx` integration lands ONCE, in Wave 4 only. No other wave touches it.
- If any CREATE target already exists: STOP and report PARTIAL — do not overwrite.

## 5. Verification (per wave, then merged)

Toolchain is npm workspaces (NOT pnpm — reviewer `2026-09-25-1853_reviewer_wave3a-checkpoint-libs.md` proved
`pnpm --filter` matches nothing here): typecheck via `npm run typecheck --workspace @corvus/web` plus
`npm run typecheck --workspace @corvus/gateway` (root `npm run typecheck` covers all workspaces), eslint via
`npx eslint <touched-files> --max-warnings 0` from the repo root, vitest via `npx vitest run <files>` inside
the owning workspace. Never create `pnpm-*` files.
Per wave: typecheck + eslint on touched files (no new `any` on detail readers, all `isRecord`-guarded) +
vitest on new/touched suites. Orchestrator runs the full gates on the MERGED tree after all waves + reviews,
then the live probe (mint → plan → `evet` paraphrase → verdict POST `{botId, turns}` bounded 12 → poll to
live/failed → kill → resume fresh runId, terminal row immutable) and browser click-through. Nevgen validation
runs on the built surface after merge.

## 6. Build-docs mandate (apps/web/AGENTS.md — all waves touching apps/web)

Before writing any App Router / client-component / route-handler code, read the relevant guide in
`node_modules/next/dist/docs/` and heed deprecation notices. In this monorepo `next` is hoisted to the repo
root (`C:\Users\xr3less\Desktop\corvus\node_modules\next\dist\docs\`), NOT under `apps/web` — resolve from
there. The `CLAUDE.md`/`AGENTS.md` stub block in `apps/web` is re-added by `next dev` (see
`node_modules/next/dist/server/lib/generate-agent-files.js`); removing it from a diff only re-creates an
uncommitted change, so commit it with the wave's work to keep the tree clean.

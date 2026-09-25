# Task Report: reviewer-attachtx-2014

## Status
PASS

M-6 honest-refusal claim verified independently. The composer refuses attachment submits in words with draft and thumbnails preserved, caps are enforced before any blob URL is minted, the hook refuses the same turn as a second site, the wire contract is byte-identical, and the defect-encoding page test now pins the refusal. All gates re-run by the reviewer are green.

## Files Touched
- CREATED: Agent Reports/2026-09-23-2049_reviewer_REVIEW_attachtx.md
- MODIFIED: none
- DELETED: none

## Dependencies Added
None. No install run; no manifest or lockfile edited by this review.

## Assumptions Made
- Correct working directory for all gates is `apps/web` (an initial run from the repo root fails on `@/` alias resolution for all three files — expected, not a defect; all reported numbers are from `apps/web`).
- The full-suite 63/927 figure is taken from the builder's report and NOT re-run by this reviewer (moving tree with concurrent sibling work; attribution adjudicated by code read + zero-linkage grep instead, per the task brief's "assess guard adequacy by code read" direction).
- Provider-level GLM-5.2 text-only claim is accepted on the builder's cited live sources plus the in-repo spot checks below; no independent provider re-proof was performed (explicitly not required by the brief).

## Open Questions for Orchestrator
1. Out-of-scope edit ratified: `apps/web/app/dashboard/bots/[id]/page.test.tsx` was outside the builder's declared write scope, but the one-test edit is justified (see Verification row 5). No escalation needed — recorded here so the scope exception is visible.
2. Tree attribution, for the record: `apps/web/app/api/chat/route.ts` (persona-cost + m-23/m-24 reservation hunks) and `package-lock.json` (testbot entry, mtime 2026-09-20) both show as modified in the working tree, but neither belongs to this task — route validate region diff is empty and the lockfile predates the session by three days. Both are sibling/pre-existing work.
3. Forward path endorsed as stated in the builder report: real transmission needs `packages/ai/src/router.ts` (content-part union) + a per-route vision-capability check + a route attachment field under one writer. No action for this task.

## Public Interface Exposed
None added by this review. Observed (unchanged from builder report, spot-verified):
```ts
// apps/web/components/ui/ai-chat-input.tsx
export const MAX_ATTACHMENT_BYTES: number;              // 5 * 1024 * 1024
export const ATTACHMENT_SEND_UNSUPPORTED: string;
export interface AttachmentSelection {
  accepted: File[];
  notice: { text: string; assertive: boolean } | null;
}
export function selectAttachments(
  chosen: File[],
  stagedCount: number,
  maxAttachments: number,
  maxBytes?: number,
): AttachmentSelection;

// apps/web/components/ui/use-chat-stream.ts
export const ATTACHMENTS_UNSUPPORTED: string;
```

## Known Limitations
- Images still do not reach the model; only the dishonesty is closed. This review verifies the refusal, not a transmission feature.
- Guard sabotage (3/2/3 fails) was verified structurally by code read against the asserting tests, not by re-mutating the tree, per the brief's no-re-mutation rule.
- Live served-path behavior (screenshot, zero `/api/chat` requests) is taken from the builder's report; this review re-proves the same behavior at the unit level (fetch-not-called assertions) but did not re-drive a browser session.
- `page.test.tsx` in the tree carries large concurrent sibling diffs (11 hunks, ~554 changed lines across rollback/draft-save/build-start describes); only the single M-6 hunk below was adjudicated as this task's.

## Verification

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Composer refusal in words, draft + thumbnails preserved, alert/status roles | PASS | `apps/web/components/ui/ai-chat-input.tsx:707-721` — `handleSubmit` returns early on `hasAttachments`, sets `{ text: ATTACHMENT_SEND_UNSUPPORTED, assertive: true }`, never calls `onSubmit`, never clears; `apps/web/components/ui/ai-chat-input.tsx:866-873` — notice renders `role="alert"` when assertive, `role="status"` otherwise; `apps/web/components/ui/ai-chat-input.test.tsx:282-323` — image-only and text+image refusal tests assert `onSubmit` not called, alert text exact, draft value and thumbnail button intact |
| 2 | Caps (5 MB / type / count) enforced before blob URL; per-pick accounting | PASS | `apps/web/components/ui/ai-chat-input.tsx:26` — `MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024`; `apps/web/components/ui/ai-chat-input.tsx:47-96` — `selectAttachments` filters type (`53`), size (`55-56`), count room (`57-59`), builds per-pick reason sentences (`61-74`); `apps/web/components/ui/ai-chat-input.tsx:744` vs `:753-759` — `selectAttachments` call precedes the `URL.createObjectURL` loop, so rejected files never become blobs; `apps/web/components/ui/ai-chat-input.test.tsx:252-280` — boundary pin (at-cap accepted, cap+1 rejected with "over the 5 MB limit") and accounting (type + size drops named in one sentence) |
| 3 | Hook second-site guard, errored row says nothing sent | PASS | `apps/web/components/ui/use-chat-stream.ts:30-31` — `ATTACHMENTS_UNSUPPORTED` wording; `apps/web/components/ui/use-chat-stream.ts:130-157` — `submit()` records user + errored-assistant row pair and returns before any `fetch` (old `if (text === '') return` now `if (text === '' && attachments.length === 0) return`); `apps/web/components/ui/use-chat-stream.test.tsx:160-224` — image-only and text+image tests assert `fetchStub` not called and assistant row `{ status: 'error', error: ATTACHMENTS_UNSUPPORTED }`, plus a no-attachments unaffected test |
| 4 | Attach control relabelled, aria-label + title match | PASS | `apps/web/components/ui/ai-chat-input.tsx:994-995` — `aria-label="Attach image — sending is not connected yet"`, `title="Sending images is not connected yet — you can still stage and preview them"` (both carry "not connected yet"); `apps/web/components/ui/ai-chat-input.test.tsx:358-363` — asserts both attributes contain the marker |
| 5 | Wire contract unchanged (route text-only, router string, POST body identical) | PASS | `apps/web/app/api/chat/route.ts:198-228` — `validateChatBody` still `{ botId, message, history }` with string-only history content; `packages/ai/src/router.ts:23-26` — `ChatMessage.content: string`; token grep for `ATTACH\|attach\|MAX_ATTACH\|selectAttach\|image_url\|ContentPart\|multimodal\|File\b` in route.ts and for attach-family tokens in router.ts: 0 hits both; hook diff shows the only `submit()` change near the fetch path is `attachmentCount: 0` hard-coding — the `JSON.stringify({ botId, message, history })` body line is untouched. Tree shows route.ts hunks, but `git diff` grep over the validate region (`history must\|message must\|botId must`) returns 0 changed lines: those hunks are the sibling's persona-cost/reservation work, not this task's |
| 6 | Page-level test correction: confined, defect-encoding fixed, rule-2 use legitimate | PASS | Old test `'shows the attachment count on the user row only when files are attached'` asserted the defect (rendered "1 attachment(s)" while the body carried nothing). New test `'refuses an attachment submit in words and transmits nothing'` (`apps/web/app/dashboard/bots/[id]/page.test.tsx:295-351`) asserts fetch-call count unchanged, `role="alert"` refusal present, no `Submitted changes` list, draft + thumbnail preserved. Diff hunk is confined to that one test (old assertions removed, ~10 lines; new assertions added, ~20 lines). LESSONS §1 rule 2 ("never fix only the call site… a test that encodes the defect must be corrected") squarely covers this: leaving the old assertion in place would have failed the honest fix. Out-of-scope edit was disclosed by the builder and is ratified here — no escalation |
| 7 | Contract (b) choice credible (text-only transport + out-of-scope interface, no lane capability check) | PASS | Spot-checks confirm both premises: router `content: string` (`packages/ai/src/router.ts:23-26`) means multimodal needs a type change in a forbidden file, and `validateChatBody` has no attachment field (`apps/web/app/api/chat/route.ts:198-228`). With lane 1 text-only per the builder's cited provider sources and no capability check anywhere in the failover path, transmitting anyway would move the silent drop one layer down. Honest refusal is the correct branch; forward path (router union + capability matrix + route field, one writer) endorsed as Open Question 3 |
| 8 | Focused suites green by reviewer runs | PASS | From `apps/web`: `npx vitest run components/ui/ai-chat-input.test.tsx components/ui/use-chat-stream.test.tsx "app/dashboard/bots/[id]/page.test.tsx"` → **3 files / 81 passed**. Per-file: ai-chat-input **19/19** (incl. 7 M-6), use-chat-stream **6/6** (incl. 3 M-6), bots/[id] **56/56** (incl. 1 M-6 refusal) |
| 9 | Typecheck, scoped lint, format | PASS | `npx tsc --noEmit` → exit 0; `npx eslint` on the five files with `--max-warnings 0` → exit 0; `npx prettier --check` on the five files → "All matched files use Prettier code style!" |
| 10 | Guard adequacy by code read (3/2/3 structure) | PASS | Composer `if (hasAttachments)` removal would fail the image-only, text+image, and page-level refusal tests (3). Hook `attachments.length > 0` removal would fail both hook refusal tests (2). Cap inflation would fail the boundary pin, per-pick accounting, and oversized-never-staged tests (3). Each guard has at least one test that fails only if that guard breaks — structurally load-bearing, no prod re-mutation performed |
| 11 | Full-suite numbers honestly attributed; zero linkage to sibling transient | PASS | 63/927 taken as the builder's merged-tree figure, not re-run here (moving tree). Zero-linkage confirmed: grep for `ai-chat-input\|use-chat-stream\|ATTACHMENT\|selectAttachments` under `apps/web/lib/db/` → no matches, so the sibling's `__pgbreak__` pool transient cannot be this task's. Baseline delta 886→927 explained by builder's ~10 added tests plus a sibling's new file (`git diff --diff-filter=A` equivalent: builder created no new source files). No unrelated failure is blamed on this task |
| 12 | No secrets; no manifest/lockfile edits by this task; no commit | PASS | No secrets in diff (refusal strings and caps only). `package-lock.json` tree modification predates the session (mtime 2026-09-20 11:09; testbot workspace entry) — not this task's. `HEAD` still `d9cf8d7` — no commit. No stash/checkout/restore/reset evidence in the builder's report; reviewer ran read-only commands plus test/typecheck/lint/format runners |

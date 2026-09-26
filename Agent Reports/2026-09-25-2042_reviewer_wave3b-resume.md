# Review: reviewer-wave3b-resume (builder resume route + tests)

## Verdict

PASS

## Files Confirmed on Disk

- `apps/web/app/api/builder/resume/route.ts` — 14866 bytes, present.
- `apps/web/app/api/builder/resume/route.test.ts` — 22417 bytes, present.

## 1. Works — machine evidence

- `npm run typecheck --workspace @corvus/web` from repo root: clean, EXIT 0.
- `npx eslint` on both files with `--max-warnings 0` from repo root: clean, EXIT 0.
- `npx vitest run app/api/builder/resume/route.test.ts` inside `apps/web`: 1 file passed, 19 tests passed, EXIT 0.

## 2. Contracts — verified in code + tests, not from reports

- Fresh runId differs from source: INSERT ... RETURNING id, response carries the fresh id with `resumedFrom` pointing at the source. Test asserts inequality.
- Frozen boss args verbatim with the NEW runId (`singletonKey=newRunId, retryLimit=3, retryDelay=30, expireInSeconds=3600, deleteAfterSeconds=604800`); queue name `builder`. Test asserts exact send data + options equality.
- Terminal row byte-identical: no UPDATE against the source anywhere; only the fresh row is ever flipped to failed. Tests snapshot the source before/after and assert zero UPDATEs against it.
- No-checkpoint path falls back to the approved brief with the `Checkpoint unavailable — starting from the approved brief.` notice; empty-after-clamp falls back to 422.
- Double-POST enqueues exactly once (second gets `build_in_progress` 409); active-phase probe covers queued/generating/syncing.
- Gate order 401 → 403 trial → 422 → 404 ownership (`deleted_at IS NULL`) → 403 budget → 409 verified, each gate with a dedicated hermetic test.
- Enqueue failure flips only the fresh row to failed (`{phase:'failed', detail:{error:'enqueue_failed'}}`); source untouched. Both failure shapes tested.

## 3. Freeze — copy intact

- Both resume notices come from `checkpointNotice()` in `checkpoints.ts`, byte-identical; no duplicate literals in route/test to drift.
- `Resume build` lives where Wave 3 owns it, not duplicated here. No frozen SPEC §3 string altered. No emoji/exclamation in user strings.

## 4. Quality

- No `any`; `isRecord` guards on detail readers. No secrets, no new dependencies, no manifest edits. Scope is exactly the one new `resume/` directory — no `page.tsx`, no frozen-file touch.
- Next.js route-handler conventions conformant (`POST(req: Request)`, `NextResponse.json`, injectable pool/session/boss seams mirroring verdict/start).

## Wave-4 handoff

Resume POST is safe to consume read-only. Contract: `POST {runId, brief?}` → `200 {runId(fresh), phase:'queued', resumedFrom, notice, briefChars}`; refusals 401/403/404/409/422/500 with stable machine error codes. Never mutate source rows; fresh `attempt` is display-only.

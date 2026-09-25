# Task Report: F9-docker-copy

## Status
SUCCESS

## Files Touched
- MODIFIED: apps/web/Dockerfile (one COPY line added)

## Dependencies Added
None. No manifest edited, no install run.

## Assumptions Made
- No web research needed — this is a mechanical one-line packaging fix on a known Dockerfile; stated per brief.

## Open Questions for Orchestrator
- None.

## Public Interface Exposed
None. No code change.

## Known Limitations
- Typecheck/lint are unaffected by a Dockerfile line — explicitly NOT claimed as proof. Evidence is the mechanical COPY-list proof plus the unchanged focused proxy suite.

## Fix Detail

Added one line in the builder stage beside the other explicit app COPY lines:

```dockerfile
COPY apps/web/proxy.ts apps/web/proxy.ts
```

Unified diff (only change):

```diff
 COPY apps/web/lib apps/web/lib
+COPY apps/web/proxy.ts apps/web/proxy.ts
 COPY apps/web/public apps/web/public
```

## Mechanical Proof

Parsed the Dockerfile COPY list after the edit:

```
apps/web/proxy.ts      => reaches image: true
apps/web/app           => reaches image: true
apps/web/components    => reaches image: true
apps/web/lib           => reaches image: true
apps/web/public        => reaches image: true
```

`apps/web/proxy.ts` exists on disk (verified by read) and is now named on the builder-stage COPY list in the same spelling style as the neighboring lines, so `next build` inside Docker sees it at the project root and emits the `/_middleware` entry. No image was built or pushed, no deploy, per scope.

## Verification

Focused proxy suite (cwd `apps/web`, matching the reviewer's convention — the suite's `@/` alias only resolves from there; a run from the repo root fails at import, unrelated to this change):

```
npx vitest run proxy.test.ts → Test Files 1 passed (1), Tests 14 passed (14)
```

Nothing else modified (`git diff --stat` covers only `apps/web/Dockerfile`, one insertion).

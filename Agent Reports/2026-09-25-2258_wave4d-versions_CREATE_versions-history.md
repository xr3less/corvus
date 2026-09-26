# Task Report: wave4d-versions

## Status

SUCCESS

## Files Touched

- CREATED: apps/web/app/api/bots/[botId]/versions/route.ts
- CREATED: apps/web/app/api/bots/[botId]/versions/route.test.ts
- CREATED: apps/web/components/ui/version-history.tsx
- CREATED: apps/web/components/ui/version-history.test.tsx

## Dependencies Added

- None.

## Assumptions Made

- Pre-CREATE glob confirmed both targets absent (no overwrite risk); no versions dir or version-history files existed.
- spec_versions columns used: id, bot_id, version, created_at (from gateway/drizzle/0002_v11.sql); bots pointers draft_spec_id/prod_spec_id (from 0001_init.sql). version column used only for ORDER BY DESC (newest first); the response shape exposes id/createdAt/flags only, per spec.
- Ownership gate mirrors the sibling activity route (bots WHERE id + account_id + deleted_at IS NULL; malformed botId and foreign/unknown both 404, never 403).
- Component fetch contract: GET /api/bots/:botId/versions with botId encodeURIComponent'd; failure/!ok/malformed body renders heading-only (fail-closed, no empty-state claim, no crash) — there is no degraded-state sentence in the Wave 4 copy set.
- Fetch is unmocked restore via vi.unstubAllGlobals in afterEach; console.error asserted silent.

## Open Questions for Orchestrator

- None. Undo wiring belongs to a later slice: this task ships the read side only, and the component's onUndo prop is the integration seam.

## Public Interface Exposed

- `GET /api/bots/[botId]/versions` -> `200 { versions: VersionItem[] }`, `VersionItem { id: string; createdAt: string (ISO); isDraft: boolean; isProd: boolean }`. Errors: 401 unauthorized, 404 not found (malformed/foreign/deleted), 500 could not load versions / database not configured.
- Route exports: `GET(req, { params: Promise<{ botId }> })`, `toVersionItems(rows, draftSpecId, prodSpecId)`, `OWNED_BOT_SQL`, `VERSIONS_SQL`, `__setSessionReader/__resetSessionReader/__setPool` (re-exported), types `VersionsSession/SessionReader/BotPointers/VersionRow/VersionItem`.
- `VersionHistory({ botId: string; onUndo: (versionId: string) => void })` + type `VersionHistoryItem`. Renders h2 `Compare versions`; empty (loaded, zero rows) -> `No earlier version to undo to.`; rows -> per-row `Undo to previous version` button calling onUndo(version.id); footnote `Undo keeps the current version for re-apply.`

## Known Limitations

- No card, no ribbon, no page wiring, no DiffView — deliberately untouched per scope.
- No pagination/limit on the versions list (spec_versions per bot is small; sibling limit param not required by the contract).
- No Postgres-backed test section: queries mirror the sibling activity route's ownership-first pattern; hermetic fake-pool tests cover shape, flags, ownership refusal, and read-only pins.

## Verification

- `npm run typecheck --workspace @corvus/web` (repo root) — exit 0.
- `npx eslint "apps/web/app/api/bots/[botId]/versions/route.ts" "apps/web/app/api/bots/[botId]/versions/route.test.ts" "apps/web/components/ui/version-history.tsx" "apps/web/components/ui/version-history.test.tsx" --max-warnings 0` (repo root) — exit 0, no output.
- `npx vitest run "app/api/bots/[botId]/versions/route.test.ts" "components/ui/version-history.test.tsx"` (inside apps/web) — 2 files passed, 12 tests passed, exit 0. NOTE: running the same command from the repo root fails with `document is not defined` because the apps/web vitest config (jsdom) is not picked up — that failure is an invocation error, not a code failure. The wave-4 toolchain note says tests run `npx vitest run <files>` in apps/web; green result above is from apps/web.

## Rollback mechanism reused (read, not re-derived)

- Rollback swap: apps/web/app/api/spec/rollback/route.ts:277-298 (BEGIN:277, guarded UPDATE prod_spec_id:278-282, stale 409:283-285, audit rollback:287-291, COMMIT:298; guards older-only:223-225, published-proof:228-244, preflight read-only:246-264).
- Publish twin: apps/web/app/api/spec/publish/route.ts:514-534 (BEGIN:514, guarded UPDATE bots SET prod_spec_id:515-519, stale 409:520-523, audit publish:524-528, COMMIT:534; preflight Red blocks:494-497 within 481-497).
- Undo MUST reuse the rollback route path/mechanism — this task creates no mutation handler (POST/PUT/PATCH/DELETE all undefined, asserted in test) and all GET queries assert mutation-free.

## Docs guide cited

- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` — Dynamic Route Segments: `params` is a Promise, awaited (`const { botId } = await params`); HTTP-methods reference (GET-only module). No deprecation encountered for this shape.

## Strings (byte-exact, verified in component + tests)

- `Compare versions` / `No earlier version to undo to.` / `Undo to previous version` / `Undo keeps the current version for re-apply.`

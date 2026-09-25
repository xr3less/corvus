# Task Report: F14-layout-guard-test

Timestamp: 2026-09-24-0242 (filename per task text)
Agent id: f14layouttest
Task type: CREATE

## Status

SUCCESS — new guard test created, focused green, tsc/eslint/prettier clean, mutation-proved, layout.tsx byte-identical.

No web research was performed — per task text, none was needed (all assertions are exact bytes read from the in-repo file).

## Files Touched

- CREATED: `apps/web/app/layout.test.tsx` (6 tests, deterministic file-text assertions on `app/layout.tsx`)
- READ: `apps/web/app/layout.tsx` (read-only; md5 `1A4EC864DAC49705620538A491526142`, identical to F14 shipped / reviewer-verified — not modified)

Nothing else. No manifest, no lockfile, no install, no git restore/commit/push, no deploy/migrate/secrets.

## Dependencies Added

None.

## Assumptions Made

1. **Exact-byte matching is the right strictness.** Title and description are locked with `toContain` on the exact strings copied byte-for-byte from `layout.tsx` (em-dash, `ğ/ş/ı/ç/ö/ü/İ` glyphs included), not fuzzy Turkish-character checks — a wording drift must fail, not pass.
2. **`process.cwd()` file-read idiom.** The test reads `app/layout.tsx` via `path.join(process.cwd(), 'app', 'layout.tsx')`, matching the established repo idiom (`app/page.test.tsx:220`, `app/dashboard/bots/[id]/page-disabled-guard.test.tsx:14`). Vitest runs with cwd `apps/web`, so this resolves correctly.
3. **One in-memory mutation test instead of a temp-file round-trip.** The acceptance criterion asked for a temp-copy mutation proof; the durable equivalent is a committed 6th test that restores the showcase title in an in-memory string variant and asserts exactly the title check trips while the other four pass (same pattern as `page-disabled-guard.test.tsx:89`). The one-off temp-copy proof (showcase title + `lang="en"` restored in `%TEMP%`, guard trips on `titleExact/noShowcase/langTr/noLangEn`, temp deleted) was additionally run ad hoc and is recorded under Verification.

## Open Questions for Orchestrator

- **The new file is untracked (`?? apps/web/app/layout.test.tsx`).** Staging/committing is the orchestrator's call per HARD RULES (destructive-action approval). Flagging so it is not lost.
- **Note:** task text allowed MODIFY-in-place "if it already exists" — it did not exist (glob confirmed empty before creation), so this is a pure CREATE; nothing to escalate on that front.

## Public Interface Exposed

No production interface. Test-only exports: five helper check functions (`checkTitle`, `checkDescription`, `checkLang`, `checkNoCdn`, `checkNoScript`) plus the `describe` block `root layout metadata guard (app/layout.tsx)` with 6 tests:
1. exact Turkish title locked, showcase title absent
2. exact Turkish description locked, mock-data description absent
3. `<html lang="tr"` present, `lang="en"` absent
4. no `unpkg`, no `react-grab`
5. no `next/script` import, no `<Script` tag
6. in-memory mutation: showcase title restored → exactly the title check throws, other four pass

## Known Limitations

- **Guards the root layout only.** Does not assert per-route metadata overrides or the E1 English-routes-vs-`lang="tr"` gap (reviewer's escalation) — that needs route-copy work first.
- **File-text, not rendered-DOM, assertions.** The test pins source bytes; a runtime regression that keeps the bytes but changes served output (e.g. a middleware rewrite) would not trip it. The F14 live-server verification remains the complement.
- **Does not cover `metadataBase`/OpenGraph/robots** — same out-of-scope set as F14 Known Limitation #2.

## Verification

| Gate | Command (cwd `apps/web` unless noted) | Result |
|---|---|---|
| Focused test | `npx vitest run app/layout.test.tsx` | **6 passed / 6** |
| Typecheck | `npx tsc --noEmit` | **exit 0**, zero output |
| Lint | `npx eslint app/layout.test.tsx app/layout.tsx --max-warnings 0` | **exit 0** |
| Format | `npx prettier --check app/layout.test.tsx app/layout.tsx` | **exit 0**, "All matched files use Prettier code style" |
| Layout untouched | `Get-FileHash app/layout.tsx MD5` | `1A4EC864…` — identical to reviewer-verified shipped bytes |
| Mutation proof | temp copy in `%TEMP%` with showcase title + `lang="en"` restored, guard checks re-evaluated | **trips** on `titleExact, noShowcase, langTr, noLangEn`; temp dir deleted |

# Task Report: expansion-e5b-errorcard

## Status
SUCCESS

## Files Touched
- CREATED: apps/web/components/ui/error-card.tsx
- CREATED: apps/web/components/ui/error-card.test.tsx
- MODIFIED: apps/web/app/dashboard/bots/[id]/page.tsx

## Dependencies Added
None (no new dependency; orchestrator installs centrally per scope guard).

## Assumptions Made
- Scanner row shape is `{ tone|severity, check, detail, fix }` per `apps/gateway/src/preflight/scanner.ts` (`fix?: string`) and worker envelope (`scannedAt, rows, summary`); page accepts both `severity` (contract) and `tone` (on-disk worker) spellings, `severity` winning, matching `apps/web/lib/spec/preflight.ts` idiom.
- Red = exact `red` only; Yellow = everything else except exact `green` (preserves the previous pass/warn behavior where only `green` passed; malformed/unknown rows stay caution, never pass). Scan counts, summary text, and publish Red-block decisions are untouched — presentation only.
- ErrorCard is intentionally style-prop based (not a CSS module) so it renders inside the dark preflight panel without depending on light-theme design tokens; no new CSS file added.
- Retry affordance on Red cards calls the page's existing `runScan()` (guild-ID validated path); no scan semantics change.
- Yellow fix line renders as a secondary `<br/>` line inside the existing row; Green stays a plain pass row.
- i18n: project has no i18n system observed in touched areas (copy is inline English throughout this page); no new i18n introduced.

## Open Questions for Orchestrator
- None. E6b tail still owns the 3-line invite/scan/token wiring on this same file — my change keeps `runScan`/`runOpen` signatures intact, so the tail should apply cleanly.

## Public Interface Exposed
```ts
// apps/web/components/ui/error-card.tsx
export interface ErrorCardProps {
  title: string;
  whatHappened: string;
  fix?: string | null;
  tone?: 'red' | 'yellow';
  retryLabel?: string;
  onRetry?: () => void;
}
export function ErrorCard(props: ErrorCardProps): JSX.Element;
```
- Red renders `role="alert"`, Yellow renders `role="status"`; fix line renders only when a non-empty string is supplied, prefixed with `What to do next: `; retry button renders only when `onRetry` is supplied (default label `Run scan again`).
- `toScanRow` (page-local, `apps/web/app/dashboard/bots/[id]/page.tsx`) now returns `{ tone: 'red' | 'yellow' | 'green'; text: string; fix: string | null }` and consumes `.fix` (grep-proof: `row.fix` is read in both the ErrorCard branch and the Yellow secondary-line branch).

## Known Limitations
- This slice covers ONLY the card + page wiring. It does NOT cover the rest of wave E5 (dispatcher defer-first, 429 backoff, editReply/followUp conversions) — those are other agents' scopes.
- No break-the-guard proof beyond the fix-presence assertions (fix string renders; in-memory containment probe). No live-Discord verification performed.
- Red cards show the `check: detail` text twice (card title `Needs attention — <check: detail>` + body `whatHappened`) by design so the title matches the publish-block `failing checks: <check>` vocabulary; if the founder finds it redundant, title can drop to `check` alone in the E6b tail.

## Verification (evidence, not claims)
- `tsc --noEmit` (apps/web): exit 0.
- `eslint` on the 3 touched files with `--max-warnings 0`: exit 0.
- `prettier --check` on the 3 touched files: clean.
- `vitest run components/ui/error-card.test.tsx "app/dashboard/bots/[id]/page.test.tsx" "app/dashboard/bots/[id]/page-disabled-guard.test.tsx"`: 3 files, 65 tests, all passed (5 new ErrorCard + 60 existing detail/disabled-guard).
- Grep-proof: `toScanRow` reads `record.fix` via `readFixOf`; page renders `row.fix` in ErrorCard (`fix={row.fix}`) and in the Yellow secondary line (`row.fix !== null` branch). Fix strings are no longer dropped.
- No secrets touched, printed, or transmitted (verified: no env/key/token reads; only scanner check/detail/fix display strings).

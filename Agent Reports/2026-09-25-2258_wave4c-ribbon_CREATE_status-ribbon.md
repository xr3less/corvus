# Task Report: wave4c-ribbon

## Status

SUCCESS

## Files Touched

- CREATED: apps/web/components/ui/build-status-ribbon.tsx
- CREATED: apps/web/components/ui/build-status-ribbon.test.tsx

## Dependencies Added

- none

## Assumptions Made

- Only the non-terminal builder phases `queued`/`generating`/`syncing` count as an active build for the `Kurulum sürüyor` pill; this reuses the allowlist and 2000ms-poll idiom semantics read from `apps/web/components/ui/builder-progress.tsx` (read-only, not modified). `live`, `failed`, `null`, and unknown strings all fall back to `Hazır`.
- Precedence order, per the wave-4 pack contract (one pill only): `stopped` → `approving` → active build phase → `streaming` → idle.
- `Durdur` renders only while a build phase is active and not already stopped; `Devam et` + honest sentence render only while `stopped`.
- Component is intentionally fetch-free: stop/resume are parent responsibilities via `onStop`/`onResume`. No CSS module was added; Tailwind utility classes are used (globals.css untouched).

## Open Questions for Orchestrator

- none

## Public Interface Exposed

- `export interface BuildStatusRibbonProps { phase: string | null; streaming: boolean; approving: boolean; stopped: boolean; onStop: () => void; onResume: () => void; }`
- `export function BuildStatusRibbon(props: BuildStatusRibbonProps): React.JSX.Element` — renders exactly one `role="status"` pill (`Hazır` / `Sohbet yazıyor` / `Onay gönderiliyor` / `Kurulum sürüyor` / `Durduruldu`), an optional `Durdur` button (`onStop`), and, when stopped, the sentence `Sunucudaki kurulum devam eder.` plus a `Devam et` button (`onResume`).

## Known Limitations

- Ribbon only: no plan-approval card, no version history, no `page.tsx` wiring, no DiffView changes.
- Terminal phases (`live`/`failed`) render as `Hazır`; the failed-run Resume surface belongs to a different slice.
- No reduced-motion or theme-token CSS module; styling is utility-class only.

## Verification

- `npm run typecheck --workspace @corvus/web` (repo root) → exit 0.
- `npx eslint apps/web/components/ui/build-status-ribbon.tsx apps/web/components/ui/build-status-ribbon.test.tsx --max-warnings 0` (repo root) → exit 0.
- `npx vitest run components/ui/build-status-ribbon.test.tsx` (inside `apps/web`, where the jsdom environment resolves) → 1 file passed, 7 tests passed. Note: running the same file from the repo root fails with `document is not defined` because the root vitest run uses vitest 3 without the workspace jsdom config; the owning-workspace command is the correct gate.
- Fixed en route (kept, not hidden): replaced a jest-dom `toHaveTextContent` assertion with `textContent` (assertion library absent — no new dependency installed) and removed an unused helper to satisfy `--max-warnings 0`.

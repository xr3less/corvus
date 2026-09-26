# Task Report: wave4b-card

## Status

SUCCESS

## Files Touched

- CREATED: apps/web/components/ui/plan-approval-card.tsx
- CREATED: apps/web/components/ui/plan-approval-card.module.css
- CREATED: apps/web/components/ui/plan-approval-card.test.tsx

## Dependencies Added

- None.

## Assumptions Made

- `approving` is owned by the page-wiring slice (Wave 4 hub): this card is purely presentational and never derives approving state itself (no streaming/verdict reads). The page will pass `approving=true` while its verdict POST is in flight so the button reads `Onayın gönderiliyor…` and is disabled.
- Button label swap (approve text vs. sending text) is the intended loading signal; no spinner was added since no existing module idiom (Card, builder-progress) uses one and the frozen copy has no spinner string.
- CSS `File ignored` under eslint is expected: the repo's eslint config covers TS/TSX only, so the `.module.css` file is verified by idiom-match (same tokens/structure as builder-progress.module.css), not by eslint.

## Open Questions for Orchestrator

- None. Page wiring (handleSubmit wrapper + plan-arrival mounting), ribbon, versions, and DiffView are other slices and were not touched.

## Public Interface Exposed

```tsx
// apps/web/components/ui/plan-approval-card.tsx ('use client')
export interface PlanApprovalCardProps {
  onApprove: () => void;
  approving: boolean;
}
export function PlanApprovalCard({ onApprove, approving }: PlanApprovalCardProps): JSX.Element;
```

- Renders `<section aria-labelledby="plan-approval-title">` with the four frozen strings byte-exact:
  `Plan hazır — doğru görünüyor mu?` / `Planı onayla ve kurulumu başlat` /
  `Değişiklik istersen yazman yeterli.` / `Onayın gönderiliyor…`
- Onayla button calls `onApprove` ONLY — no fetch, no verdict import, no `any`.
- CSS module classes: `.card`, `.title`, `.approve`, `.hint` (scoped, no globals.css touch, no new global vars).

## Known Limitations

- This slice is component-only: no page mounting, no ribbon, no versions route, no DiffView change. The card renders whenever the page mounts it (plan-arrival logic lives in the page-wiring slice).
- Button-label swap is the sole busy signal (no aria-live region added; the page already owns `role="status"` surfaces).

## Verification

- `npm run typecheck --workspace @corvus/web` (repo root) → exit 0, zero errors.
- `npx eslint apps/web/components/ui/plan-approval-card.tsx apps/web/components/ui/plan-approval-card.test.tsx --max-warnings 0` (repo root) → exit 0. (The `.module.css` file passed explicitly returns `File ignored because no matching configuration was supplied` — eslint covers TS/TSX only, so the two code files are the linted set.)
- `npx vitest run components/ui/plan-approval-card.test.tsx` (in `apps/web`) → 1 file passed, 3 tests passed (frozen-copy render, submit-path click → onApprove exactly once, approving=true disabled + `Onayın gönderiliyor…` + no call). Note: must run in `apps/web` (workspace vitest config with jsdom); running from repo root fails with `document is not defined` for ALL component suites, pre-existing and unrelated.
- Sources cited: whitelist reports (wave-4 pack + SPEC §1/§3) were sufficient; page.tsx `handleSubmit(value, attachments)` + `submit(value, attachments)` shape confirmed on disk that a zero-arg `onApprove` wrapper fits. No Next.js docs lookup needed (plain client component, no App Router API used). No web research needed (no version/API dependency).

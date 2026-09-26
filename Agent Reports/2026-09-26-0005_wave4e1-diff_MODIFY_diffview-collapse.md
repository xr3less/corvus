# Task Report: wave4e1-diff

## Status

SUCCESS

## Files Touched

- MODIFIED: apps/web/components/ui/DiffView.tsx

## Dependencies Added

- None.

## Assumptions Made

- "Collapse unchanged kinds" means: entries with kind `unchanged` render collapsed by default via a native `<details>` element (no React state, no JS toggle), showing only the existing `title` in the `<summary>` and revealing existing `before`/`after` content on expand.
- `DiffKind` gains the `'unchanged'` member; `KIND_LABEL` is typed `Record<Exclude<DiffKind, 'unchanged'>, string>` so no new user-facing label string is introduced (unchanged rows show no badge, only the title).
- Unchanged rows render no Accept/Reject buttons (nothing to approve) and no kind badge; they reuse only existing CSS-module classes (`item`, `main`, `title`, `before`, `after`) — no stylesheet edits, no new copy.
- The existing consumer (`apps/web/app/interview/page.tsx` MOCK_CHANGES, only added/removed/changed) keeps compiling unchanged since the union only widened.

## Open Questions for Orchestrator

- None.

## Public Interface Exposed

- `export type DiffKind = 'added' | 'removed' | 'changed' | 'unchanged';` (widened union)
- `DiffChange`, `DiffViewProps`, `DiffView({ changes, onAccept, onReject })` signatures unchanged.
- Unchanged entries: `<li class={item}><details class={main}><summary class={title}>{title}</summary>[before][after]</details></li>` — collapsed by default, no action buttons.
- Added/removed/changed entries: byte-identical JSX to before (badge + title + before/after + Reject/Accept buttons).

## Known Limitations

- This task adds the `unchanged` rendering path only. No producer emits `kind: 'unchanged'` yet, so the collapsed path is currently exercised only by direct props, not by any existing caller.
- No new unit test added (scope was MODIFY one file only, and existing suite has no unchanged case). Existing DiffView suite still passes.

## Verification

- `npm run typecheck --workspace @corvus/web` (repo root) — exit 0, no errors.
- `npx eslint apps/web/components/ui/DiffView.tsx --max-warnings 0` (repo root) — exit 0, no warnings.
- `npx vitest run components/ui/DiffView.test.tsx` (inside `apps/web`) — 1 passed / 1 total. Note: the same suite invoked from the repo root fails with `document is not defined` on the clean tree too (pre-existing cwd/config issue, unrelated to this change); inside `apps/web` it is green both before and after.

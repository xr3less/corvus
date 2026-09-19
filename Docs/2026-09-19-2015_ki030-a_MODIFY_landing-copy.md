# Task Report: ki030-a-landing

## Status

SUCCESS

## Files Touched

- MODIFIED: apps/web/app/page.tsx
- MODIFIED: apps/web/app/page.test.tsx

## Dependencies Added

- None.

## Assumptions Made

- Apostrophe encoding: preserved the file's existing `’` (right single quote) escape convention in FAQ strings (nap line, scan line). Rendered text matches the spec's locked sentences modulo curly-vs-straight quote.
- `pricePer` labels: added `(planned)` to Pro/Studio `/ month` labels (`/ month (planned)`) as extra honesty marking; Starter shows `/ free preview`. No locked string forbids this.
- Templates lock: applied `Templates preview — start free while in preview` to the templates ghost-CTA link text (the dishonest "All templates included" promise); kept the H2 `Start from a template`.
- `Planned: ` prefix applied to every entitlement line carrying a number (trial 4/4, Pro 5/6, Studio 3/6). Non-number support/process lines (priority support, practice-server test, pre-flight checks) left unprefixed per the lock's wording ("entitlement numbers ... each carry").
- Section heading `Starter Trial` renamed to `Starter` (removes the trial-clock promise); test updated to match.
- Disabled CTAs implemented as native `<button type="button" disabled>` with inline `font: inherit; cursor: not-allowed` (no new CSS classes, no stylesheet touched — stylesheet is outside scope).
- Footer: Product column dropped the fake `Security Architecture` link; Resources column relabeled `Learn` with FAQ/Features/How-it-works anchors; added a `Home` (`#top`) link under Company so the column is not left thin. Community/X spans untouched. All footer hrefs resolve to same-page anchors or existing `/privacy`, `/terms` routes.

## Open Questions for Orchestrator

- None blocking. Reviewer should confirm: (1) curly-vs-straight apostrophe in FAQ nap/scan lines is acceptable; (2) locked templates string on the ghost-CTA link (not the H2) matches spec intent; (3) unprefixed non-number Studio lines (practice-server, pre-flight) are acceptable on landing since PUBLISH/INSTALL locks live on detail/gallery pages.

## Public Interface Exposed

- None (copy-only change; no new exports, props, or routes).

## Known Limitations

- Full-tree `npx tsc --noEmit -p apps/web/tsconfig.json` is RED from pre-existing errors in a sibling's scope (`apps/web/app/dashboard/bots/page.tsx`: `MOCK_BOTS`/`BotSource` not found + implicit-any errors, 17 lines total). Zero errors reference `app/page.tsx` or `app/page.test.tsx` (verified via filtered run: no `app/page` matches). Not touched — owned by ki030-c.
- Gates on owned files: `eslint --max-warnings 0` clean; `prettier --check` clean; vitest `app/page.test.tsx` 4/4 green when run from `apps/web` (the package that owns the vitest config). From repo root the same file fails with `document is not defined` (root vitest v3 lacks the web jsdom config) — pre-existing harness layout, not caused by this task.
- Locked strings applied as specified: hero + Starter `Start building free` (href `/dashboard` kept) each followed by `Free while in preview — limits not enforced yet.`; Pro/Studio disabled buttons with no href; `Cancel anytime with a single click` deleted; pricing lede carries `Prices and limits are planned — no checkout yet, nothing is enforced.`; badge + metadata use `free preview`; uniform token sentence + tagline verbatim; uptime block future-tense with `(planned)` markings.

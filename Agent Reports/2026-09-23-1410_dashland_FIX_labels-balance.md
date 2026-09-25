# Task Report: dashland-labels-balance

## Status
SUCCESS

Both assigned fixes are verified on disk and proven by tests. The working tree already contained the label unification and the credits-balance behavior when this task started (landed by prior waves in the same files); I verified each requirement byte-by-byte against the catalog source of truth, ran the full verification set, and made one formatting-only edit so Prettier is clean. No other source change was needed.

## Files Touched
- MODIFIED: apps/web/app/dashboard/page.test.tsx (one Prettier reflow only: collapsed the `waitFor` 0-fallback assertion to one line; zero semantic change)
- CREATED: Agent Reports/2026-09-23-1410_dashland_FIX_labels-balance.md
- READ (not modified): apps/web/app/dashboard/page.tsx, apps/web/app/page.tsx, apps/gateway/src/db/seed-templates.ts

The label/balance/test code itself needed no edit: dashboard `TEMPLATES` already byte-matches the catalog, landing `tTitle` lines already byte-match the catalog, hrefs are intact, the credits card already implements loading-shell / 0-fallback / real-balance, and the test file already pins all of it.

## Dependencies Added
- None. No manifest or lockfile edit, no install run. node_modules present at root and apps/web (checked, not installed).

## Assumptions Made
- **Catalog is the name truth.** Verified against `apps/gateway/src/db/seed-templates.ts` source, not memory: `welcome-wagon` = `Welcome Wagon` (:49), `mod-shield` = `Mod Shield` (:90), `ticket-desk` = `Ticket Desk` (:133). All three are in the locked 8-template set.
- **"No dash after load" applies to the Credits card.** Live bots / On trial / Servers still render `—` on a bot-less read ("nothing to measure") — kept deliberately per the task's "Keep Servers/This-week/Pre-flight empties honest as-is" instruction. The Credits card itself contains no dash in any state: `…` mid-flight, `0 of 0 credits` on resolved-empty/unread, real numbers when the endpoint answers.
- **Sibling-wave lines in the same files are not mine.** The `git diff` on `app/page.tsx` also carries unrelated changes (NAV_LINKS label, a `(planned)` paragraph, footer span classes) from parallel waves sharing these files. I touched none of those lines; my only edit is the one Prettier reflow above.

## Open Questions for Orchestrator
- None blocking. Observation only: two parallel waves currently hold uncommitted edits in the same files (`app/page.tsx`, `app/dashboard/page.tsx`, `app/dashboard/page.test.tsx`) — overlapping write scopes. Merge/integration should confirm no line-level clobber before commit. My change is a single formatting line in the test file, so conflict risk from my side is nil.

## Public Interface Exposed
- No exported signature changed. `DashboardPage` props (`bots?`, `trialExpired?`) unchanged.
- Confirmed behaviors (verified, not newly written):
  - Template cards are `<a href="/gallery/<slug>">` with catalog names `Mod Shield` / `Ticket Desk` / `Welcome Wagon` in both the dashboard strip (`dashboard/page.tsx:21-25`) and the landing strip (`app/page.tsx:543,592,641`).
  - Credits card states: mid-flight `…`; resolved-empty/unread `0 of 0 credits`; endpoint-answered `<remaining> of <allowance> credits` (e.g. `100 of 100 credits`), formatted via `formatCredits` (integers whole, fractions one decimal, non-finite → `No data yet`).
  - Strict parse gate: only finite-number `remaining` + `allowance` pairs are accepted; anything else falls through to the 0 fallback — never a fabricated nonzero.

## Verification Performed
All commands run in `C:\Users\xr3less\Desktop\corvus`.
- **Label byte-match:** `Grep` for `Community Guardian|AI Support Desk|Welcome & Role Picker` across `apps/web` → zero matches. `Grep` for `Mod Shield|Ticket Desk|Welcome Wagon` → dashboard strip (:22-24), landing strip (:543/:592/:641), dashboard test asserts (:386-388).
- **Typecheck** — `npm run typecheck` in `apps/web` (`tsc --noEmit`): clean, exit 0.
- **Lint** — `npx eslint app/dashboard/page.tsx app/dashboard/page.test.tsx app/page.tsx --max-warnings 0`: clean, exit 0.
- **Format** — `npx prettier --check` on the same three files: clean after my one-line reflow (before: one warning in `page.test.tsx`).
- **Dashboard tests** — `npx vitest run app/dashboard/page.test.tsx`: 24 passed / 24.
- **Full web suite** — `npx vitest run` in `apps/web`: 886 passed / 886, 62 of 62 files.
- **Test coverage of the contract:** template-strip test asserts name + href per card plus zero dead buttons; balance tests assert mid-flight `…`, `0 of 0 credits` after settled-unread, no `— of —` string, and the real `100 of 100 credits` when `/api/credits` answers (bot-less account with trial balance shows the balance, not 0).

## Known Limitations
- Did not re-run a live browser pass in this task; the real-path proof (loading sequence, 200s on all three gallery routes, guard-break) already exists in the whitelisted dashfix/reviewer reports and the behavior code is unchanged since.
- Local catalog DB seeding state was not re-checked; slug validity rests on the seed-source verification plus the pinned href assertions, same basis as the prior PASS review.
- No production, box, GHCR, or live-key contact. No secret value read, printed, or transmitted. No git restore/stash/checkout/reset, no commit, no manifest/env edit, no install.

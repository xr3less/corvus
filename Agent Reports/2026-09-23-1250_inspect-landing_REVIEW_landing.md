# Task Report: inspect-landing-3

## Status
ISSUES (minor only — no blocking misrepresentation; see findings table)

## Files Touched
- CREATED: Agent Reports/2026-09-23-1250_inspect-landing_REVIEW_landing.md (this file)
- READ-ONLY sweep, no source files modified. Files read: apps/web/app/page.tsx (full), apps/web/app/landing-islands.tsx (full), apps/web/app/terms/page.tsx (§Plans), apps/web/app/gallery/page.tsx (partial), apps/web/app/dashboard/new/page.tsx (partial), apps/web/lib/trial.ts, apps/web/lib/bots.ts (grep), apps/web/lib/auth/session.ts (grep), apps/web/lib/demo/brain.ts, apps/web/lib/templates/templates.ts, apps/gateway/src/runtime/config.ts, apps/gateway/src/db/seed-templates.ts.

## Dependencies Added
- None.

## Assumptions Made
- Two prior attempts died to platform stalls, so per task instructions this run used static reads + greps only; no tests, typecheck, or lint were executed.
- "8 kinds" ground truth = RUNTIME_KINDS in apps/gateway/src/runtime/config.ts: welcome, moderation, xp, giveaway, connector, status, tickets, reaction-roles.
- Pricing/trial ground truth = apps/web/lib/bots.ts (TRIAL_DEAL, CREDITS_TOTAL=100), apps/web/lib/auth/session.ts (TRIAL_GRANT_CREDITS=100), trial clock ~3 days.

## Findings

| # | Severity | Area | Finding | Evidence |
|---|----------|------|---------|----------|
| 1 | Low | Kind vocabulary drift (landing-adjacent) | The demo brain's template reply lists "welcome, moderation, tickets, leveling, reaction roles, logging, giveaways, economy" — `leveling`, `logging`, `economy` are NOT in RUNTIME_KINDS (which has `xp`, plus `connector`/`status` with no template-facing name). The gateway seed mirrors the drift: `giveaway-grove` row carries `capabilities: ['welcome']` (should read giveaway-ish) and `coin-cellar` carries `capabilities: ['leveling']` (no such kind). The landing page itself never enumerates kinds, so the landing copy is clean — but any user cross-checking demo/seed vocabulary against the 8 kinds will see mismatch. | apps/web/lib/demo/brain.ts:8; apps/gateway/src/db/seed-templates.ts:308,350; apps/gateway/src/runtime/config.ts:11-20 |
| 2 | Low | Trial wording (terms vs landing) | Terms page says trial = "3 days of full Pro access, one bot" while landing/FAQ correctly pair the trial with its caps ("1 bot, 100 AI credits"). "Full Pro access" slightly over-reads against the enforced 1-bot / 100-credit limits. Suggest "3 days of Pro features, limited to one bot and 100 AI credits". | apps/web/app/terms/page.tsx:89-90 vs apps/web/app/page.tsx:220,711 |
| 3 | Low | "Always on" heading | Section heading "Always on. Always remembered." is unqualified; the body correctly marks every persistence/uptime claim "(planned)". The heading alone could read as a live guarantee. Suggest qualifying the heading or adding one "(planned)" line under it. | apps/web/app/page.tsx:398-419 |
| 4 | Info | Footer socials are inert | "Community Discord" and "X (Twitter)" render as non-clickable `<span>` elements, not links. If intentional (no accounts yet), fine; otherwise they look like broken links. | apps/web/app/page.tsx:950-951 |
| 5 | Info | Nav duplicate anchor | "Features" and "Architecture" both point to `#bento`. Harmless but Architecture label promises a section that does not exist. | apps/web/app/page.tsx:31-37 |

## Verified clean (no issue)

- **Trial numbers match code:** "Free 3-day trial — 1 bot, 100 AI credits, no card required" agrees with TRIAL_GRANT_CREDITS=100, CREDITS_TOTAL=100, TRIAL_DEAL string, 3-day clock, 1-bot cap. FAQ "100 credits for 3 days" consistent.
- **Pricing numbers consistent:** Pro $10 / 2 bots / 5 guilds / 2,000 credits (~1,800 builds ≈ 1.1 credits/build per FAQ math: 2000/1.1 ≈ 1818 — checks out). Studio $29 / 8 bots / 100 guilds / 6,000 credits. All priced tiers carry "(planned)" + disabled "coming soon" buttons; pricing lede states "no checkout yet, nothing is enforced". Terms ($10/$29, $5 refill pack planned, 12-month retention) agrees with landing.
- **Template count:** "8 templates" claim matches exactly 8 rows in TEMPLATE_SEEDS; gallery handles empty state honestly ("Templates unavailable — try again").
- **Non-goals not sold:** grep over apps/web/app found no "music", "marketplace", "unlimited", "mobile app / iOS / Android", SLA/guaranteed-uptime claims on the landing route. Uptime-adjacent copy is (planned)-qualified (finding #3 excepted for the heading).
- **CTA targets all exist as routes:** `/demo`, `/api/auth/login`, `/dashboard`, `/gallery`, `/gallery/[slug]`, `/dashboard/new?template=<slug>` (new page reads `?template=` and fetches the existing GET route; malformed slugs never fetch), `/privacy`, `/terms`. No dead CTA.
- **Security/privacy claims:** "never paste a token", "token is encrypted", "bots pause and stay as-is — nothing is deleted" on expiry — consistent with trial-expiry copy in lib/bots.ts and lib/chat/thread.ts ("Your 3-day trial ended — your bots are paused. Nothing is deleted."). "Your data and bot come with you if you leave" matches terms ("take your data with you", account deletion). No secrets touched, printed, or transmitted during this inspection.

## Open Questions for Orchestrator
- Is finding #1 (kind vocabulary drift in demo brain + two seed capability rows) in scope for a landing fix, or should it be routed to the gateway/demo owner as its own task?
- Should footer social spans (#4) stay inert until real accounts exist, or be removed to avoid a dead-end look?

# SPEC: KI-030 honesty pass — strangers see no paid/live promise the product cannot keep

## Status: SPEC (founder-authorized 2026-09-19 evening: `Tamam, bu planın güzel; bu planı uygulayacağız.`)

## Goal

Close KI-030 (`Docs/Teknik_Borc/KI-030_honesty.md`): nothing a stranger sees on `/`, `/dashboard*`,
`/gallery`, `/terms`, `/privacy` promises checkout, trial clocks, cancel flows, real credit balances,
example bots/templates as real, no-custody token handling, or "live on Discord" behavior that is not wired.
Rule of the wave: **empty, not example** — unauthenticated or failed-DB UI renders an honest empty
state, never a fake Pro account with mock numbers.

## Ground truth (inventory, verified by a read-only sweep this session)

- No checkout/billing route exists: `apps/web/app/api/**/route.ts` has no
  `checkout|billing|creem|stripe|polar|subscribe|cancel` route (doc-text mentions only).
- Landing `apps/web/app/page.tsx`: `Start 3-Day Free Trial` (L212-213 hero, L720-722 Starter) →
  `/dashboard`; `Upgrade to Pro` (L769-770) → `/dashboard`; `Select Studio Plan` (L816-818) →
  `/dashboard`; `Cancel anytime with a single click` (L772) with no cancel surface; trial badge
  (L199) + metadata description (L10); unenforced entitlement numbers (L699-717 trial, L742-764 Pro,
  L790-813 Studio); token FAQ (L42) vs privacy truth; bento token line (L277-278); tagline (L873-874);
  nap/credits/scan FAQ lines (L46/L54/L58); uptime block (L356-358/L373-374/L392-400); templates header
  (L481-486); footer resource links (L900-909, same-page anchors masquerading as docs).
  Tests lock copy at `apps/web/app/page.test.tsx:54-64,87-94`.
- Rail `apps/web/components/ui/dashboard-rail.tsx`: unconditional `Pro` pill (:64); visible
  `Credits 82/100 · 18 left` (:83-84) from `CREDITS_USED=82`/`CREDITS_TOTAL=100`
  (`apps/web/lib/bots.ts:74-75`), `(example)` aria-only; Upgrade `Coming soon` disabled (:96-104) is
  honest — KEEP that pattern.
- `apps/web/lib/bots.ts`: `MOCK_BOTS` (:35-39); `TRIAL_DEAL` (:41); `MOCK_SPECS` (:84-114);
  `fetchBots()` (:214-231) never throws — 401/500/network/malformed → mock snapshot.
- Dashboard home `apps/web/app/dashboard/page.tsx`: falls back to `MOCK_BOTS` (:81); stat cards
  (:89-94, :154-167) show `Live 1 / Trial 1 / Servers 6 / Credits left 18` visibly unmarked
  (`(example)` aria-only :110,117,159,170); `TRIAL_DEAL` line (:213); `draft to live` line (:150).
- Bots list `apps/web/app/dashboard/bots/page.tsx`: mock-derived counts (:122,129-130); mock
  member/server lines (:218-222).
- Bot detail `apps/web/app/dashboard/bots/[id]/page.tsx`: `Publish` (:877-884), success note
  `Published v${n}.` (:432), retry note (:450), `Open install link` (:905-914, shared-app invite),
  `What this bot does` from `MOCK_SPECS` (:955, `(example)` aria-only), trial line (:864).
- New-bot page `apps/web/app/dashboard/new/page.tsx`: `then it goes live` (:185).
- Gallery `apps/web/app/gallery/page.tsx`: starts on `MOCK_TEMPLATES` (:20-74), keeps on fetch failure
  (:199-201 silent catch); visible fake forks (:411, `412 forks`; `(example)` aria-only :409);
  `Add to Discord` (:423-430, shared-app invite).
- Terms `apps/web/app/terms/page.tsx`: full billing contract for a nonexistent system (:80-112 —
  trial terms, Pro $10 / Studio $29 via Creem, $5 refill pack, dashboard cancel, Creem refunds).
- Privacy `apps/web/app/privacy/page.tsx`: TRUE token sentence (:101-105, KEEP — the uniform target);
  implies-live processor (:79-81, :117-118).
- `demo/page.tsx:90` (`Scripted preview — the AI builder arrives after signup.`) is the one honest
  public marker — NEVER "fix" it away.
- Parked `pryzm/page.tsx` (404s in prod via KI-034 guard) is OUT of scope — do not touch.

## Shared copy locks (exact — every agent uses these verbatim so pages agree)

- UNIFORM TOKEN SENTENCE (landing FAQ L42, bento L277-278, anywhere implying no custody): `You sign
in with Discord — you never paste a token. When you connect a bot, its token is encrypted before it
is saved, and only the part of our system that runs your bot can unlock it.`
- TAGLINE (`page.tsx:873-874`): `Build a Discord bot with plain words. No code. No token paste — we
store your bot's token encrypted.`
- TRIAL (`apps/web/lib/bots.ts:41 TRIAL_DEAL`): `Free while in preview — limits not enforced yet.`
- PUBLISH (detail page): button label `Save version`; success note `Version N saved. Your bot isn't
live on Discord yet.` (keep the version number interpolation); retry note `press Save version to
retry`; dashboard home L150 `Follow your bot from draft to saved version.`; new page L185
  `Describe it in plain words — we draft it, you test the draft, then you save a version. Going live
on Discord isn't wired yet.`
- INSTALL (detail install link + gallery Add to Discord): append `(shared test app — your own bot
install isn't wired yet)`. Gallery button: `Add to Discord (shared test app)`.
- CTAs (landing): hero + Starter `Start 3-Day Free Trial` → `Start building free` (keep href
  `/dashboard`) + sub-note `Free while in preview — limits not enforced yet.`; Pro
  `Upgrade to Pro` → `Pro — coming soon` rendered DISABLED (no href); Studio `Select Studio Plan` →
  `Studio — coming soon` rendered DISABLED (no href); DELETE `Cancel anytime with a single click`;
  add one honest note under pricing: `Prices and limits are planned — no checkout yet, nothing is
enforced.`; entitlement numbers get a `Planned: ` prefix; badge/metadata `3-day free trial` →
  `free preview`.
- FAQ HONESTY: nap line (L46) → `Limits and sleep aren't enforced yet — your bot stays as-is until we
ship them.`; credits line (L54) gets `Planned: ` prefix + ` (not enforced yet)`; scan line (L58) →
  future tense `Before your bot goes live, Corvus will check your server's roles and permissions…`;
  uptime block → future tense + `(planned)` (stays online / zero downtime / XP survives / 12-month
  retention all marked planned); templates header → `Templates preview — start free while in preview`.
- FOOTER: no link may promise a document/infra page that doesn't exist. Relabel-to-target or remove:
  `Documentation`→`FAQ` (#faq), `Security Whitepaper`→`Features` (#bento), `Discord Gateway` /
  `Pre-Flight Scanner`→`How it works` (#how-it-works) — or drop to three links. Community/X spans stay.
- EMPTY STATES (all dashboard/gallery fallbacks): e.g. `No bots yet — describe your first bot.`
  (+ link to `/dashboard/new`); `Templates unavailable — try again.` on fetch failure. Real rows render
  real numbers only; empty renders `—`/`No data yet`, never mock counts. No `(example)` theater: either
  genuinely-labeled demo content a stranger can't mistake, or nothing.
- LEGAL: terms billing block → `Payments aren't live yet — there is no checkout, no charges, no refill
packs, and no dashboard cancel, because there is nothing to cancel. Below is what we intend to
sell:` + plan names/prices kept with `Planned: ` labels; no `billed through Creem`, no dashboard-cancel
  claim, no Creem-refund claim (or each marked `planned`). Privacy processor lines → `Payments will run
through Creem when billing ships — it isn't live yet.`

## Decomposition (5 agents, disjoint write-scopes — ALL PARALLEL)

| Agent   | Owns (MODIFY only these)                                                                                                                                                                                                                                              | Report                                                |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| ki030-a | `apps/web/app/page.tsx`, `apps/web/app/page.test.tsx`                                                                                                                                                                                                                 | `Docs/2026-09-19-2015_ki030-a_MODIFY_landing-copy.md` |
| ki030-b | `apps/web/components/ui/dashboard-rail.tsx`, `apps/web/components/ui/dashboard-rail.test.tsx`, `apps/web/lib/bots.ts`, `apps/web/app/dashboard/page.tsx`, `apps/web/app/dashboard/page.test.tsx`                                                                      | `Docs/2026-09-19-2015_ki030-b_MODIFY_rail-home.md`    |
| ki030-c | `apps/web/app/dashboard/bots/page.tsx`, `apps/web/app/dashboard/bots/page.test.tsx`, `apps/web/app/dashboard/bots/[id]/page.tsx`, `apps/web/app/dashboard/bots/[id]/page.test.tsx`, `apps/web/app/dashboard/new/page.tsx`, `apps/web/app/dashboard/new/page.test.tsx` | `Docs/2026-09-19-2015_ki030-c_MODIFY_bots-detail.md`  |
| ki030-d | `apps/web/app/gallery/page.tsx`, `apps/web/app/gallery/page.test.tsx`                                                                                                                                                                                                 | `Docs/2026-09-19-2015_ki030-d_MODIFY_gallery.md`      |
| ki030-e | `apps/web/app/terms/page.tsx`, `apps/web/app/terms/page.test.tsx`, `apps/web/app/privacy/page.tsx`, `apps/web/app/privacy/page.test.tsx`                                                                                                                              | `Docs/2026-09-19-2015_ki030-e_MODIFY_legal.md`        |

## Cross-agent contracts (source of truth on mismatch — the SPEC wins, not the sibling)

1. `apps/web/lib/bots.ts` is owned ONLY by ki030-b. ki030-b MUST NOT remove or rename any export
   (`MOCK_*`, `CREDITS_*`, `TRIAL_DEAL`, `fetchBots`, types). Behavior changes only: `fetchBots()`
   failure → `[]` (never mock); `TRIAL_DEAL` → locked string above; credit constants stay exported for
   compat but no page renders them as a real balance. Sibling pages keep compiling untouched.
2. `fetchBots() → []` contract: ki030-b changes the function; ki030-c pages consume the empty array
   with honest empty states (their own files only).
3. Copy locks above are byte-level law. If a locked string doesn't fit a component's grammar, the agent
   STOPS and escalates via `Open Questions` — never improvises a sibling-divergent variant.
4. No agent touches API routes, gateway, packages, infra, `.env*`, box files, `pryzm/*`, `demo/*`,
   `interview/*`, `pick/*`, auth/chat/builder/preflight/templates-API/bots-API routes, manifests
   (`package.json`, lockfiles), or any file outside its row. Need another file changed → escalate.

## Stop rules (all agents)

- No installs, no manifest edits (declare needed deps in report only). No git commands of any kind.
  No network calls. No secrets. Zero strangers-on-URL actions (no sharing, no publishing).
- Max 2 attempts per failing command, then record + move on. Honest PARTIAL beats a silent stretch.
- Tests that assert old copy MUST be updated to the locked strings (that's in-scope test work, not
  scope expansion). Tests asserting behavior outside the row → leave green, don't refactor.
- Gates per agent (minimum, project's real commands from repo root): web typecheck clean
  (`npx tsc --noEmit -p apps/web/tsconfig.json`), `eslint --max-warnings 0` on owned files, `prettier
--check` on owned files, owned vitest files green. The reviewer runs the full suite afterwards.

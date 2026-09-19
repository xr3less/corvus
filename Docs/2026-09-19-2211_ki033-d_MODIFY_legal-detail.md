# Task Report: ki033-d-legal-detail

## Status

SUCCESS (one escalation — see Open Questions #1: the bot-detail expired signal has
no production producer in the app today; that is a pre-existing hole shared with
agent B's dashboard banner, reported not improvised around)

## Files Touched

- MODIFIED: `apps/web/app/terms/page.tsx`
- MODIFIED: `apps/web/app/terms/page.test.tsx`
- MODIFIED: `apps/web/app/dashboard/bots/[id]/page.tsx`
- MODIFIED: `apps/web/app/dashboard/bots/[id]/page.test.tsx`
- MODIFIED: `apps/web/app/dashboard/new/page.tsx`
- MODIFIED: `apps/web/app/dashboard/new/page.test.tsx`
- NOT TOUCHED: `apps/web/app/privacy/page.tsx` (default was NO CHANGE — see below)
- NOT TOUCHED: `apps/web/app/privacy/page.test.tsx`

### Privacy — verified byte-identical, no edit

`privacy/page.tsx:136-139` is unchanged, byte for byte:

```
              <li>
                If your trial ends or a paid plan lapses, your bot naps instead of being deleted. We
                keep your data for 12 months, and everything wakes up the moment you upgrade.
              </li>
```

The Creem not-live lines (`:80`, `:117-118`) are untouched. `page.test.tsx` (5
tests, incl. `expect(text).toContain('Creem')` and
`'Payments will run through Creem when billing ships'`) passes with the page
untouched. No test or copy forced a touch. SPEC ruling 7 holds exactly.

## What changed (copy, byte-level)

### Terms (`page.tsx:89`)

- BEFORE: `<span className={styles.strong}>Planned: Trial:</span> 3 days of full Pro access, one bot, no card required.`
- AFTER: `<span className={styles.strong}>Trial (live):</span> 3 days of full Pro access, one bot, no card required.`

Only the label flipped; the sentence (`3 days of full Pro access, one bot, no
card required.`) is word-for-word intact (line wrap moved one word — rendering
identical). The `:44-46` lead was **left untouched**: `Billing isn't live yet. A
3-day trial with full access and no card is planned.` The first clause is
literally still true (there is no checkout) and the second is what the SPEC's
own ruling requires the trial line to stop saying — the pair now reads
"billing isn't live; the trial is", which is the honest state. No grammar
contradiction, so no minimal fix was needed. The three other `Planned:` labels
(Paid plans, Credits, When a plan lapses) are unchanged. Verified absent:
`billed through Creem`, `Creem`, `cancel from your dashboard` (KI-030 locks).

### Bot detail (`[id]/page.tsx`)

- New prop `trialExpired?: boolean` (default `false`) on `BotDetailInner` and the
  default-export `BotDetailPage`, mirroring `DashboardPage`'s existing
  `trialExpired` prop exactly (same name, same default, same "absent = no
  banner" rule).
- Rendered in the header, **above** the trial deal line:
  `{trialExpired ? <p role="status" className={styles.trialText}>{TRIAL_EXPIRED_MESSAGE}</p> : null}`
- `TRIAL_EXPIRED_MESSAGE` is **imported** from `@/lib/bots` (agent B's export,
  byte-verified equal to the SPEC lock by script, not by eye). Nothing redefined.
- `TRIAL_DEAL` keeps its existing import and render — the (new, B-owned) string
  is consumed, never duplicated.
- **No new fetch.** No new endpoint, no `/api/*` call added. `className` uses
  the page's existing `.trialText` (`.module.css` is outside my write scope, so
  no new class was invented and no CSS file was touched).

### New-bot page (`new/page.tsx`)

- One new pure helper `readRefusalMessage(payload)`; both the mint (`mintOnce`)
  and the build start (`handleBuild`) now read `message` first, then `error`,
  then fall back to the existing honest line.
- Reason: the KI-033 gate answers `403 { error: 'trial_expired', message:
'<locked sentence>' }` (verified live in the tree for `/api/bots`,
  `/api/builder/start`, `/api/interview/start`, `/api/templates/[slug]/fork`).
  The old code read `error` first, so an expired account would have been shown
  the literal string `trial_expired` — a code, not something a person can act
  on. It also silently corrupted the bot-cap refusal: `TRIAL_BOT_LIMIT_MESSAGE`
  is byte-equal to `TRIAL_DEAL`, so the old path printed "Free 3-day trial — 1
  bot, 100 AI credits." as if it were an error message.
- Both composer cost lines (`new/page.tsx:241`, `[id]/page.tsx:789`) untouched,
  byte-identical.

### KI-030 locks — all preserved (verified in the tree, not from memory)

`Save version`; `Version N saved. Your bot isn't live on Discord yet.`; the
install link `Open install link (shared test app — your own bot install isn't
wired yet)`; the honest empty overview fallback (`No description yet — the saved
draft will describe it here.`); the composer cost line. All existing assertions
over these strings still pass.

## Tests

- `terms/page.test.tsx`: replaced the now-vacuous `expect(text).toContain('Planned:')`
  with the real thing — asserts `Trial (live):` and each of the three surviving
  `Planned: …` labels, and asserts `Planned: Trial:` is **absent**.
- `[id]/page.test.tsx`: retired the dead `TRIAL_LINE` constant ("Free while in
  preview — limits not enforced yet."); it now asserts the live `TRIAL_DEAL_LINE`
  and that the retired line is gone. Added a `renderExpiredDetail` helper and
  three cases: locked line on an expired trial (asserted with `toBe` on the full
  string, not `toContain`), the line on a _live_ bot too (ruling 4 — reads stay
  open), and no line when the trial has not ended.
- `new/page.test.tsx`: added two cases — a mint refused by the trial gate shows
  the server's sentence and never the `trial_expired` code; a build start
  refused by the trial gate shows it too and renders no fake progress link.

## Guard proof (LESSONS: a guard is not a guard until you break it and watch it fail)

All three new guards were deliberately broken in one pass and the suite re-run
from a **copy outside the repo** (no git command was run — none is allowed here):

1. Terms label reverted to `Planned: Trial:` → terms test FAILED as intended.
2. `{trialExpired ? …}` block deleted from the detail page → detail test FAILED.
3. `message` preference removed from `readRefusalMessage` → new-page tests FAILED.
   Result: `4 failed | 56 passed`. All three files were then restored from the
   out-of-repo copies and re-verified by script + full re-run: `60 passed`, and the
   restored strings were re-asserted byte-for-byte.

## Gates (all from repo root)

- `npx tsc --noEmit -p apps/web/tsconfig.json` → **exit 0**
- `npx eslint --max-warnings 0` on all six owned files → **exit 0**
- `npx prettier --check` on all six owned files → **clean** (`--write` used once
  on the two test files, owned files only)
- Owned vitest files (`terms`, `[id]`, `new`, plus `privacy` as an untouched
  control) → **4 files, 65 passed, 0 failed**
- Full web suite → **914 passed, 1 failed, 62 skipped**. The 4 failing
  file-collections and the 1 failing test are the **pre-existing, unrelated**
  Windows/vitest-3 `import.meta.url` path failures agent A already documented
  (`apps/gateway/src/launch-blockers.test.ts`, `apps/gateway/src/db/guilds.test.ts`,
  `apps/gateway/src/start.test.ts`, `apps/web/app/pryzm/page.test.tsx`
  — `The URL must be of scheme file` / `ENOENT`). None reference the files I
  own; `pryzm` is explicitly out of scope per SPEC. My change did not add or
  remove any of them (count is identical to agent A's report).

## Dependencies Added

None.

## Assumptions Made

- **The expired signal is a prop, not a fetch.** The acceptance criterion said
  "use whatever trial/loading signal the page already has — do NOT add a fetch;
  thread from existing data". The detail page's existing signals are all
  in-body (`fetchBots`, `/api/spec/draft`, `/api/bots/[id]/activity`) and none
  of them can observe `accounts.trial_ends_at`. The nearest existing pattern is
  the one agent B established in the same wave for the dashboard home: an
  optional `trialExpired?: boolean` prop on the page component with
  `= false` default. I mirrored that exactly rather than inventing a second
  convention (or a second endpoint) for the same fact in the same wave.
- **The expired line renders for any bot status, not only `status === 'trial'`.**
  Ruling 4 keeps reads open and the locked sentence claims the account's bots
  are paused, which is true whatever a single bot's own status says. Guarded by
  a test on a live bot.
- **`TRIAL_DEAL` still renders under the expired line for a trial bot.** Both
  strings are truthful (what the trial was; that it ended). Only the expired
  line is the new one; suppressing the other was not mine to decide.
- **`readRefusalMessage` prefers `message` over `error`.** Both siblings
  (`/api/bots` POST, `/api/builder/start`) write `{ error: <code>, message:
<sentence> }`; a human-facing surface should read the sentence.
- Prettier reflowed two of my test files; that is style only, no string changed.

## Open Questions for Orchestrator

1. **BLOCKING for the "trust artifacts, not production wiring" half of this
   task: nothing in the app supplies `trialExpired` yet — neither to the detail
   page nor (as far as I can see) to the dashboard home that agent B added it
   to.** I searched the whole `apps/web` tree: `DashboardPage`'s only caller is
   `<DashboardPage />` with no props (`app/dashboard/page.tsx:244` forwards to
   `DashboardInner`), there is no `layout.tsx`/`page.tsx` server loader anywhere
   under `app/dashboard/` (the layout is `'use client'` and only wraps children),
   and no page reads `isTrialExpired` — the only production consumers of the
   helper are the API routes. So the prop is a **correct, tested seam with no
   producer** in the browser today. This is the same seam agent B chose, so it
   looks wave-wide rather than local, and the real fix (a server-side loader
   that reads the session and passes the flag, or an endpoint the pages can
   read) is outside my write scope and touches files owned by nobody in this
   wave. **Recommend**: assign one small follow-up (or a 5th agent) to add the
   loader for both pages; until then the honest reading is "the copy flips, the
   banner is wired but dormant" — which is exactly the kind of claim that should
   not be called done silently.
2. **`apps/web/lib/bots.ts` gained a `trialExpired`-shaped helper set while I
   worked** (`mintGate`, `isPaidTier`, `mintRefusal`, `TRIAL_EXPIRED_MESSAGE`,
   `TRIAL_BOT_LIMIT_MESSAGE`) — agent B is mid-flight in that file. I consumed
   `TRIAL_EXPIRED_MESSAGE` and byte-verified it against the SPEC lock; if B
   renames or moves it after this report, my two import sites
   (`[id]/page.tsx`) and the test constants need the same rename. Flagging so the
   integration step checks the contract rather than assuming it.
3. **`[id]/page.test.tsx`'s `TRIAL_LINE` constant was the last reference to the
   retired "not enforced yet" copy in a file I own**; the landing page
   (`app/page.tsx:220`, `:741`) and `app/page.test.tsx:45` still carry it, and
   those are agent C's scope. Not touched here — named so the wave's grep for
   the retired string comes back clean only after C lands.

## Public Interface Exposed

```ts
// apps/web/app/dashboard/bots/[id]/page.tsx
export default function BotDetailPage(props: {
  bots?: MockBot[];
  trialExpired?: boolean;
}): JSX.Element;
// inner component: BotDetailInner({ bots, trialExpired = false })
```

- `trialExpired === true` → the header renders
  `Your 3-day trial ended — your bots are paused. Nothing is deleted.` in a
  `role="status"` paragraph, above the trial deal line.
- `trialExpired` absent or `false` → identical to before this task.
- No other export added, removed, or renamed. `TRIAL_DEAL` re-export unchanged.

`apps/web/app/dashboard/new/page.tsx` exposes no new export; `readRefusalMessage`
is module-private.

## Known Limitations

- **The expired banner observes nothing by itself.** The prop must be supplied
  by a caller that knows the session clock (Open Question #1). On the currently
  shipped call path (`<BotDetailPage />` with no props) the string never
  appears — it is honest copy with no live producer yet, not a working banner.
- No API/route change, no gate, no enforcement — enforcement is agents B/C.
- The new-bot page still lets a person _submit_ a chat turn when the trial is
  expired; the chat refusal surfaces as the honest inline error from the server
  (agent C's route). I added no client-side gate, per the criterion "no new
  gates in the UI beyond honest messaging".
- The bot-cap refusal on the new-bot page now shows `TRIAL_BOT_LIMIT_MESSAGE`
  ("Free 3-day trial — 1 bot, 100 AI credits.") rather than the raw code — the
  sentence is B's lock, but whether the _new-bot_ page is the right surface to
  say it (versus a surface that explains "you already have one bot") is a
  product call I did not make.
- Terms keeps `Last updated 15 September 2026`. Whether the trial-label flip
  warrants a date bump is a product/legal call, not taken here.
- Tests are the proof for this task (jsdom render assertions). No browser E2E
  was run in this environment; the expired string was verified to render via the
  test's full-string `getByText`/`toBe`, not `toContain`.
- `apps/web/app/privacy/*` deliberately untouched; report says so as the scope
  allowed for.

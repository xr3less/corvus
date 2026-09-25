# Expansion SPEC — sold-but-not-runnable gaps → runnable product

**Task ID:** expansion-spec-001 · **Type:** SPEC · **Status:** SUCCESS
**Date:** 2026-09-23 · **Author:** planning sub-agent (Sonnet tier, no production code written)
**Output:** `Agent Reports/2026-09-23-0850_orchestrator_SPEC_expansion.md` (this file)

**Recon inputs (all read):** `b2u0mwuuc.txt` (chat-builder), `recon-chat.txt` (modules + gallery + chat-builder),
`recon-money.txt`, `recon-safety.txt`, `recon-install.txt` — plus live contracts
`Docs/PLAN.md`, `packages/ai/src/builder-prompt.ts`, `packages/ai/src/persona-prompt.ts`,
`apps/gateway/src/runtime/config.ts`.
**Note:** `recon-gallery.txt` does not exist as a standalone file; the complete gallery recon
(area=gallery) is embedded in `recon-chat.txt` and was used from there. No secrets read or printed.

---

## 1. Phased wave list

Wave order is by business value (biggest sold-but-not-runnable gap first). Waves E1–E6 have
**disjoint file scopes** and may run in parallel overnight. Two sequencing constraints only:
**(a)** E2's builder-prompt kind list and E6's capability derivation must match the vocabulary E1 lands —
E2/E6 whitelist E1's report and copy its final list, no guessing;
**(b)** E6b (3-line detail-page wiring) runs sequentially **after** E5, because E5 owns
`apps/web/app/dashboard/bots/[id]/page.tsx`.

Locked contracts applying to ALL waves: SPEC_VERSION stays `1`, behaviors stay `z.unknown()` opaque;
BotEvent union stays closed (GuildMemberAdd/Remove, MessageCreate/Delete/Update, MessageReactionAdd —
ClientReady/InteractionCreate forbidden as BotEvent names); params are DATA only, never code;
no parallel wave touches `package.json`/lockfiles/`.env` (declare deps only);
no git restore-from-HEAD commands; no commits; no production/SSH/Contabo/GHCR/live keys;
secret presence by length/defined-only, never values.

### Wave E1 — Tickets + reaction-roles become runnable (biggest sold-but-not-runnable gap)

**Objective (one sentence):** Forking the ticket-desk and role-reactor templates produces bots whose
headline capabilities actually execute at runtime instead of being silently translator-skipped.

**Rationale (from recon):** tickets and reaction-roles are SOLD everywhere — 8-template marketing copy,
`seed-templates.ts` ticket-desk + role-reactor rows, invite permission rationale, spec explainer
sentences — yet `translator.ts:14-17` deliberately drops both kinds, so a forked bot does nothing for
the capability the user bought. Tickets edges out reaction-roles (full 4-kind cluster: panel/routing/
transcript/sla, zero executable path). `MessageReactionAdd` is already in the closed BotEvent union
with zero consumers — the event path exists, only the handler is missing.

**Locked-contract amendment (flagged, intent-preserving):** the closed `RUNTIME_KINDS` set
(welcome|moderation|xp|giveaway|connector|status) must grow to 8 with `tickets`|`reaction-roles`,
via forward-only migration `0013` + `config.ts` + `schema.ts` catalog update. SPEC_VERSION stays 1
(behaviors remain opaque `z.unknown()` — this is a *runtime* vocabulary change, not a spec change).
The BotEvent union is NOT amended (see reaction-remove decision below). The two-array append protocol
is followed: `FEATURE_MODULES` + `composeBotModules` each gain exactly the same 2 entries (5→7).
If the founder vetoes the amendment, fallback is documented under Open Questions — waves still run.

**File scopes (E1-exclusive):**
- CREATE `apps/gateway/src/runtime/tickets/handler.ts` (+ colocated `tickets.test.ts`) — FeatureModule
  `tickets`: `/ticket open|close|transcript` via the dispatcher (InteractionCreate stays dispatcher-owned),
  thread/channel routing per params, transcript to log channel, sla timers on existing poll idiom.
- CREATE `apps/gateway/src/runtime/reaction-roles/handler.ts` (+ test) — FeatureModule `reaction-roles`:
  subscribes to `MessageReactionAdd` (already-closed event), picker post, add-path role grant, per-group
  limits; removal path is `/role remove` dispatcher command (NO new BotEvent — see below).
- MODIFY `apps/gateway/src/runtime/config.ts` — add `'tickets'`, `'reaction-roles'` to `RUNTIME_KINDS`.
- CREATE `apps/gateway/drizzle/0013_runtime_kinds_tickets.sql` — forward-only, IF-NOT-EXISTS style per the
  journaled runner: drop + re-add the kind CHECK with 8 members (follow `0012` + `migrate.mjs` idiom).
- MODIFY `apps/gateway/src/db/schema.ts` — botRuntimeConfig catalog block ONLY (kind union 6→8).
- MODIFY `apps/gateway/src/runtime/translator.ts` — map ticket-kind aliases (panel/routing/transcript/sla)
  → `tickets` rows, reaction-role aliases → `reaction-roles` rows; still-unknown kinds keep skip-log,
  never throw; token-bearing entries still skipped outright.
- MODIFY `apps/gateway/src/runtime/feature-modules.ts`, `apps/gateway/src/runtime/boot-modules.ts` —
  append-only, one import + one entry per new module each (sequential E1d task inside the wave, after
  handlers land; empty-list-must-compile invariant preserved throughout).

**Reaction-remove decision (technical, decided):** `MessageReactionRemove` is NOT added to the closed
BotEvent union in this wave — removal ships as a dispatcher slash command. Rationale: amending the
event union touches every loader + composition root and widens the locked surface for a v1 nicety;
add-path + command-remove covers the sold flow. Full un-react support is a named follow-up, not this wave.

**OSS basis + citation:** Discord.js guide v14 — reaction collectors & partials
(`discordjs.guide/popular-topics/reactions.md`, `.../partials.md`) against installed
**discord.js 14.27.0** (flag table verified exact-match on disk per recon-install); thread-based ticket
pattern (`discordjs.guide/popular-topics/threads.md`). Proven in-repo example to follow:
`apps/gateway/src/runtime/moderation/index.ts` module shape (own-perms preflight, per-handler
try/catch) + `registry.ts` duplicate-command guard + translator alias-folding idiom.

**Acceptance criteria (runnable, human flow named):**
- [ ] Human flow "ticket-desk live": founder forks ticket-desk on staging, publishes, runs `/ticket open`
  in the trial guild → a thread/channel is created and routed; `/ticket transcript` writes to the log
  channel; `translator-skip` log contains zero ticket lines for this bot.
- [ ] Human flow "role-reactor live": founder reacts to the picker post → role granted within the
  existing poll/cooldown idioms; `/role remove` revokes; group limits enforced.
- [ ] `bot_runtime_config` holds `tickets` + `reaction-roles` rows after publish; still-unknown kinds
  still skip-log (guard test: unknown kind in, skip line out, no throw).
- [ ] Project gates on merged tree: typecheck clean, linter zero warnings, full gateway suite green.

### Wave E2 — Chat-chain coherence (the interview→plan→yes contract actually holds)

**Objective (one sentence):** The chat builder reliably produces the plan-ending ask line the verdict
route hard-gates on, the builder prompt admits only executable behavior kinds, and panel interviews can
start runs like chats can.

**File scopes (E2-exclusive):**
- MODIFY `apps/web/app/api/chat/route.ts` — prepend `system: buildPersonaPrompt({ botName })` to the
  `chatStream` message array. Nothing else changes (history cap 12, gates, metering, SSE contract intact).
  This closes the recon's severest chat finding: the ask line `Can I start?` that verdict 409-gates on is
  currently produced by nothing.
- MODIFY `packages/ai/src/builder-prompt.ts` — enumerate the executable vocabulary: the model must emit
  ONLY the kinds E1 lands (E2 whitelists E1's report and copies the final list verbatim) plus one honest
  line: "anything outside these kinds is dropped at runtime — never emit it." Keep the 4 standing
  one-liners + fenced-JSON contract byte-identical otherwise (they are verbatim-tested).
- CREATE parity test colocated with builder-prompt tests — asserts the prompt text names every
  `RUNTIME_KINDS` member from a literal list (comment points at `config.ts`; list value copied from E1's
  report, never guessed). Break-the-guard proof required: delete one kind from the prompt, watch red.
- MODIFY `apps/web/app/api/interview/answer/route.ts` — on done, after the existing draft-spec insert,
  also INSERT `builder_runs` phase=queued + pg-boss `builder` send **identical** to `builder/start`
  (copy that call block; proven example). Panel interviews thereby join the only two working build paths.

**OSS basis + citation:** No external OSS — this wave is prompt-text + in-repo wiring. Proven examples:
`buildPersonaPrompt` (already locked, zero production callers until this wave),
`builder/start/route.ts:193-211` (pg-boss send block to copy), `verdict/route.ts:422-426` (the 409 gate
this wave makes satisfiable). Live-source reuse: recon-chat lane/failover + metering notes.

**Acceptance criteria:**
- [ ] Human flow "chat builds": new chat → assistant asks ≤3 questions → posts plan ending in the exact
  ask line → user "yes" → verdict `yes` → run enqueues → BuilderProgress reaches `live` (no 409
  `no_plan_asked` on a cooperating thread).
- [ ] Builder outputs over 3 probe briefs contain only listed kinds (parse + kind allowlist assertion).
- [ ] Human flow "panel builds": completing a panel interview enqueues a run visible in BuilderProgress;
  draft-spec write unchanged.
- [ ] Full web + ai suites green; no SSE/ledger contract change (ledger reason/model columns untouched).

### Wave E3 — Gallery truth (fork-first flow, honest copy, remix surface)

**Objective (one sentence):** The gallery tells the truth about its own flow (fork first, customize
after), surfaces the documented describe-the-diff handoff as a product step, and lets a template seed
a chat thread.

**File scopes (E3-exclusive):**
- MODIFY `apps/web/app/gallery/page.tsx` — fix the inverted sub-copy (`describe the diff, then fork` →
  fork-then-customize wording); fork-success block gains the third CTA `Customize with AI` →
  `/dashboard/bots/[botId]` (the handoff `fork/route.ts:62-66` documents); cards link to the new detail
  route. Fork behavior itself untouched.
- CREATE `apps/web/app/gallery/[slug]/page.tsx` (+ test) — template detail view consuming existing
  `GET /api/templates/[slug]`: behavior preview list, capabilities, perms why-lines, fork button.
  No new API.
- MODIFY `apps/web/app/dashboard/new/page.tsx` — template-in-chat: read `?template=<slug>`, fetch the
  template, pre-fill the composer with a template-derived brief starter (static fill like the existing
  chips at :302-305, not a model call). Verdict/min-trial gates untouched.

**OSS basis + citation:** Next.js App Router docs — dynamic routes + `searchParams`
(`nextjs.org/docs/app/building-your-application/routing/dynamic-routes`). Proven in-repo examples:
`fork/route.ts:62-66` handoff contract, `gallery/page.tsx:384-392` fork-success block,
`new/page.tsx:33` static-chip fill idiom.

**Acceptance criteria:**
- [ ] Human flow "remix": gallery card → detail (behaviors previewed, nothing forked yet) → fork →
  `Customize with AI` → bot detail composer prefilled → Save-as-draft posts the documented
  `{ botId, baseVersion, ... }` shape to `/api/spec/patch`.
- [ ] Human flow "template-in-chat": `/dashboard/new?template=ticket-desk` opens with composer seeded
  from the template; thread + verdict flow otherwise unchanged.
- [ ] No page copy claims describe-before-fork anywhere (grep-proof).

### Wave E4 — Money gaps (credits display, refill, ledger-trial-row, sleep/wake)

**Objective (one sentence):** Users see what they've spent, can buy the refill the terms already promise,
the trial grant exists in the ledger, and expired trials sleep (leave Discord) while upgrades wake them.

**File scopes (E4-exclusive):**
- CREATE `apps/web/app/api/credits/route.ts` — session-gated read-only: `{ tier, allowance, spent,
  remaining, warn }` from `MONTHLY_GRANTS[tier]` + the existing `SPENT_CREDITS_SQL` month-to-date SUM +
  active refill grants (see budget change). Never writes.
- MODIFY `apps/web/app/dashboard/page.tsx` — Credits card wired to `/api/credits`; honest empty on
  fetch fail (replaces hardcoded `No data yet`). E4-exclusive on this file.
- CREATE `apps/web/app/api/checkout/refill/route.ts` — test-mode `$5 / 1,000-credit / 90-day` refill
  session, mirroring `checkout/create` guards (session-first, 503 without keys, `request_id` +
  `metadata.accountId` join keys, upstream failures → 502). Pro-only limitation documented in-report.
- MODIFY `packages/ai/src/budget.ts` — exported `refillAllowance(accountId)`: SUM of `credit_ledger`
  `refill` rows within 90 days; `checkBudget` allowance becomes `MONTHLY_GRANTS[tier] + refills`.
  (Closes the recon's deeper finding: today NO ledger row could ever extend the gate.)
- MODIFY `apps/web/app/api/webhooks/creem/route.ts` — refill completion events write the `refill` ledger
  row under the same deterministic `ref_id` + partial-unique exactly-once mechanism; lifecycle/refund
  handling unchanged (dispute-freeze stays an explicit non-goal).
- MODIFY `apps/web/lib/auth/session.ts` — write the `trial_grant` (100 cr) `credit_ledger` row on account
  INSERT only (mirror the `trial_ends_at`-on-INSERT-only idiom at :157-163); ON CONFLICT branch writes
  nothing. E4-exclusive on this file.
- CREATE `apps/gateway/src/sleep/sweeper.ts` (+ test) — pure reconcile function + interval driver:
  live bots with expired trial + trial tier → set `status='sleeping'`; `sleeping` bots whose tier is now
  paid → set `status='live'` (wake pickup — no gateway-notify plumbing needed; boot filter already
  excludes non-live). Wake requires prod spec + real token present, else stays sleeping (honest).
- MODIFY `apps/gateway/src/gateway.ts` — start/stop the reconciler interval; destroy the client on sleep
  transition; never touch `start.ts` (E6 owns it). E4-exclusive on this file.

**OSS basis + citation:** Creem API test-mode docs (checkout session create — same calls `checkout/create`
already uses; no new provider surface) + pg-boss docs NOT needed (interval driver, not a queue — the
existing `TEMPBAN_POLL_MS=60000` in-gateway poll is the proven idiom). Proven in-repo examples:
`checkout/create/route.ts` guard order, webhook `INSERT_GRANT_SQL ... ON CONFLICT (ref_id, reason,
attempt) DO NOTHING` exactly-once idiom, `BOOT_LIVE_BOTS_SQL` live-only filter the sweeper inverts.

**Acceptance criteria:**
- [ ] Human flow "credits visible": dashboard shows `X of Y credits` matching month-to-date ledger SUM;
  warn state at 0.8 surfaces (the computed-but-unread `BUDGET_WARN_RATIO` finally has a consumer).
- [ ] Human flow "refill": test-mode $5 refill purchase → `credit_ledger` refill row → allowance
  increases by 1,000 for 90 days (expiry boundary test included).
- [ ] New trial signup writes exactly one `trial_grant` row; relogin writes none.
- [ ] Human flow "sleep/wake": expired-trial live bot leaves Discord (`sleeping`, client destroyed);
  after tier upgrade the reconciler returns it to `live`. Webhook still never writes `bots`.
- [ ] Full web + gateway suites green; `credit_ledger`/`subscriptions` remain the webhook's write-only
  trail except the two specified writers (refill row, trial_grant row).

### Wave E5 — Safety trust (10062 defer-first, rate-limit posture, panel cleanup)

**Objective (one sentence):** Slash commands stop racing Discord's 3-second interaction window, 429s back
off instead of failing, and preflight Red rows show their fix as an actionable card instead of a dot.

**File scopes (E5-exclusive):**
- MODIFY `apps/gateway/src/runtime/dispatcher.ts` — defer-first: `interaction.deferReply()` before
  `execute`; Discord `RateLimitError`/429 → respect `retry-after` with bounded retry, then honest error
  reply; per-user cooldowns + per-handler isolation preserved. E5-exclusive.
- MODIFY `apps/gateway/src/runtime/connector/index.ts`, `apps/gateway/src/runtime/games/xp.ts`,
  `apps/gateway/src/runtime/moderation/index.ts`, `apps/gateway/src/runtime/games/giveaway.ts` —
  convert post-defer replies to `editReply`/`followUp` (no double-ack). No behavior logic changes.
- CREATE `apps/web/components/ui/error-card.tsx` (+ test) — reusable plain-language card (title,
  what-happened, fix action, retry affordance); first consumer below; answers the research directive
  `Plain-language error cards for all 14 failure modes` for the preflight subset.
- MODIFY `apps/web/app/dashboard/bots/[id]/page.tsx` — `toScanRow` renders the scanner `fix` string
  (currently dropped) inside ErrorCard for Red rows; Yellow rows show fix as secondary line. No scan
  semantics change. E5-exclusive on this file (E6b follows after E5 — see E6).

**OSS basis + citation:** Discord.js guide — slash-command defer/reply lifecycle + handling rate limits
(`discordjs.guide/slash-commands/response-methods.md`: "ACK immediately, work async, PATCH followup" —
the exact pattern `Docs/08_core_pipeline.md:52` already claims and this wave makes true). Installed
**discord.js 14.27.0** (disk-verified). Proven in-repo example: `dispatcher.ts:61-135` replied/deferred
branching (error path already defers — promote to the universal path).

**Acceptance criteria:**
- [ ] Command with >3s artificial handler delay completes with NO 10062 (deferred ack proven in test
  with mocked interaction clock).
- [ ] Simulated 429 with `retry-after` backs off and completes; exhausted retries produce the honest
  error card, never a silent drop.
- [ ] Human flow "fix card": preflight Red row renders `check: detail` + fix action text +
  `Re-run the install link, then re-run the scan`-style affordance; fix strings no longer dropped
  (grep-proof: UI consumes `.fix`).
- [ ] Full gateway + web suites green.

### Wave E6 — Install chain (spec-derived perms, token custody, live-flag writer)

**Objective (one sentence):** Install links and scans derive least-privilege permissions from what the
bot actually does, owners can store a bot token without it ever being displayed, and publishing can
transition a bot to genuinely live with its commands synced.

**File scopes (E6-exclusive; detail page deferred to E6b):**
- MODIFY `apps/web/app/api/invite/route.ts` — accept `?botId`; when present, load the draft spec and
  derive capabilities from behavior kinds through the translator's kind→capability map (new pure helper
  colocated with the route + test); caller-CSV/default path unchanged; Administrator refusal + why-lines
  unchanged. Closes the D-006 contradiction (documented claim vs caller-supplied reality).
- MODIFY `apps/web/app/api/preflight/start/route.ts` — derive capabilities from the bot spec when
  `botId` present (same helper); `expectedCommands` becomes the real manifest count from
  `buildRegistry(FEATURE_MODULES)` instead of `required.length` (fixes the wrong-number defect at :198).
- CREATE `apps/web/app/api/bots/[botId]/token/route.ts` — POST stores `token_cipher` via existing
  `encryptToken` (AAD = bot id); session + ownership gates (404-shape, never 403-leak); GET returns
  presence-only `{ saved: boolean, length: number }`, never the token.
- CREATE `apps/web/app/dashboard/bots/[id]/token/page.tsx` — paste-token panel with panel-only privacy
  copy; shows `saved · N chars`, never the value.
- CREATE `apps/web/app/api/bots/[botId]/go-live/route.ts` — ownership + `detectRedFailing` reuse (Red →
  409, unscanned allowed per locked rule) + token-present + prod-spec-present → `status='live'` +
  audit row + pg-boss `sync-commands` send. First and only non-test writer of `status='live'`.
- MODIFY `apps/gateway/src/deploy-commands.ts` — export `syncGuildCommands()` for worker use; standalone
  CLI behavior byte-identical (header `NEVER imported at boot` replaced by worker-only import rule).
- CREATE `apps/gateway/src/deploy/worker.ts` (+ test) — pg-boss `sync-commands` queue: guild-scoped PUT
  from the registry manifest (guild scope preserved — NO global default commands, per Never-list).
- MODIFY `apps/gateway/src/start.ts` — start the sync-commands worker. E6-exclusive.
- MODIFY `apps/gateway/src/runtime/loaders.ts` — guildCreate → upsert `guild_installs` install record
  (`joined_at` = actual install, not first scan). Composition-root concern, NOT a BotEvent (closed set
  untouched). E6-exclusive.
- **E6b (sequential, after E5 lands):** 3-line `bots/[id]/page.tsx` wiring — `runOpen` fetches invite
  with `botId` (drop no-capabilities call), `runScan` posts `{ botId }` (drop hardcoded `['welcome']`),
  link to the token sub-page. No other edits to that file.

**OSS basis + citation:** Discord.js REST guild-commands PUT
(`discordjs.guide/creating-your-bot/command-deployment.md` — guild-scoped deployment) against installed
**discord.js 14.27.0**; Node `crypto` AES-256-GCM via existing `apps/gateway/src/lib/crypto.ts`
(decrypt side already live at boot — this wave adds the first production encrypt caller). Proven
in-repo examples: `deploy-commands.ts` guild PUT body, `publish/route.ts` red-block read,
`preflight/worker.ts:439-445` upsert idiom.

**Acceptance criteria:**
- [ ] Human flow "honest perms": bot with moderation draft → invite link requests moderation perms
  (not welcome-only); scan checks the derived set; D-006 claim true on disk.
- [ ] Human flow "token custody": owner pastes token → `saved · 64 chars`, value never rendered, never
  logged (token-bytes-never-logged rule extends to web); mint placeholder replaced.
- [ ] Human flow "go-live": Red-free scanned bot with token + prod spec → `status='live'`, guild
  commands appear in Discord, audit row written; Red scan still 409s; unscanned still allowed.
- [ ] Fresh guild install writes `guild_installs` row with true `joined_at` before any scan.
- [ ] Full web + gateway suites green.

---

## 2. Per-wave OSS basis + live source citation (index)

| Wave | OSS reference (maintained, build on it) | In-repo proven example to follow | Version/citation basis |
|---|---|---|---|
| E1 | discord.js guide v14: reactions, partials, threads (`discordjs.guide/popular-topics/`) | `runtime/moderation/index.ts` module shape; `registry.ts` guards; translator alias fold | discord.js **14.27.0** installed, flag table exact-match (recon-install, disk-verified) |
| E2 | None (prompt-text + wiring; do not import a library for this) | `buildPersonaPrompt` lock; `builder/start` pg-boss block; verdict 409 gate | Recon-chat lane/metering notes (on-disk, no web needed) |
| E3 | Next.js App Router docs: dynamic routes + searchParams | fork handoff `fork/route.ts:62-66`; chip-fill `new/page.tsx:302-305` | Next.js version per `apps/web/package.json` (read at build time, never assumed) |
| E4 | Creem API test-mode (same calls as existing); in-gateway poll idiom (`TEMPBAN_POLL_MS`) | `checkout/create` guard order; webhook `ON CONFLICT (ref_id, reason, attempt)` idiom | `CREEM_*` names from `.env.example` (names only); test host constant in-route |
| E5 | discord.js guide: response methods / defer + rate limits | `dispatcher.ts:61-135` existing defer branch | discord.js **14.27.0** (disk-verified) |
| E6 | discord.js guide: guild command deployment; Node crypto (existing wrapper) | `deploy-commands.ts` PUT; `publish` red-block; `crypto.ts` decrypt-live-at-boot | discord.js **14.27.0**; `ENCRYPTION_KEY` shape from `.env.example` (shape only) |

No wave adds a dependency to ship (report-only if one emerges). No web search was performed for this
SPEC — every version above is disk-verified via recon; waves that touch a fact beyond recon's citations
must search the web at build time and cite the source in their report (per the sub-agent template).

---

## 3. Explicit non-goals (Never-list restated + deferred money/safety items)

Never-list (locked product decisions, NOT in any wave): in-server setup flows; full in-Discord building;
unlimited tier; **global default commands** (E6 sync stays guild-scoped — violation would be a spec
breach, reviewer must fail it); node-graph editors; mobile app; fleet-manager UI; music (builder-only,
no music template); marketplace (V2); per-user Discord application creation — **Corvus-owned fleet
apps only**, the shared-app install model stands and E6 improves its honesty, not its ownership;
panel-only privacy (E6 token page displays nothing sensitive); SPEC_VERSION stays 1; BotEvent set stays
closed (E1 reaction-remove ships as slash command, not a new event).

Deferred (real gaps, explicitly NOT this expansion — named so nobody claims them done): nightly
Creem-vs-local reconciler; dispute/refund spend-freeze (refund/dispute stay status-only per E4 scope);
per-route Discord rate-limit *scanning* (deliberate non-goal per `scanner.ts:377-379`); duplicate-gateway-
session / 1000-day-limit detection; intent-toggle portal automation; PKCE + `sweepExpired` scheduling
(small hygiene wave, not expansion); Discord portal redirect click (founder action, PLAN.md); Studio/Scale
checkout sessions (create route stays Pro-only test-mode); full un-react event support (follow-up).

---

## 4. Open Questions for Orchestrator (founder decisions ONLY — non-engineer-meaningful)

1. **RUNTIME_KINDS 6→8 amendment (E1):** tickets + reaction-roles were sold in templates/marketing but
   cannot run without two new runtime kinds (DB CHECK enforces the closed set). Recommend YES — the
   lock's intent (bounded vocabulary, DATA-only params, no new events) is fully preserved; the alternative
   (map tickets into `moderation` rows the parser ignores) re-creates today's silent-drop defect with
   extra steps. Founder says yes/no; default if unreachable: proceed (sold-but-not-runnable is worse).
2. **Reaction-remove v1 scope (E1):** un-reacting does NOT remove the role in v1 (closed event set kept);
   removal is via `/role remove`. Recommend YES (covers the sold flow, keeps locks intact). Full
   `MessageReactionRemove` support becomes a named follow-up.
3. **Refill shape before wiring money (E4):** terms already promise `$5 / 1,000 credits / 90 days`
   (`terms/page.tsx:99`). Recommend building exactly that — but it is a price, so confirm rather than
   assume. If the price changes, E4's route + budget window change with it (one-line each).
4. **Sleep strictness (E4):** expired-trial bots leave Discord on the next reconciler tick (strict), or
   after a grace period (e.g. 24–72h warning window)? Recommend a 24h grace with honest copy ("your bot
   sleeps tomorrow unless you upgrade") — strict risks losing a founder-demo-able activation; grace is
   ~20 lines in the sweeper. Business call, not technical.
5. **Go-live without scan (E6):** locked rule says unscanned installs may publish. E6's go-live inherits
   that (scan required only to *block on Red*, never to *permit*). Recommend KEEP — changing it would
   strand every existing unscanned bot. Flagging only because it is founder-visible leniency.

---

## 5. Build-wave fan-out notes for the orchestrator

- Parallel-safe set: E1, E2, E3, E4, E5, E6 (all CREATE/MODIFY scopes disjoint — verified file-by-file
  above; the only shared-column touch is `bots.status`, written by E4's sweeper and E6's go-live in
  different files with the reconciler (E4) as the single reader/decider at runtime).
- Sequential tail: E6b after E5 (same file, 3 lines).
- Whitelist wiring: E2 and E6 read E1's report for the final kind list (pass the exact filename into
  their prompts); no other cross-reads. E4's sweeper and E6's go-live both read the `BOOT_LIVE_BOTS_SQL`
  contract — already in recon, no report needed.
- Reviewer gate per wave must include: real toolchain detection (never assume npm script names), a
  human-flow run in the running app named in the report (per LESSONS: gates-green ≠ works), and the
  break-the-guard proof for every new guard (parity test, exactly-once index, defer mock-clock).
- Iteration cap 3 per task, then escalate; contract mismatch between waves resolves in favor of this
  SPEC, re-spawn the drifting side.

---

## Report schema compliance

### Status
SUCCESS

### Files Touched
- CREATED: `C:\Users\xr3less\Desktop\corvus\Agent Reports\2026-09-23-0850_orchestrator_SPEC_expansion.md` (this SPEC)
- MODIFIED: none (planning agent; no production code)
- DELETED: none

### Dependencies Added
None (SPEC only; waves declare their own, orchestrator installs centrally).

### Assumptions Made
- `recon-gallery.txt` absent as a file; gallery recon taken from its complete embedded copy in
  `recon-chat.txt` (area=gallery, len=10474 block).
- `RUNTIME_KINDS` closed-set is an engineering contract amendable via migration + founder nod (OQ-1),
  not an immutable product lock — because the task orders tickets/reaction-roles runnable and the DB
  CHECK makes any other path a silent-drop repeat. SPEC_VERSION=1 and the BotEvent union are treated as
  truly immutable.
- `apps/web/lib/auth/session.ts` (E4), `apps/gateway/src/gateway.ts` (E4), `start.ts` (E6),
  `dashboard/page.tsx` (E4), `bots/[id]/page.tsx` (E5, then E6b), `budget.ts` (E4), `builder-prompt.ts`
  (E2), `chat/route.ts` (E2), `translator.ts` + `config.ts` + `schema.ts` + `feature/boot-modules.ts`
  (E1), `dispatcher.ts` + 4 handler files (E5), `invite` + `preflight/start` + `deploy-commands.ts` +
  `loaders.ts` (E6) — each owned by exactly one parallel wave; verified against recon file lists, but
  the orchestrator should re-verify at spawn time (recon is a snapshot, the tree moves).
- No wave needs a new third-party dependency; if one emerges at build time it is report-declared only.

### Open Questions for Orchestrator
Section 4 above (5 founder decisions). No technical questions escalated — all engineering choices
(kind-extension mechanism, defer-first, reconciler-over-notify, guild-scoped sync, add-only reaction
roles) decided in-SPEC with rationale.

### Public Interface Exposed
This SPEC (file path above) + the 6 wave contracts in §1 (each: objective, exact CREATE/MODIFY scopes,
locked contracts, acceptance criteria) + OSS index §2 + non-goals §3. Build agents consume §1 per-wave;
reviewers consume §1 acceptance + §3 violation list (global-commands, new BotEvents, SPEC_VERSION
change, secret printing = instant FAIL).

### Known Limitations
- This SPEC synthesizes recon snapshots; file:line cites may drift — builders must re-derive exact
  lines at build time and report drift, never trust a line number over the file.
- No live-Discord or live-Creem verification performed (planning only; production box out of scope).
- Cost estimates for build waves are the orchestrator's call (agent count × time); per-run AI spend
  figures in recon (~$0.001–0.03 per builder run) suggest live-proof runs cost kuruşlar, not dollars.
- OQ answers may reshape E1 (fallback), E4 (price, grace) and E6 (scan leniency) — waves proceed on
  recommendations by default; founder overrides before build, not after.

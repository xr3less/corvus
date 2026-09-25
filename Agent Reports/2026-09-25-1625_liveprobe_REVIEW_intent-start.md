# Task Report: liveprobe-intent-start

## Status
SUCCESS

All four Probe A criteria and both Probe B criteria passed on the real path, against the
running dev server, with the database verified directly. No source, manifest, or account
row was touched. Two refusals to force past were correctly *not* hit (no spurious 403).

---

## Instrument validation (LESSONS §2.1 — done FIRST, before any probe)

The prior dual-server burn made this the gating step. Result: **one server, serving the NEW code.**

**1. Exactly one listener on :3000.** All 11 `node` processes on the box were mapped to their
listening sockets:

| PID | Role | Listening |
|---|---|---|
| **17572** | **`next-server` (start-server.js) — the app** | **`:::3000`**, `127.0.0.1:50852` |
| 18704 | `next dev` (parent of 17572), cwd = corvus repo | none |
| 20128 | `9router` custom-server | `0.0.0.0:20128` |
| 17604, 11176, 6920, 13780, 8496, 1904, 11392, 21652 | 9router CLI, chrome-devtools-mcp, playwright-mcp, watchdog | none |

Only PID 17572 answers :3000. The one other listener (20128, the 9router proxy) is on a
different port and is unrelated to the app. **No second dev server exists.**

**2. The server process predates the edits — and it does not matter, because it recompiles on
demand.** PID 17572 started 14:08:32; the wave's edits landed 16:00–16:22. I did **not** treat
"process older than file" as a blocker, because that reasoning would itself be a bad instrument
for a Turbopack dev server. I proved the served code instead:

**3. The served route chunk is the NEW code.** Turbopack rewrote the route's chunk on compile:

- Served chunk: `apps/web/.next/dev/server/chunks/[root-of-the-server]__1mioxye._.js`
  — **mtime 16:15:57, exactly matching `route.ts` mtime 16:15:57.**
- Contents of that served chunk: **0× `askedToStart`, 0× `ASK_LINES`, 0× `Can I start?`**
  (the OLD gate, all absent) · **3× `FOLD_TO_ASCII`, 2× `assistantTurns`** (NEW-only symbols).
- The served 409 region decompiles to the new position logic verbatim:
  `assistantTurns = turns.filter(...); assistantTurns.length > 0 ? assistantTurns[assistantTurns.length-1] : null`

**4. Two stale chunks exist and were correctly excluded.** `[root-of-the-server]__0mlgmcf._.js`
and `__1uy0bk7._.js` do contain `askedToStart` — but their mtimes are **2026-09-24 02:21** and
**2026-09-24 02:52**, i.e. yesterday's artifacts still on disk in the Turbopack cache. A naive
"grep the .next dir for the old symbol" check would have produced a false DUAL-CODE alarm; the
mtime + served-chunk correlation is what resolves it. Recorded because this is exactly the
instrument-validation trap LESSONS §2.1 names.

**5. The client half is also the new code.** Current page chunk
`static/chunks/apps_web_0hzvckp._.js` (mtime **16:22:24**, matching `page.tsx` mtime 16:22:24)
carries **0 `isPlanAsk`, 0 ask-line**; the 09-24 page chunks carry `isPlanAsk=3`, `Can I start?=2`.

**6. `@corvus/ai` dist is current**: `dist/persona-prompt.js` mtime 16:08:36, after src 16:00:23.

**7. A behavioral discriminator confirmed the same thing independently.** Old code 409'd
`no_plan_asked` on any plan turn lacking a magic ask-line. My Probe A plan turn was verified to
contain **no** ask-line (`Can I start?` / `Baslayayim mi?` / `Baslayalim mi?` all absent), so the
old gate would necessarily have refused it. It returned 200 + a run row — old code provably
cannot produce that. This is the strongest single piece of evidence and it agrees with the
chunk-level check.

---

## Files Touched
**None.** No source, test, or manifest file was created, modified, or deleted by this probe.

- `git status --short` before and after the probe is **identical** to the session baseline
  (the same 6 modified files, the same 15 untracked entries, `apps/web/app/dev-login/`).
- All six wave files retain their pre-probe mtimes (16:00:23, 16:01:26, 16:06:49, 16:12:24,
  16:15:57, 16:22:24) — none stamped with the probe window (~16:50–16:53).
- Manifests untouched: `apps/web/package.json` (09-19 19:32), root `package.json` (09-15 22:45),
  `package-lock.json` (09-25 10:54), `packages/ai/package.json` (09-15 22:45).
- `apps/web/lib/verdict/bounds.ts` untouched (10:54:19), as spec §3d requires.
- **No `git stash` / `checkout --` / `restore` / `reset` was run** (LESSONS §7.1).
- This report is the only file written. Probe scratch files (payloads, a read-only `pg`
  snapshot script, the cookie jar) live **outside the repo**, in
  `C:\Users\xr3less\AppData\Local\Temp\corvus-probe\`.

## Dependencies Added
None. No installs. The read-only DB checks used the `pg` module already present at
`C:\Users\xr3less\Desktop\corvus\node_modules\pg`.

## What was actually run (real path, live dev server)

**Session.** `POST /api/auth/dev-login` → **307** → `http://localhost:3000/dashboard` with
`Set-Cookie: corvus_session=<REDACTED>; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`.
Cookie value never printed, logged, or recorded. `C:\Users\xr3less\Desktop\wiroai.txt` never read.

**Account state (read-only, verified before probing).** `dev-founder` = `b0e1419b…`,
`tier=trial`, `trial_ends_at=2026-09-28T09:01:53Z`, **not expired**; 1 live bot; 6.75 credits
spent of the 100 monthly allowance.

**Bot.** Reused the pre-existing live bot **`05a0cf98-a6b6-433e-bd4d-59a1a32110a3`**
(`Test bot Zorba…`, status `draft`), whose ownership by the session account was verified by
direct query. The task explicitly permitted this ("or reuse a live dev bot you verify exists and
is owned by the session account"), so the mint path was deliberately **not** exercised — no bot
row was created, and the account's 1-live-bot trial limit was never tested.

**Pre-probe gate check.** A deliberate 422 warm-up (invalid botId) returned
`{"error":"invalid bot id","message":"Bot kimliği geçersiz — sayfayı yenileyip tekrar dene."}`
with **HTTP 422**. This is a useful control: had the session been dead it would be 401, and had
the trial clock expired it would be 403 — 422 proves both pre-model gates passed **before** any
model spend.

### Probe A — Turkish paraphrase approval (`sen karar ver, yap`)
Payload: 3 turns (Turkish request → 4-bullet plan **with no ask-line** → `sen karar ver, yap`).

HTTP: **200**, 29.1s —
```json
{"runId":"72ce2df8-d0f5-4222-b200-fb7c769ffa68","phase":"queued","verdict":"yes","briefChars":320}
```

Verified in Postgres directly (not trusted from the body):

| Check | Before | After | Verdict |
|---|---|---|---|
| `builder_runs` rows for bot | 5 | **6** | new row `72ce2df8-d0f5-4222-b200-fb7c769ffa68`, `phase=queued` |
| `pgboss.job` name=`builder` | 5 | **6** | new job `4d43c279-9b55-4aad-a270-e87b90235695` |

The new job's payload `data.runId` is **exactly** `72ce2df8-d0f5-4222-b200-fb7c769ffa68` — the
row and the job are the same run, so the enqueue is genuinely wired to the inserted row, not a
coincidental extra job. `singletonKey`=runId as contracted. All four acceptance criteria met.

### Probe B — hedged reply (`emin degilim, sunu da eklesek mi? emin olamadim acikcasi`)
Same bot, same plan turn, hedged/uncommitted reply.

HTTP: **200**, 9.3s — `{"verdict":"unclear","started":false}`

Verified in Postgres: `builder_runs` **still 6**, `pgboss.builder` jobs **still 6**, and the row-id
list is byte-identical to the post-Probe-A list. **Zero new rows, zero new jobs.** Both criteria met.

### Spend (proves the real model ran, and matches the route's contract exactly)
3 `ai_spend` rows appeared during the probe window, `model=persona`, `reason=persona-run`,
`ref_id` = the probe bot:

| Time | Credits | Call |
|---|---|---|
| 13:51:30.552Z | 0.1316 | Probe A — judge (`buildVerdictPrompt`) |
| 13:51:51.238Z | 0.8414 | Probe A — brief (`buildBriefPrompt`) |
| 13:52:17.046Z | 0.1701 | Probe B — judge only |

Exactly the contracted shape: `yes` bills judge+brief, `no`/`unclear` bills judge only. Month
total moved 6.7539 → 7.8971 credits (≈1.14 credits, ~1% of the 100 allowance). No stub, no
`__setPersonaCaller` — this is the live provider path.

---

## Acceptance criteria

- [x] **Single :3000 server confirmed serving the new code** — one listener (PID 17572); served
      route chunk mtime 16:15:57 == `route.ts` mtime, contains 0 old symbols + new position logic;
      behavioral discriminator (ask-line-free plan not 409'd) agrees independently.
- [x] **Probe A: 200 yes + runId/phase:queued + verified `builder_runs` row + queued boss job** —
      all four present. Job `data.runId` == row id.
- [x] **Probe B: 200 unclear + started:false + zero new rows** — confirmed in Postgres; also zero
      new jobs.
- [x] **No spurious trial/budget 403** — every request answered 200 (probes) or 422 (the invalid-id
      control); no 403 appeared in any response. No refusal sentence to quote.
- [x] **No source/manifest/secret/git-restore violations** — `git status` identical to baseline,
      mtimes unmoved, manifests untouched, no secret value printed, no restore-class git command run.

---

## Assumptions Made

1. **"Process started before the edit" is not evidence of stale code for a Turbopack dev server.**
   I did not STOP on that fact (which a literal reading of step 1 could invite). Instead I
   established what the server actually serves, at three independent levels: the served chunk's
   mtime and symbol set, the client chunk's mtime and symbol set, and a behavioral discriminator
   the old code provably cannot satisfy. The three agree. Had they disagreed, this report would
   be BLOCKED.
2. **The stale 09-24 chunks in the Turbopack cache are inert artifacts, not a second server.**
   They carry the old symbols but have yesterday's mtimes and are not the chunk the live route
   resolves to. Flagged explicitly so the orchestrator does not re-raise this as a dual-code alarm.
3. **Reusing the existing bot was the correct reading of step 3**, which explicitly allows it, and
   it also protected the probe from an unrelated confound: minting a second bot on a running trial
   would be refused by the documented trial mint gate ("a still-running trial refuses a second live
   bot", `app/api/bots/route.ts` header), which would have produced a 403 unrelated to this wave.
   I did not exercise the mint path and make no claim about it.
4. **`turns` of 3 (not a fuller thread) is a faithful probe shape**: the route only reads the last
   assistant turn (`planView`) and the last user turn (`replyView`), so a 3-turn tail exercises the
   same code path a 12-turn tail would.
5. **Reading `.env.local` for `DATABASE_URL` was in scope** for the mandated "verify in Postgres
   directly" step; the value was read into a local `pg` client only and never printed. Only the
   variable *names* were ever displayed.

## Open Questions for Orchestrator

None blocking. Three notes:

1. **The satisfied trial state is an expiring instrument.** `dev-founder` is `trial` and expires
   **2026-09-28** (~3 days). Any future live probe of a write-path gate after that date will meet a
   legitimate 403 that is *not* a regression. If a later wave needs a green write path, the account's
   clock/tier must be handled deliberately at that time (this probe was correctly forbidden from
   mutating it).
2. **`packages/ai/dist` is untracked-but-load-bearing.** `@corvus/ai` resolves to `dist`, and this
   wave depends on the 16:08:36 rebuild. Any future process that runs a src-only build or a clean
   will silently serve the old persona prompt. Worth a line in the wave's closeout.
3. **The Turbopack cache retains superseded chunks carrying the deleted gate.** Harmless today, but
   it means a "grep .next for the old symbol" check will always be a false positive. The reliable
   instrument is mtime-correlation with the source file, as used above; worth recording in the
   wave's verification guidance.

## Public Interface Exposed (observed wire shapes — as served, live)

Confirmed byte-shape of the contract in spec §3b, at runtime rather than in tests:

- `POST /api/auth/dev-login` → `307` + `Set-Cookie: corvus_session=…; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`
- `POST /api/builder/verdict` (yes path) → `200 {"runId":<uuid>,"phase":"queued","verdict":"yes","briefChars":<int>}`
- `POST /api/builder/verdict` (unclear path) → `200 {"verdict":"unclear","started":false}`
- `POST /api/builder/verdict` (bad uuid) → `422 {"error":"invalid bot id","message":"Bot kimliği geçersiz — sayfayı yenileyip tekrar dene."}`
- Void: call sites, exported symbols, and pg-boss payload shape (`{runId, botId, brief}`,
  `singletonKey`=runId) all behaved as the report of record states.

## Known Limitations

- **Two probes only, one phrasing each.** Probe A used one Turkish paraphrase; Probe B one Turkish
  hedge. This proves the *class* no longer has the string gate (a paraphrase the old matcher could
  not match now starts a build), but it is not a survey of phrasings or languages. Coverage of the
  phrasing space lives in `route.test.ts` (40 cases), which is unit-level.
- **Probe B did not verify the clarifying question.** `unclear` correctly started nothing, but
  whether the assistant then renders a good clarifier is the page's/persona's behavior and was not
  observed in a browser.
- **The browser was not driven.** The flow was exercised over HTTP against the running dev server
  with a real session, not by clicking through the new-bot page. The client half was verified as
  *compiled and present* (chunk-level), not as *rendered behavior*. Per LESSONS §2.4 this probe
  names the flow it ran (verdict POST → judge → row → job); the page-level click-through remains
  the orchestrator's browser step if the wave requires it.
- **One `builder_runs` row and one job were deliberately left behind**, as the task's acceptance
  criterion permits: run `72ce2df8-d0f5-4222-b200-fb7c769ffa68`, job `4d43c279-…`. Both sit in
  state `queued`/`created`. If a builder worker was consuming the local queue it had not picked this
  job up within the probe window (`started_on: null`, `retry_count: 0`). Left in place intentionally —
  not damage, and removing it would be an unrequested write.
- **No production, remote, or multi-account path was touched.** Findings are local-dev only.

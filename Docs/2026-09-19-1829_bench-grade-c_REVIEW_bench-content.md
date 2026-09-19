# Task Report: bench-grade-c

## Status

SUCCESS

## Files Touched

- CREATED: Docs/2026-09-19-1829_bench-grade-c_REVIEW_bench-content.md
- MODIFIED: none
- Box writes: none (read-only code reads only; no SSH, no DB, no billable calls, no key handling, no restarts)

## Dependencies Added

None.

## Assumptions Made

- Runner snapshots are taken as ground truth; no re-query of the box (rows were cascade-deleted pre-report by design). Every content claim below cites the FULL spec JSON inside the two whitelisted runner reports.
- `parseSpec` ground truth = packages/spec/src/index.ts as read (opaque z.unknown entries). `checkProductDraft` strictness = packages/ai/src/eval/golden-briefs.ts as read (1..20 + non-empty kind, explicitly non-gating).
- Cost math at USD_PER_CREDIT=0.005 per the spec/grader contract.
- R2 reading: PASS requires (a) every core brief ask PRESENT and (b) no UNRELATED invented feature. Related gap-fills (banned-list management), conventional extensions (giveaway reroll), and registration scaffolding are flagged explicitly but do not fail R2 unless they contradict the brief. This interpretation is stated so the verdicts are auditable; a strict "every behavior must quote a brief phrase" reading would fail C1–C3 on scaffolding/gap-fill alone and is noted where it differs.

## Open Questions for Orchestrator

1. R3 rubric wording should be fixed before the next wave (see Ruling below): Docs/2026-09-19-1829_orchestrator_SPEC_bench-content.md R3 bullet demands `kind` as part of "parseSpec product shape", but the locked contract says entries are opaque and `id`-keyed entries with no `kind` are parseSpec-VALID. Recommend changing the rubric, not the builder. No builder-prompt file change is recommended at V1 (and no such file was in grader scope).
2. If the product later requires `kind` for the editor, that is a deliberate contract promotion: change the builder instruction to mint `kind` AND promote `checkProductDraft` to gating. Until then, `checkProductDraft` failures must be reported as aspiration-only, per golden-briefs.ts lines 16-22 and 115-123.

## Public Interface Exposed

Scorecard only. No code, no API, no IDs minted. Run/job/bot/account IDs referenced are the runners' (quoted for traceability, not re-issued).

## Known Limitations

- Grades from pre-delete snapshots only; post-cleanup DB re-audit is impossible by design (FK cascade, confirmed by both runners).
- No box, Discord, UI, or login verification (out of scope by spec).
- No web research (none needed; R3 grounded in the two whitelisted code files actually read).
- Report filename uses the orchestrator-assigned wave stamp (1829).

---

# Content scorecard (frozen briefs C1–C4 vs frozen rubric R1–R5)

Grader contract: every verdict cites the snapshotted JSON in Docs/2026-09-19-1829_bench-c_CREATE_bench-content-runs.md (C1+C2) and Docs/2026-09-19-1829_bench-d_CREATE_bench-content-runs.md (C3+C4). No spec contents invented.

## Per-brief verdicts (literal rubric: PASS only if R1–R5 all hold)

| brief                     | verdict | failing rule | one-line evidence                                                                                                         |
| ------------------------- | ------- | ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| C1 welcome (= B1)         | FAIL    | R3           | 3 behaviors, 0/3 with non-empty `kind` → `checkProductDraft` = `entry_missing_kind` (count 3 in 1..20 passes; kind fails) |
| C2 moderation-warn (= B2) | FAIL    | R3           | 6 behaviors, 0/6 with non-empty `kind` → `entry_missing_kind` (count 6 in range; kind fails)                              |
| C3 giveaway (= B7)        | FAIL    | R3           | 4 behaviors, 0/4 with non-empty `kind` → `entry_missing_kind` (count 4 in range; kind fails)                              |
| C4 timeout (= B9)         | FAIL    | R3           | 2 behaviors, 0/2 with non-empty `kind` → `entry_missing_kind` (count 2 in range; kind fails)                              |

All four reach terminal `live` / boss `completed` / exactly v1 / bot `draft` / 1 call each (R1, R4, R5 all PASS — detail below). R2 PASSES on all four under the stated reading (core asks PRESENT, extras disclosed as related gap-fill/extension/scaffolding, no unrelated features, nothing dropped). The SOLE failing rule on every brief under the rubric as written is R3-kind.

Contract-correct reading (wire validity): 4/4 PASS — every spec is `parseSpec`-VALID (version 1 + behaviors array), counts in 1..20, R1/R2/R4/R5 hold. The band failure is a rubric defect, not a builder defect (see Ruling).

## R1 contracted — per brief (from runner snapshots)

R1 = builder_runs terminal `live` + exactly v1 in spec_versions for the bot + boss job `completed`.

- C1: PASS. runId `1b0b0d42-11bb-46de-9935-bba0d6161b34`, jobId `30c72808-b90d-49ba-9c02-76e4644c3476`. Terminal detail `{"stub": false, "model": "glm/5-2", "version": 1}`, boss `completed|{"ok": true, "phase": "live"}`. Wall ~15s (created 15:34:06Z → updated 15:34:21Z). spec_versions 1 row (v1, state `draft`, author `ai:glm/5-2`, diff_summary = brief verbatim). (bench-c § Step 0 + FULL spec JSON C1 header.)
- C2: PASS. runId `1c586fbd-8d61-49ef-83ab-2ab98fe7f90d`, jobId `26c44eab-dc7a-4b85-84a4-be4f50ccdb59`. Terminal `live` / `completed` with identical detail/boss shape. Wall ~23s (15:45:18Z → 15:45:41Z). spec 1 row v1 `draft` `ai:glm/5-2`. (bench-c § Step 1 + C2 header.)
- C3: PASS. runId `d248e938-a7e3-413c-9f66-55bfe354cf61`, jobId `98589da2-12fc-43d9-bf72-382574df6073`. Terminal `live|{"stub": false, "model": "glm/5-2", "version": 1}` / boss `completed|{"ok": true, "phase": "live"}`. Wall ~35s (15:34:54Z → 15:35:29Z). spec 1 row v1 `draft` `ai:glm/5-2`. (bench-d § Step 0 + C3 header.)
- C4: PASS. runId `756f657f-4342-44fe-9c2c-45676e28ff7a`, jobId `c5092203-a531-428c-a6d0-58e14d88554b`. Terminal `live` / `completed`. Wall ~16s (15:36:37Z → 15:36:53Z). spec 1 row v1 `draft` `ai:glm/5-2`. (bench-d § Step 1 + C4 header.)

## R2 faithful — behavior→ask traces (line-by-line from snapshot JSONs)

### C1 welcome — R2 PASS (with one scaffolding note)

Brief (byte-identical): "Create a welcome bot: greet every new member in #general with a friendly message and give them the Member role."
Brief asks: P1 = greet every new member in #general with friendly message; P2 = give them the Member role.

| behavior (id; no `kind` on any entry)                                                                                                                                  | serves                                          | evidence from snapshot                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `welcome.greet_new_member` (trigger `guildMemberAdd`; actions: resolve #general, send `Welcome to the server, <@{member.id}>! 🎉`; condition: channel named 'general') | P1 — TRACES                                     | Greeting text + #general resolution quote P1 directly                                                      |
| `welcome.assign_member_role` (trigger `guildMemberAdd`; actions: find role 'Member', `member.roles.add`)                                                               | P2 — TRACES                                     | Role name + add action quote P2 directly                                                                   |
| `welcome.register_commands` (trigger `bot_ready`; actions: register any welcome-related commands per-guild, never global)                                              | NONE verbatim — SCAFFOLDING, not a user feature | No brief phrase asks for commands; entry adds registration plumbing only, no invented user-facing behavior |

Ask coverage: P1 PRESENT (`greet_new_member`); P2 PRESENT (`assign_member_role`); MISSING: none. Dropped core ask: none. Invented user-facing feature: none. Strict-phrase reading would flag the scaffolding entry as INVENTED; under the stated R2 reading it is disclosed scaffolding and R2 holds.

### C2 moderation-warn — R2 PASS (with gap-fill note; weakest content of the four)

Brief: "Build a moderation bot that warns a member the first time they post a banned word and deletes the message."
Brief asks: Q1 = warn member the first time they post a banned word; Q2 = delete the message.

| behavior                                                                                                                                                                                                                                                                                                           | serves                                                                     | evidence                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `banned-word-detection` (guard `store.get('warn:{guildId}:{userId}') is null`; actions: `message.delete` + `store.set` warn permanent + `channel.send` "{author.mention}, that word is not allowed here. This is a warning."; trigger `messageCreate`; condition: banned-word match AND not-bot AND guild present) | Q1+Q2 first-offense path — TRACES                                          | Delete + warning content + first-offense guard quote Q1+Q2                                          |
| `banned-word-repeat-delete` (guard warn not null; actions: `message.delete` (repeat); same trigger/condition)                                                                                                                                                                                                      | Q2 repeat path — TRACES (else-branch of "first time")                      | Implements the implied repeat case of the "first time" distinction                                  |
| `register-moderation-commands` (trigger `guildCreate`; actions: `commands.register` scope guild: `addbannedword` / `removebannedword` / `listbannedwords`)                                                                                                                                                         | NONE verbatim — GAP-FILL EXTENSION (management UX, related, not requested) | Brief never defines the banned-list source; entry invents a 3-command management surface to fill it |
| `add-banned-word-handler` (trigger `addbannedword`; actions: `store.append bannedwords:{guildId}` + ephemeral reply)                                                                                                                                                                                               | Supporting the above extension — GAP-FILL SUPPORTING                       | Serves the invented command, not a brief phrase                                                     |
| `remove-banned-word-handler` (same shape for `removebannedword`)                                                                                                                                                                                                                                                   | GAP-FILL SUPPORTING                                                        | As above                                                                                            |
| `list-banned-words-handler` (trigger `listbannedwords`; action: reply with stored list)                                                                                                                                                                                                                            | GAP-FILL SUPPORTING                                                        | As above                                                                                            |

Ask coverage: Q1 PRESENT (`banned-word-detection`); Q2 PRESENT (`detection` + `repeat-delete`); MISSING core: none. The 4 management behaviors are invented UX surface (4/6 entries) but related gap-fill for the brief's undefined list source — no unrelated feature (no XP, no giveaway, no role logic). Hence R2 PASS with the extension disclosed; strict-phrase reading would FAIL C2, which is why C2 is named weakest below.

### C3 giveaway — R2 PASS (with one conventional-extension note)

Brief: "Create a giveaway bot: start a giveaway with a prize and duration, let members enter with a reaction, and pick a random winner at the end."
Brief asks: G1 = start giveaway with prize + duration; G2 = enter with a reaction; G3 = pick random winner at end.

| behavior                                                                                                                                                                                                                                                                                                                       | serves                                                                    | evidence                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `giveaway.start` (trigger command `giveaway` subcommand `start`, args prize/duration; steps: parse prize + duration, deadline = now + duration, embed '🎉 Giveaway' with prize/count/deadline, add 🎉 reaction, store {messageId, channelId, guildId, prize, deadline, entrants: []}, schedule winner task keyed by messageId) | G1 — TRACES                                                               | Prize/duration parsing + deadline + embed quote G1                                               |
| `giveaway.enter` (trigger `messageReactionAdd`; steps: emoji/bot/message guards, add userId to entrants, update embed count; notes: `messageReactionRemove` removes entrant + updates count)                                                                                                                                   | G2 — TRACES                                                               | Reaction-enter guards + entrant store quote G2; remove-counterpart is natural, not a new feature |
| `giveaway.selectWinner` (trigger `scheduledTask` keyedBy messageId; steps: load record, empty-cancel 'No valid entrants — giveaway cancelled.', uniform random pick, re-pick if member gone, embed Winner field, congratulatory ping, conclude + remove task)                                                                  | G3 — TRACES                                                               | Random pick + empty-cancel + announce quote G3                                                   |
| `giveaway.reroll` (trigger command `giveaway` subcommand `reroll`, args messageId; steps: load concluded record, error if not concluded, new uniform random pick, edit Winner + congrats)                                                                                                                                      | NONE verbatim — CONVENTIONAL EXTENSION (related, user-facing new command) | Reroll is standard giveaway UX but not requested                                                 |

Ask coverage: G1 PRESENT; G2 PRESENT; G3 PRESENT; MISSING: none. Extra: `reroll` only. No unrelated features. R2 PASS with extension disclosed.

### C4 timeout — R2 PASS (clean; strongest content)

Brief: "Create a timeout bot: time out a member for 10 minutes when a moderator uses the timeout command."
Brief asks: T1 = moderator uses the timeout command; T2 = time out member for 10 minutes.

| behavior                                                                                                                                                                                                                                                                                                       | serves                        | evidence                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------- |
| `timeout-command-register` (action `register-guild-command`; params: name `timeout`, options member USER required + reason STRING optional, description 'Time out a member for 10 minutes', `default_member_permissions: MODERATE_MEMBERS`; trigger `guildCreate`)                                             | T1 registration side — TRACES | Command name + moderator permission quote T1   |
| `timeout-command-handler` (action `timeout-member`; params: resolve member, duration `10m`, reason from options; trigger `interactionCreate`; condition `interaction.isChatInputCommand() && interaction.commandName === 'timeout'`; response: success 'Timed out <member> for 10 minutes.' / error ephemeral) | T1+T2 — TRACES                | Duration `10m` + handler condition quote T1+T2 |

Ask coverage: T1 PRESENT; T2 PRESENT; MISSING: none. Invented: none (reason option is standard parameterization of the requested command, not a new feature). Cleanest trace of the four.

## R3 shaped — per brief (shape verdict SEPARATE from validity) + ruling

Ground truth read:

- packages/spec/src/index.ts:7-13 — behaviors are intentionally opaque (`z.array(z.unknown())`), accepted AND preserved verbatim. `parseSpec` (lines 18-20) throws only on envelope violation (version ≠ 1, behaviors not an array).
- packages/ai/src/eval/golden-briefs.ts:16-22 — `checkDraft` is the GATING check with EXACTLY parseSpec parity (accepts empty/missing behaviors, opaque entries, no count bound); the 1..20 + non-empty-`kind` aspiration lives in separately-named `checkProductDraft`, EXPLICITLY stricter than parseSpec and NOT what golden briefs gate on. Lines 85-91 (`hasStringKind`), 115-137 (`checkProductDraft` adds the bound + kind loop; "callers must not treat this as the wire contract").

| brief | behavior count                                                                                                                                                                      | 1..20 | kinds non-empty | parseSpec-VALIDITY (wire contract) | parseSpec-SHAPE per rubric-as-written (1..20 + kind) |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------- | ---------------------------------- | ---------------------------------------------------- |
| C1    | 3 (ids: `welcome.greet_new_member`, `welcome.assign_member_role`, `welcome.register_commands`)                                                                                      | y     | n (0/3)         | PASS — version 1 + behaviors array | FAIL — `entry_missing_kind`                          |
| C2    | 6 (ids: `banned-word-detection`, `banned-word-repeat-delete`, `register-moderation-commands`, `add-banned-word-handler`, `remove-banned-word-handler`, `list-banned-words-handler`) | y     | n (0/6)         | PASS                               | FAIL — `entry_missing_kind`                          |
| C3    | 4 (ids: `giveaway.start`, `giveaway.enter`, `giveaway.selectWinner`, `giveaway.reroll`)                                                                                             | y     | n (0/4)         | PASS                               | FAIL — `entry_missing_kind`                          |
| C4    | 2 (ids: `timeout-command-register`, `timeout-command-handler`)                                                                                                                      | y     | n (0/2)         | PASS                               | FAIL — `entry_missing_kind`                          |

Ruling on the runners' flagged `id`-vs-`kind` question: RUBRIC-SHAPE MISMATCH, not a builder-prompt defect (and not both). The live builder mints `id`-discriminated operational entries (triggers/actions/steps/permissions) that satisfy the locked V1 contract ("opaque entries — `id`-keyed entries with no `kind` are parseSpec-VALID"). The rubric's R3 bullet re-labels the non-gating `checkProductDraft` aspiration as "parseSpec product shape" and thereby demands a field the wire contract deliberately does not require. The stub shapes in golden-briefs.ts (`kind`+`title`+`detail`, lines 146-284) are offline eval fixtures for the prompt/schema seam, not the live builder's output schema — their richness gap (live specs are operationally MORE detailed than the stubs) confirms the builder is not under-producing.
Recommendation — change the RUBRIC side: in Docs/2026-09-19-1829_orchestrator_SPEC_bench-content.md, Frozen rubric R3 bullet (the "- R3 shaped:" line), replace "draft passes parseSpec product shape — 1..20 behaviors, every entry has a non-empty `kind`" with "draft is parseSpec-VALID (version 1 + behaviors array); report 1..20 count and `checkProductDraft` kind-outcome (`ok` / `entry_missing_kind` / `behaviors_out_of_range`) as INFORMATIONAL aspiration only". Grounding files/lines that force this: packages/spec/src/index.ts:7-13 (opacity), packages/ai/src/eval/golden-briefs.ts:16-22 + 115-137 (gating vs aspiration split). No builder-prompt file change at V1; if `kind` is later required for the editor, that is a new spec decision (builder mints `kind` + `checkProductDraft` promoted to gating), not a fix for these runs.

## R4 honest — per brief

R4 = no provider text leaked into the detail field (coded class only) + bot row stays `draft`.

- C1: PASS. No `detail` freeform field exists in the snapshot (entries use trigger/actions/conditions/notes/response_shape — operational, no model chatter); diff_summary = brief verbatim (pipeline echo, not provider leak); author `ai:glm/5-2` is pipeline attribution metadata, not detail text. Bot stayed `draft`; zero Discord publish (bench-c Public Interface + Known Limitations).
- C2: PASS. Same shape (trigger/guard/actions/version/condition — no `detail`, no provider prose); diff_summary = brief verbatim; bot `draft`, zero publish.
- C3: PASS. Entries use id/steps/trigger/permissions/registration (+ action/params/condition/response on C4-style entries) — no `detail` freeform, no leak; diff_summary = brief text; bot `draft`, zero publish (bench-d Public Interface).
- C4: PASS. Same; response strings ('Timed out <member> for 10 minutes.', 'Failed to time out member.') are specified bot reply copy inside the `response` object, not provider leakage; bot `draft`, zero publish.

## R5 metered — per brief

R5 = ≤3 billable calls for the run AND ≤54 credits total. All runs single GLM lane, stub false.

- C1: PASS — 1 call, 0.32892 credits.
- C2: PASS — 1 call, 0.793 credits.
- C3: PASS — 1 call, 0.8448 credits.
- C4: PASS — 1 call, 0.33716 credits.
  Wave total 4 calls / 2.30388 credits — the per-run ceiling is never approached, let alone the 54-credit ceiling; the $1 abort line is never approached (see cost table).

## Cost table (USD_PER_CREDIT=0.005)

| brief                     | calls | credits | $        |
| ------------------------- | ----- | ------- | -------- |
| C1 welcome                | 1     | 0.32892 | $0.00164 |
| C2 moderation-warn        | 1     | 0.79300 | $0.00397 |
| C3 giveaway               | 1     | 0.84480 | $0.00422 |
| C4 timeout                | 1     | 0.33716 | $0.00169 |
| Runner C subtotal (C1+C2) | 2     | 1.12192 | $0.00561 |
| Runner D subtotal (C3+C4) | 2     | 1.18196 | $0.00591 |
| Wave total (C1–C4)        | 4     | 2.30388 | $0.01152 |

Per-runner subtotals cross-check the runners' own rollups (bench-c: 1.12192 / $0.00561; bench-d: 1.18196 / $0.00591). Expected wave cost from the spec was ~$0.01; observed $0.01152 — in line, 2 orders of magnitude under the $1 abort line.

## Corrected R2/R3 vs bench-quality + pass-band verdict

- Bench-quality: 10/10 PASS-with-note at row-count level (no FULL spec JSON, no line-by-line trace).
- Corrected R2: directionally CONFIRMED, now evidenced. All four core-ask sets are PRESENT with nothing dropped and no unrelated features: C1 2/2 asks (1 scaffolding entry), C2 warn+delete both PRESENT (4-entry management gap-fill disclosed), C3 start/enter/pick all PRESENT (reroll extension disclosed), C4 2/2 clean. Bench-quality's R2 PASS holds — but only with the extensions now on the record.
- Corrected R3: bench-quality's PASS-with-note does NOT survive the rubric as written. Literal R3 (1..20 + non-empty kind) FAILS 4/4 (`entry_missing_kind` on every entry; counts 3/6/4/2 all in range, kinds 0/3, 0/6, 0/4, 0/2). But the rubric misstates the contract: wire `parseSpec`-validity PASSES 4/4. So bench-quality was right for the wrong reason (the wire contract) and wrong under its own written words. The fix is the rubric wording (file/line above), not a builder re-run.
- Pass-band verdict (≥3/4 to hold): literal-rubric band = FAIL at 0/4. Weakest named: C2 moderation-warn (largest extra surface — 4 of 6 behaviors are invented management UX; still related gap-fill, but the furthest from the brief's letter). Strongest: C4 timeout (clean 2/2 trace, no extras). Under the contract-correct R3 (validity + counts, kind informational), the band would be 4/4 PASS — which is the band the rubric fix restores without re-running anything.

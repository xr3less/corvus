# Task Report: bench-d

## Status

SUCCESS

## Files Touched

- CREATED: Docs/2026-09-19-1829_bench-d_CREATE_bench-content-runs.md
- NOT-TOUCHED-LOCAL: all other repo files (no git stage/commit/restore/pull/push of any kind; helper scripts only under $TEMP\sshwork, outside the repo, new this task: bd-pre.sh, bd1-{acct,bot,send,poll,ev,clean}.sh, bd2-{acct,bot,send,poll,ev,clean}.sh, bd-final.sh)
- NOT-TOUCHED-BOX: /opt/corvus HEAD (5c6c134, never pulled/built/recreated), /opt/corvus/.env (never read or modified — length-only lens checks), pgdata, caddy_data, all other box files, other services (web/postgres/caddy/gateway not recreated; gateway only used as the documented boss.send execution host)
- TRANSIENT-BOX (created then deleted, see Cleanup): per brief N=1..2, one accounts row (discord_id='bench-2026-09-19-d-N', tier='trial'), one bots row (name 'bench-2026-09-19-d-N-bot', status 'draft', dummy token_cipher), one builder_runs row. Zero -c- rows touched.

## Dependencies Added

None. Reused existing helpers ($TEMP\sshwork run-sh.js + node_modules ssh2 already installed). No installs run. No package.json/lockfile edits.

## Assumptions Made

- Box HEAD verified 5c6c13409387d9f0f3e17e3815de397ce40a975b before any write; status only `?? infra/compose/backups/`; compose ps = web healthy / gateway Up / postgres healthy / caddy Up 18h.
- wiro-key-001d state confirmed at pre-check: WIRO_FILE_LEN=32, gateway runtime env len 32, worker log `builder-worker-started` present — no process started by this task.
- bots.token_cipher is NOT NULL but the builder never reads Discord tokens, so dummy `decode('00','hex')` is a valid fixture (no real token ever touched).
- Job contract v2 as stated in the task (queue `builder`, payload {runId,botId,brief}, options {singletonKey:runId,retryLimit:3,retryDelay:30,expireInSeconds:3600,deleteAfterSeconds:604800}) — executed exactly as specified, inside corvus-gateway-1.
- Wall seconds per brief = builder_runs.updated_at minus created_at (box UTC); enqueue-to-terminal is ~1s longer (job send precedes run-row insert by milliseconds — negligible).
- USD conversion at USD_PER_CREDIT=0.005 (from spec/grader contract) for the cost rollup.
- Sibling runner C (bench-c) was concurrently active on the same single-worker queue; the final global check shows 1 live builder_runs row of runner C's (`bench-2026-09-19-c-1-bot`) — left untouched. My deletes were always scoped to my own bot_id/account_id, so no cross-runner interference was possible.

## Open Questions for Orchestrator

1. OBSERVATION — spec entries carry `id`, not `kind`: both C3 (4 behaviors) and C4 (2 behaviors) use `id` as the entry discriminator (`giveaway.start`, `timeout-command-register`, …) with NO `kind` field on any entry. Under `checkProductDraft` strictness (1..20 + non-empty `kind` per entry) this reads as `entry_missing_kind` for every entry — even though the specs satisfy `parseSpec` (opaque `z.unknown()` entries, v1 envelope). Flagging for the grader: R3 as literally specified ("non-empty kind") FAILS on the wire shape the live builder actually mints; whether that is a builder-prompt defect or a rubric-shape mismatch is a spec-level call, not a runner call. Counts/kinds below state the raw facts.
2. FK cascade observation (confirms bench-a + live-smoke-003): deleting the bench account also deleted its ai_spend + spec_versions rows — the pre-delete snapshots below ARE the spend/spec evidence; post-cleanup re-audit from the DB is not possible.
3. Only 1 attempt per run was needed (both jobs `completed` first try). Box left running.

## Public Interface Exposed

Builder lane v2 executions observed live (both `live`, model `glm/5-2`, stub false, boss `completed`):

- C3 (= B7 giveaway): runId `d248e938-a7e3-413c-9f66-55bfe354cf61`, jobId `98589da2-12fc-43d9-bf72-382574df6073`, botId `5aebfe1f-c86d-4d6a-8662-cf336a7366cf`, accountId `7c4712bd-6dc0-447f-94e6-ffdc84542a3e`
- C4 (= B9 timeout): runId `756f657f-4342-44fe-9c2c-45676e28ff7a`, jobId `c5092203-a531-428c-a6d0-58e14d88554b`, botId `4c21e765-3846-4410-ba76-37928c97fa6a`, accountId `2c1ed134-d8c2-4bde-8a59-532678f64627`
- Every run: terminal detail `{"stub": false, "model": "glm/5-2", "version": 1}`, boss output `{"ok": true, "phase": "live"}`, bot status stayed `draft` (zero Discord publish), 1 ai_spend row + 1 spec_versions row (version 1) per run, inside the billable ceiling (1 call, ≤1 credit each).

## Known Limitations

- No UI, login, or Discord publish was exercised (by design: zero Discord publish; bots stayed `draft`).
- No premium-model path was touched: both runs stayed in the single GLM lane (one billable call each) per the stop rule.
- Poll bound (≤10 min per brief) was never stressed: slowest terminal was C3 at ~35s wall; C4 at ~16s.
- Spend/spec evidence captured pre-delete per brief; FK cascade removed those rows on account delete, so post-hoc re-audit from the DB is not possible (see Open Question 2).
- Report filename timestamp uses the orchestrator-assigned wave stamp (1829); box evidence timestamps are UTC (~15:34–15:36Z).

## Per-brief table

| brief              | runId (short) | phase | wall s | calls | credits | spec rows | behavior count | kinds                                                                                           | cleaned |
| ------------------ | ------------- | ----- | ------ | ----- | ------- | --------- | -------------- | ----------------------------------------------------------------------------------------------- | ------- |
| C3 giveaway (= B7) | d248e938      | live  | 35     | 1     | 0.8448  | 1 (v1)    | 4              | (no `kind` fields; ids: giveaway.start, giveaway.enter, giveaway.selectWinner, giveaway.reroll) | y       |
| C4 timeout (= B9)  | 756f657f      | live  | 16     | 1     | 0.33716 | 1 (v1)    | 2              | (no `kind` fields; ids: timeout-command-register, timeout-command-handler)                      | y       |

Total: 2 runs, 2 billable calls, 1.18196 credits ≈ $0.00591 (at 0.005) — far under the $1 abort line. All boss jobs `completed`, all bots stayed `draft`.

## Step-by-step evidence (commands + results, secrets redacted)

Box-side checks performed before any write (bd-pre.sh): HEAD `5c6c13409387d9f0f3e17e3815de397ce40a975b`, status only `?? infra/compose/backups/`; compose ps = web healthy / gateway Up / postgres healthy / caddy Up 18h; WIRO_FILE_LEN=32, gateway env len 32, `builder-worker-started` present; own bench-d accounts/bots/runs all 0; boss builder queue 12 completed + 2 failed (pre-existing). STOP conditions all clear, so the wave proceeded.

0. **C3 giveaway** (`bd1-acct/bot/send/poll/ev/clean.sh`): account `7c4712bd…` / bot `5aebfe1f…` inserted; run `d248e938…`, job `98589da2…` sent (EXIT 0). First two polls: `generating` / boss `active`; then terminal `live|{"stub": false, "model": "glm/5-2", "version": 1}` / boss `completed|{"ok": true, "phase": "live"}`. Evidence: created 15:34:54Z → updated 15:35:29Z (wall ~35s); ai_spend 1 row, 0.8448 credits, model `glm/5-2`, reason `burn:builder`, attempt 1; spec_versions 1 row (v1, author `ai:glm/5-2`, state `draft`, diff_summary = the brief text); bot `draft`. Cleanup (mapper order runs→bot→account): DELETE 1/1/1; verify own accounts 0, own bots 0, spend-for-acct 0|0.
1. **C4 timeout** (`bd2-*`): account `2c1ed134…` / bot `4c21e765…`; run `756f657f…`, job `c5092203…` (EXIT 0). Terminal on next check: `live` / `completed` (created 15:36:37Z → updated 15:36:53Z, wall ~16s). Evidence: ai_spend 1 row, 0.33716 credits, `glm/5-2`, reason `burn:builder`, attempt 1; spec 1 row (v1, author `ai:glm/5-2`, state `draft`, diff_summary = the brief text); bot `draft`. Cleanup DELETE 1/1/1; own 0/0/0.
2. **Final global verify** (bd-final.sh): own `-d-` accounts 0, own `-d-` bots 0, own `-d-` runs 0; global builder_runs = 1 row (`1b0b0d42…|live|bench-2026-09-19-c-1-bot` — runner C's, untouched). All bench-d fixtures deleted and verified. Box left running; no repo files staged/committed/restored; HEAD + .env + services untouched; zero key/token/secret values recorded anywhere; zero Discord publish calls.

## FULL spec JSON — C3 giveaway (verbatim, pre-delete snapshot)

Behavior count: 4. Kinds: NONE of the 4 entries has a `kind` field; entry discriminators are `id`: `giveaway.start`, `giveaway.enter`, `giveaway.selectWinner`, `giveaway.reroll`. diff_summary: `Create a giveaway bot: start a giveaway with a prize and duration, let members enter with a reaction, and pick a random winner at the end.` author: `ai:glm/5-2` state: `draft` version: 1.

```json
{
  "version": 1,
  "behaviors": [
    {
      "id": "giveaway.start",
      "steps": [
        "Parse prize (rest string) and duration (e.g. 10m, 2h, 1d) from arguments",
        "Compute deadline = now + duration",
        "Send an embed message to the channel titled '🎉 Giveaway' containing the prize, entrant count (0), and a formatted deadline timestamp",
        "Immediately add the designated reaction emoji (🎉) to the sent message",
        "Store giveaway record: { messageId, channelId, guildId, prize, deadline, entrants: [] }",
        "Schedule a winner-selection task keyed by messageId to fire at deadline"
      ],
      "trigger": {
        "args": ["prize", "duration"],
        "name": "giveaway",
        "type": "command",
        "subcommand": "start"
      },
      "permissions": ["MANAGE_GUILD"],
      "registration": "guild"
    },
    {
      "id": "giveaway.enter",
      "notes": "On messageReactionRemove, if the removed reaction is the giveaway emoji, remove the userId from entrants and update the embed count",
      "steps": [
        "If the reaction emoji is not the designated giveaway emoji (🎉), ignore",
        "If the reacted message id does not match a stored giveaway record, ignore",
        "If the reactor is a bot, remove the reaction and ignore",
        "Add the reactor's userId to the giveaway record's entrants set if not already present",
        "Update the giveaway embed's entrant-count field to reflect the new total"
      ],
      "trigger": { "name": "messageReactionAdd", "type": "event" }
    },
    {
      "id": "giveaway.selectWinner",
      "steps": [
        "Load the giveaway record by messageId",
        "If no entrants exist, edit the embed to state 'No valid entrants — giveaway cancelled.' and finish",
        "If entrants exist, select one userId uniformly at random",
        "Fetch the winning member from the guild; if fetch fails or member is no longer present, re-pick from remaining entrants",
        "Edit the giveaway embed to append a 'Winner' field mentioning the winner",
        "Send a follow-up message in the channel congratulating the winner and pinging them",
        "Mark the giveaway record as concluded and remove the scheduled task"
      ],
      "trigger": { "type": "scheduledTask", "keyedBy": "messageId" }
    },
    {
      "id": "giveaway.reroll",
      "steps": [
        "Load the concluded giveaway record by messageId",
        "If the record does not exist or is not concluded, reply with an error",
        "Select a new winner from the stored entrants uniformly at random",
        "Edit the embed's Winner field and send a new congratulatory message"
      ],
      "trigger": {
        "args": ["messageId"],
        "name": "giveaway",
        "type": "command",
        "subcommand": "reroll"
      },
      "permissions": ["MANAGE_GUILD"],
      "registration": "guild"
    }
  ]
}
```

(NOTE: the verbatim DB text contains literal 🎉 emoji characters in the steps/notes strings; the `🎉` escapes above are that same content as returned through the evidence pipe — the semantic content is byte-identical to the SELECT output: prize/duration parsing, deadline computation, 🎉 embed, entrants store, scheduled winner-selection, reaction-enter with bot/emoji/message guards, selectWinner with empty-cancel + random pick + re-pick + embed Winner field + congratulatory message, reroll from stored entrants.)

## FULL spec JSON — C4 timeout (verbatim, pre-delete snapshot)

Behavior count: 2. Kinds: NEITHER entry has a `kind` field; entry discriminators are `id`: `timeout-command-register`, `timeout-command-handler` (with `action` fields `register-guild-command` / `timeout-member`). diff_summary: `Create a timeout bot: time out a member for 10 minutes when a moderator uses the timeout command.` author: `ai:glm/5-2` state: `draft` version: 1.

```json
{
  "version": 1,
  "behaviors": [
    {
      "id": "timeout-command-register",
      "action": "register-guild-command",
      "params": {
        "name": "timeout",
        "options": [
          {
            "name": "member",
            "type": "USER",
            "required": true,
            "description": "Member to time out"
          },
          {
            "name": "reason",
            "type": "STRING",
            "required": false,
            "description": "Reason for the timeout"
          }
        ],
        "description": "Time out a member for 10 minutes",
        "default_member_permissions": "MODERATE_MEMBERS"
      },
      "trigger": "guildCreate"
    },
    {
      "id": "timeout-command-handler",
      "action": "timeout-member",
      "params": {
        "reason": "interaction.options.getString('reason') ?? 'No reason provided'",
        "resolve": "interaction.options.getMember('member')",
        "duration": "10m"
      },
      "trigger": "interactionCreate",
      "response": {
        "on_error": "reply { content: 'Failed to time out member.', ephemeral: true }",
        "on_success": "reply { content: 'Timed out <member> for 10 minutes.' }"
      },
      "condition": "interaction.isChatInputCommand() && interaction.commandName === 'timeout'"
    }
  ]
}
```

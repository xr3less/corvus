# Task Report: bench-c

## Status

SUCCESS

## Files Touched

- CREATED: Docs/2026-09-19-1829_bench-c_CREATE_bench-content-runs.md
- NOT-TOUCHED-LOCAL: all other repo files (no git command that restores from HEAD — read-only `git rev-parse HEAD` only via prior helper check; helper scripts only under $TEMP\sshwork, outside the repo, new this task: bc-pre.sh, bc1-run.sh, bc1-poll.sh, bc1-ev.sh, bc1-ids.sh, bc1-clean.sh, bc2-run.sh, bc2-poll.sh, bc2-ev.sh, bc2-clean.sh)
- NOT-TOUCHED-BOX: /opt/corvus HEAD (5c6c13409387d9f0f3e17e3815de397ce40a975b, never pulled/built), /opt/corvus/.env (never read or modified — length-only lens: file 32, gateway env 32), pgdata, caddy_data, all other box files, other services (not recreated; gateway used only as documented boss.send host, worker log `builder-worker-started` present at pre-check)
- TRANSIENT-BOX (created then deleted, see Cleanup): per brief N=1..2, one accounts row (discord_id='bench-2026-09-19-c-N', tier='trial'), one bots row (name 'bench-2026-09-19-c-N-bot', status 'draft', dummy token_cipher decode('00','hex')), one builder_runs row. Zero -a-/-b-/-d- rows touched.

## Dependencies Added

None. Reused existing helpers ($TEMP\sshwork run-sh.js + node_modules ssh2 already installed). No installs. No manifest edits.

## Assumptions Made

- Box HEAD verified 5c6c13409387d9f0f3e17e3815de397ce40a975b before any write; status only `?? infra/compose/backups/`; compose ps = web healthy / gateway Up / postgres healthy / caddy Up 18h.
- WIRO lens 32/32 (lengths only, never values); builder worker running (`builder-worker-started` in gateway log tail) — no process started by this task.
- bots.token_cipher dummy `decode('00','hex')` is valid fixture: builder never reads Discord tokens; no real token touched.
- Job contract v2 executed exactly (queue `builder`, payload {runId,botId,brief}, {singletonKey:runId,retryLimit:3,retryDelay:30,expireInSeconds:3600,deleteAfterSeconds:604800}), inside corvus-gateway-1.
- Wall seconds = builder_runs.updated_at minus created_at (box UTC).
- Sequential per contract: C2 fixtures inserted only after C1 cleanup verified 0. Never 2 live jobs at once from this runner.
- USD conversion at USD_PER_CREDIT=0.005 (spec/grader contract).
- No premium-lane drift observed (both runs model `glm/5-2`, billable lane); stop/abort rules never triggered.

## Open Questions for Orchestrator

1. Shape note for the grader (R3): both live specs use `id`-keyed behavior entries with NO `kind` field anywhere. They pass parseSpec (behaviors are opaque z.unknown) but would FAIL checkProductDraft's non-empty-`kind` requirement. C1: 3 entries keyed `id` (welcome.greet_new_member, welcome.assign_member_role, welcome.register_commands). C2: 6 entries keyed `id` (see kinds/ids column + full JSON below). Grader should judge R3 against the pinned rubric (parseSpec product shape 1..20 + kind), which on a strict reading fails both — flagging here so the verdict is deliberate, not missed.
2. FK cascade confirmed again: account delete removed ai_spend + spec_versions rows. Pre-delete snapshots below ARE the evidence; post-hoc DB re-audit not possible.
3. The background poll loop for C1 over-ran (kept polling an already-terminal run); harmless, no extra box writes. C1 terminal was already reached by first poll (~live at updated 15:34:21Z).

## Public Interface Exposed

Builder lane v2 executions observed live (both `live`, model `glm/5-2`, stub false, boss `completed`):

- C1 (= B1 welcome): runId `1b0b0d42-11bb-46de-9935-bba0d6161b34`, jobId `30c72808-b90d-49ba-9c02-76e4644c3476`, botId `5337d258-d90e-408c-8df9-567ff0ab9174`, accountId `b5ceb3ae-0abd-4c1b-b7da-ed230933aaae`
- C2 (= B2 moderation-warn): runId `1c586fbd-8d61-49ef-83ab-2ab98fe7f90d`, jobId `26c44eab-dc7a-4b85-84a4-be4f50ccdb59`, botId `0aed0e92-afd5-477d-81c5-07f0cda74f48`, accountId `9c2dcba5-c825-43ac-af37-c8f80226c4c6`
- Both: terminal detail `{"stub": false, "model": "glm/5-2", "version": 1}`, boss output `{"ok": true, "phase": "live"}`, bot status stayed `draft` (zero Discord publish), 1 ai_spend row + 1 spec_versions row (version 1, state `draft`, author `ai:glm/5-2`) per run, inside billable ceiling (1 call, ≤0.793 credits each).

## Known Limitations

- No UI, login, or Discord publish exercised (by design; bots stayed `draft`).
- No premium-model path touched; stop rule never fired.
- Poll bound (≤10 min) never stressed: C1 wall ~15s, C2 wall ~23s.
- Spend/spec evidence captured pre-delete per brief; cascade removed rows on cleanup.
- Concurrent runner D (bench-d) may have been active on the shared single worker; no queue-wait observed for C runs (C1 terminal on first poll, C2 `generating`→`live` within ~23s). No exactly-once violation: one send per brief, no re-sends.
- Report filename timestamp uses the orchestrator-assigned wave stamp (1829); box evidence timestamps are UTC (~15:34Z, ~15:45Z).

## Per-brief table

| brief              | runId (short) | phase | wall s | calls | credits | spec rows | behavior count | kinds / ids                                                                                                                                                                            | cleaned |
| ------------------ | ------------- | ----- | ------ | ----- | ------- | --------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| C1 welcome         | 1b0b0d42      | live  | 15     | 1     | 0.32892 | 1 (v1)    | 3              | ids: welcome.greet_new_member, welcome.assign_member_role, welcome.register_commands (no `kind` fields)                                                                                | y       |
| C2 moderation-warn | 1c586fbd      | live  | 23     | 1     | 0.793   | 1 (v1)    | 6              | ids: banned-word-detection, banned-word-repeat-delete, register-moderation-commands, add-banned-word-handler, remove-banned-word-handler, list-banned-words-handler (no `kind` fields) | y       |

Total: 2 runs, 2 billable calls, 1.12192 credits ≈ $0.00561 (at 0.005) — far under the $1 abort line. All boss jobs `completed`, all bots stayed `draft`.

## Step-by-step evidence (commands + results, secrets redacted)

Pre-checks (bc-pre.sh, read-only): HEAD `5c6c13409387d9f0f3e17e3815de397ce40a975b`, status only `?? infra/compose/backups/`; compose ps = web healthy / gateway Up / postgres healthy / caddy Up 18h; WIRO_FILE_LEN=32, gateway env len 32, `builder-worker-started` present; own bench-c accounts/bots/runs all 0. STOP conditions clear, wave proceeded.

0. **C1 welcome** (bc1-run/poll/ev/clean.sh): account `b5ceb3ae…` / bot `5337d258…` inserted; run `1b0b0d42…`, job `30c72808…` sent (EXIT 0). First poll already terminal: `live|{"stub": false, "model": "glm/5-2", "version": 1}` / boss `completed|{"ok": true, "phase": "live"}`. Evidence: created 15:34:06Z → updated 15:34:21Z (wall ~15s); ai_spend 1 row, 0.32892 credits, model `glm/5-2`; spec_versions 1 row (v1, state `draft`, author `ai:glm/5-2`, diff_summary = brief verbatim); bot `draft`. Cleanup: DELETE runs 1 / bot 1 / account 1; own accounts 0, own bots 0.
1. **C2 moderation-warn** (bc2-run/poll/ev/clean.sh): account `9c2dcba5…` / bot `0aed0e92…`; run `1c586fbd…`, job `26c44eab…` sent. Poll 1: `generating`/`active`; poll 2 (20s later): terminal `live` / `completed` (created 15:45:18Z → updated 15:45:41Z, wall ~23s). Evidence: ai_spend 1 row, 0.793 credits, `glm/5-2`; spec 1 row (v1, `draft`, `ai:glm/5-2`, diff_summary = brief verbatim); bot `draft`. Cleanup: DELETE 1/1/1; own accounts 0, own bots 0, own runs 0.
2. Final verify (bc2-clean.sh VERIFY-OWN-C): own `-c-` accounts 0, bots 0, runs 0. Box left running; no repo files staged/committed/restored; zero key/token values recorded; zero Discord publish.

## FULL spec JSON — C1 (verbatim, spec_versions.spec WHERE bot_id=5337d258…)

version: 1 | state: draft | author: ai:glm/5-2 | diff_summary: `Create a welcome bot: greet every new member in #general with a friendly message and give them the Member role.`

```json
{
  "version": 1,
  "behaviors": [
    {
      "id": "welcome.greet_new_member",
      "notes": "gateway subscribes to guildMemberAdd; handler module exports onMemberAdd(member)",
      "actions": [
        "resolve #general channel (fetch if partial)",
        "send greeting to #general: `Welcome to the server, <@{member.id}>! 🎉`"
      ],
      "trigger": "guildMemberAdd",
      "conditions": ["member.guild has channel named 'general'"],
      "response_shape": "if channel fetched via API, read resource.message; if event payload, read member.user.username directly"
    },
    {
      "id": "welcome.assign_member_role",
      "notes": "runs alongside greet_new_member; handler must not self-wire client.on",
      "actions": ["find role 'Member' in guild.roles.cache", "member.roles.add(memberRole)"],
      "trigger": "guildMemberAdd",
      "conditions": ["guild has role named 'Member'"]
    },
    {
      "id": "welcome.register_commands",
      "notes": "registration default: per-guild",
      "actions": [
        "register any welcome-related commands per-guild (guildId-specific), never global"
      ],
      "trigger": "bot_ready"
    }
  ]
}
```

Behavior count: 3. Ids: welcome.greet_new_member, welcome.assign_member_role, welcome.register_commands. `kind` fields present: none.

## FULL spec JSON — C2 (verbatim, spec_versions.spec WHERE bot_id=0aed0e92…)

version: 1 | state: draft | author: ai:glm/5-2 | diff_summary: `Build a moderation bot that warns a member the first time they post a banned word and deletes the message.`

```json
{
  "version": 1,
  "behaviors": [
    {
      "id": "banned-word-detection",
      "guard": "store.get('warn:{guildId}:{userId}') is null",
      "actions": [
        { "call": "message.delete", "reason": "banned word detected" },
        {
          "key": "warn:{guildId}:{userId}",
          "ttl": "permanent",
          "call": "store.set",
          "value": "true"
        },
        {
          "call": "channel.send",
          "target": "message.channel",
          "content": "{author.mention}, that word is not allowed here. This is a warning."
        }
      ],
      "trigger": { "event": "messageCreate" },
      "version": 1,
      "condition": "message.content matches any entry in BANNED_WORDS list AND message.author is not a bot AND message.guild is present"
    },
    {
      "id": "banned-word-repeat-delete",
      "guard": "store.get('warn:{guildId}:{userId}') is not null",
      "actions": [{ "call": "message.delete", "reason": "banned word detected (repeat)" }],
      "trigger": { "event": "messageCreate" },
      "version": 1,
      "condition": "message.content matches any entry in BANNED_WORDS list AND message.author is not a bot AND message.guild is present"
    },
    {
      "id": "register-moderation-commands",
      "actions": [
        {
          "call": "commands.register",
          "scope": "guild",
          "guildId": "{guild.id}",
          "commands": [
            {
              "name": "addbannedword",
              "options": [{ "name": "word", "type": "STRING", "required": true }],
              "description": "Add a word to the banned list"
            },
            {
              "name": "removebannedword",
              "options": [{ "name": "word", "type": "STRING", "required": true }],
              "description": "Remove a word from the banned list"
            },
            { "name": "listbannedwords", "description": "List all banned words" }
          ]
        }
      ],
      "trigger": { "event": "guildCreate" },
      "version": 1
    },
    {
      "id": "add-banned-word-handler",
      "actions": [
        { "key": "bannedwords:{guildId}", "call": "store.append", "value": "{options.word}" },
        {
          "call": "interaction.reply",
          "content": "Added '{options.word}' to the banned words list.",
          "ephemeral": true
        }
      ],
      "trigger": { "command": "addbannedword" },
      "version": 1,
      "condition": "interaction.member has MANAGE_MESSAGES permission"
    },
    {
      "id": "remove-banned-word-handler",
      "actions": [
        { "key": "bannedwords:{guildId}", "call": "store.remove", "value": "{options.word}" },
        {
          "call": "interaction.reply",
          "content": "Removed '{options.word}' from the banned words list.",
          "ephemeral": true
        }
      ],
      "trigger": { "command": "removebannedword" },
      "version": 1,
      "condition": "interaction.member has MANAGE_MESSAGES permission"
    },
    {
      "id": "list-banned-words-handler",
      "actions": [
        {
          "call": "interaction.reply",
          "content": "Banned words: {store.get('bannedwords:{guildId}')}"
        }
      ],
      "trigger": { "command": "listbannedwords" },
      "version": 1
    }
  ]
}
```

Behavior count: 6. Ids: banned-word-detection, banned-word-repeat-delete, register-moderation-commands, add-banned-word-handler, remove-banned-word-handler, list-banned-words-handler. `kind` fields present: none.

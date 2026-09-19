# Task Report: reviewer-stage-b

## Status

SUCCESS

## Files Touched

- CREATED: Docs/2026-09-19-1905_reviewer_stage-b.md
- READ-ONLY (never modified): Docs/2026-09-19-1905_orchestrator_SPEC_stage-b.md, Docs/2026-09-19-1905_stage-b_CREATE_live-discord.md, Docs/2026-09-19-1405_box-redeploy-003_CREATE_rebuild-retry.md, apps/gateway/src/gateway.ts, apps/web/app/api/spec/publish/route.ts, apps/gateway/src/preflight/worker.ts, apps/web/lib/invite/permissions.ts, apps/gateway/src/lib/crypto.ts

## Dependencies Added

None. No installs run. No manifest touched.

## Assumptions Made

- Box rows were cleaned by design before this review; pre-delete snapshots inside the stage-b report are the evidence for transient state. No SSH, no box, no git, no network calls were made — anything needing live box data is marked UNVERIFIABLE, never invented.
- Bot user id 1547178080651710524 is a public Discord application id (as the stage-b report states); citing it is not a secret leak. Lengths-only language ("len 72 / len 100") is not a leak.
- The stage-b runner's claim "local HEAD still 5c6c134, status identical pre/post" is taken at face value; verifying it would require git, which this task forbids. The claim is internally plausible (helpers lived under $TEMP\sshwork, outside the repo) but independently UNVERIFIED by this reviewer.

## Open Questions for Orchestrator

1. **DO-NOT-DELETE (safety-critical, see Verdict):** the "throwaway" Discord application id 1547178080651710524 EQUALS the box DISCORD_CLIENT_ID. The stage-b report's OQ-3 advice ("delete the throwaway Discord application in the portal") must be countermanded to the founder explicitly. Recommend: do NOT delete the application; rotate the bot token in the portal later only if wanted.
2. **runId typo:** the stage-b report uses two different runId variants (`d545cdcc-0821-4958-b74c-363c1cdfc5be` on its line 36 vs `d545cdcc-0821-4958-b6f4-c55378220779` on lines 42/56). One of them is a transcription typo. It does not change any leg outcome, but the canonical runId should be confirmed from box-side history only if anyone ever needs to reference it (fixtures are cleaned, so this is cosmetic).
3. **Publish-before-scan ordering:** publish ran before the preflight scan per the spec's leg order, so the audit note is honestly `unscanned`. The later real-guild scan came back red=0, which means a re-publish today would record `preflight-green` — but fixtures are cleaned and the pointer already targeted v1. No re-proof needed unless the grader explicitly demands publish-after-scan.

## Public Interface Exposed

None (review task — no code, no endpoints, no exports).

## Known Limitations

- This review verifies the REPORT against the SPEC and the CODE; it does not re-execute anything on the box. Transient box state (spend rows, spec rows, guild_installs envelope, boss job outputs) is verified only via the report's pre-delete snapshots, which are internally consistent but cannot be re-audited post-cleanup (FK cascade makes post-cleanup re-audit impossible — recorded in the report, accepted).
- Secret-absence was checked by grep for token-shaped values (3-segment long strings) and secret-value assignment patterns in both the report and the spec. Helper scripts under $TEMP\sshwork were NOT inspected (outside read scope, and the runner's grep-clean claim is accepted as stated).
- Code grounding is a spot-check (one cited line per surface), not a full audit.

## VERDICT

### 1. Artifacts exist — PASS

- `Docs/2026-09-19-1905_orchestrator_SPEC_stage-b.md` — present, 10938 bytes.
- `Docs/2026-09-19-1905_stage-b_CREATE_live-discord.md` — present, 15139 bytes.

### 2. Report schema complete — PASS

Status / Files Touched / Dependencies Added / Assumptions Made / Open Questions / Public Interface Exposed / Known Limitations / step-by-step evidence all present. Nothing missing. (Minor: two runId variants, see OQ-2.)

### 3. Secrecy — PASS

- No 3-segment long dot-separated token string in the report or the spec (grep: no match).
- No `bot token=` / password / DATABASE_URL / ENCRYPTION_KEY value lines in either file (grep: no match). The `bot token=` line is referenced by LENGTH only ("len 72 with 2 dots").
- Only lengths and shapes appear (TOKEN_LINE_LEN=72, cipherLen 100, WIRO 32/32, tag redacted to name-len). Bot user id 1547178080651710524 is a public application id — allowed per the task brief.

### 4. Honest scope — PASS

- The report states "Pointer moved, behavior not executed (no runtime interpreter at V1)" verbatim, and "No Discord behavior-execution sentence appears in this report."
- Mentions of "time out a member" occur ONLY as (a) the byte-identical builder BRIEF quote required by the spec, and (b) the preflight ModerateMembers permission-row `why` string. No sentence claims a member was timed out, welcomed, picked, banned, kicked, or had a message deleted as a completed Discord action (grep for execution-patterns: no match).

### 5. APP-ID CROSS-CHECK — EQUAL — DO-NOT-DELETE WARNING (safety-critical)

- Stage-b bot user id: `1547178080651710524` (report lines 20, 34, 55).
- Box DISCORD_CLIENT_ID per redeploy-003 Step 2 env-names line: `1547178080651710524` (redeploy-003 line 67).
- **They are EQUAL.** The "throwaway application" is in fact the founder's Discord OAuth login application (the same client id the box uses for login). **DO NOT DELETE application 1547178080651710524 — deleting it would break Discord OAuth login.** The stage-b report's OQ-3 ("delete the throwaway Discord application in the portal") is dangerous advice as written and must be countermanded to the founder. Correct guidance: box rows are already cleaned and the cipher is gone; rotate the bot token in the portal later only if wanted; leave the application itself in place.

### 6. Leg coverage vs spec acceptance criteria

| Leg        | Criterion                                   | Verdict                                                                                                                                                                                                                                                                                                  |
| ---------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CONNECT    | READY + guild fetch + fetchMe + wall        | **PASS** — `ready:true`, botUserId 1547178080651710524, guild 1051424774426992723 (name len 7, 9 members), fetchMe ok, wall 2.1s, no 4014, no login_failed                                                                                                                                               |
| BUILDER    | ≤1 billable call + terminal live + spec v1  | **PASS** — 1 run, phase `live`, detail `{"stub":false,"model":"glm/5-2","version":1}`, 1 spec row v1 (timestamps 16:17:33–16:17:45Z coherent)                                                                                                                                                            |
| PUBLISH    | pre/post pointer + audit row + Red verdict  | **PASS (honest fallback)** — pre NULL → post `14d2e0f7-…`, audit `ce59ded3-…` `{"version":1,"preflight":"unscanned"}`, 0 envelopes → move allowed, labeled `pointer-move-via-route-SQL (route handler not invoked over HTTP — session seam)`; `unscanned` note consistent with publish-before-scan order |
| PREFLIGHT  | terminal summary + ModerateMembers row tone | **PASS** — job `2bb3b956-…` completed, `{red:0, green:5, yellow:1}`, 6 verbatim rows recorded, ModerateMembers covered inside green "All 5 required permissions are granted."; commands-sync yellow honestly labeled timing, not failure                                                                 |
| RESILIENCE | unknown_bot fail-fast + services healthy    | **PASS** — garbage-botId job → `preflight\|failed\|{"error":"unknown_bot"}`; gateway still Up, all services healthy, test bot untouched                                                                                                                                                                  |
| CLEANUP    | zeros + audit-survivor explained            | **PASS** — bots 0 / runs 0 / specs 0 / stage-b accounts 0 / guild_installs 0 / spend 0\|0 / accounts 0; audit 1 row surviving explained by FK-free schema (matches spec's zero-list, which does not include audit_events)                                                                                |
| SPEND      | ≤$1 at USD_PER_CREDIT=0.005                 | **PASS** — 0.23596 × 0.005 = $0.0011798 ≈ $0.0012, far under cap. Math correct                                                                                                                                                                                                                           |

### 7. Code grounding spot-check — PASS (all five)

- Gateway multiplex-only (`apps/gateway/src/gateway.ts`): public surface is `addBot/removeBot/relogin/quarantine/shutdown/status/getStatus/onLifecycle/startAll/botIds` (lines 104–168); grep for spec/prod_spec/interpreter/behavior finds only generic comments — no spec interpreter. Confirms "pointer moved, behavior not executed."
- Publish guarded UPDATE + audit + Red block (`apps/web/app/api/spec/publish/route.ts`): Red block lines 175–178 (`detectRedFailing` → 409 `preflight-red`); guarded UPDATE lines 195–199 (`prod_spec_id IS NOT DISTINCT FROM $4`); audit insert lines 204–208; 409 stale-draft lines 200–203. Matches the report's "route's EXACT guarded SQL" claim.
- Preflight unknown_bot (`apps/gateway/src/preflight/worker.ts`): fail-fast line 251 (`if (bot === null) return { error: 'unknown_bot' }`); vault SQL lines 19–20; job shape lines 38–45.
- Moderation→ModerateMembers (`apps/web/lib/invite/permissions.ts`): line 67 (`ModerateMembers`, "Timeout Members — so the bot can time members out"); flag line 40 (`ModerateMembers: 1n << 40n`). Bitfield 1099511701510 verified: 2^40 + 65536 + 8192 + 4 + 2 = 1099511627776 + 73734 = 1099511701510. Correct.
- Crypto envelope (`apps/gateway/src/lib/crypto.ts`): AES-256-GCM line 3, IV12/TAG16 lines 4–5, AAD=botId lines 48/67, envelope `[iv,tag,ct]` line 51. Matches the report's "AES-256-GCM IV12 TAG16 AAD=botId" claim.

### 8. Internal consistency — PASS with one cosmetic flag

- Ids used consistently throughout (botId `d0f2533e-…`, spec `14d2e0f7-…`, audit `ce59ded3-…`, jobIds, guild 1051424774426992723, app 1547178080651710524); UTC timestamps coherent (~16:17–16:18Z); cleanup order (builder_runs → guild_installs → bots → accounts) is an honest, explained deviation from the spec's order (extra explicit guild_installs delete); spend math correct.
- FLAG (cosmetic): two runId variants appear (`…b74c-363c1cdfc5be` vs `…b6f4-c55378220779`) — transcription typo, does not affect any leg (see OQ-2).

### Overall: stage-b may be marked DONE — with the DO-NOT-DELETE correction

Every leg passes against the spec's acceptance criteria, secrecy holds, scope is honest, and code grounding confirms the report's claims. Two annotations travel with the DONE: (1) the app-id EQUAL finding — the founder must be told explicitly NOT to delete application 1547178080651710524 (OQ-3 in the stage-b report is unsafe as written); (2) the cosmetic runId typo. Neither invalidates the proof.

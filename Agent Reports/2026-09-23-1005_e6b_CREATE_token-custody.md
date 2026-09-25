# Task Report: expansion-e6b-token

## Status
SUCCESS

## Files Touched
- CREATED: apps/web/app/api/bots/[botId]/token/route.ts
- CREATED: apps/web/app/dashboard/bots/[id]/token/page.tsx
- CREATED: Agent Reports/2026-09-23-1005_e6b_CREATE_token-custody.md (this report)
- MODIFIED: none
- DELETED: none

## Dependencies Added
None (no new dependency; `node:crypto` and `pg` via existing pool only).

## Assumptions Made
- Both CREATE targets were verified absent before writing (route + panel directories did not exist); per the scope guard they were created fresh, nothing overwritten.
- The envelope (AES-256-GCM, iv|tag|ct layout, AAD = bot id, ENCRYPTION_KEY shape: 64 hex chars or base64 of 32 bytes) is duplicated inline in the web route rather than imported, because the web package must not import gateway internals (publish-route contract note); layout mirrors apps/gateway/src/lib/crypto.ts exactly so the web writer and the gateway decrypt reader agree. Any change to the gateway envelope must be mirrored here.
- Empty `token_cipher` (zero-length bytea) is the mint placeholder (no token custody on mint, per bots/route.ts) and resolves to `{ saved: false, length: 0 }` without touching the key.
- POST validates shape only (non-empty, max 2000 chars); token format is not validated — the gateway login is the honest judge of a wrong token.
- `updated_at = now()` on the token UPDATE assumes the `updated_at` column exists on `bots` (matches sibling DDL/test fixtures).

## Open Questions for Orchestrator
- None. No file outside scope needed changes; no production/SSH/keys touched; no installs run.

## Public Interface Exposed
- `POST /api/bots/[botId]/token` — body `{ token: string }`; session + ownership gated (401 / 404-shape, never 403); stores `token_cipher` encrypted (AAD = bot id); answers presence-only `{ saved: true, length: number }`, never the value. Errors: 401 `unauthorized`, 404 `not found` (malformed/foreign/missing share one shape), 422 body/token shape, 500 `token storage not configured` (key missing/malformed) or `could not save token`.
- `GET /api/bots/[botId]/token` — same gates; answers `{ saved: boolean, length: number }` measured by decrypt (length only); never returns cipher bytes or plaintext.
- Exports for tests (same harness idiom as sibling routes): `__setPool`, `__setSessionReader`, `__resetSessionReader`, `encryptToken`, `decryptToken`, `CryptoError`, `validateTokenInput`, `readPresence`, `MAX_TOKEN_CHARS`, `SELECT_TOKEN_SQL`, `OWNED_BOT_SQL`, `UPDATE_TOKEN_SQL`.
- Panel `apps/web/app/dashboard/bots/[id]/token/page.tsx` — paste-token input (`type="password"`, cleared after every save attempt); status card shows `Saved · N characters.` or `No token saved yet.`; panel-only privacy copy (stored encrypted, never shown again, only length displayed); login/missing/retry states; no token value rendered or logged.

## Known Limitations
- No route/panel test file was created: the task scope allowed exactly the two CREATE targets, so verification is typecheck + lint (both green on the full web tree, see below), not a new suite. Reviewer can exercise the hermetic fake-pool harness via the exported seams.
- No live-DB human flow was run in this pass (no session/DB provisioned here); reviewer should run the paste-token flow against a live database.
- Token-bytes-never-logged: verified — no `console.*` calls in either file, token value never in responses/errors/logs/report (presence checked by defined/length only); plaintext exists only in the POST closure and the panel input state (cleared after save).
- Gates run: `tsc -p tsconfig.json --noEmit` exit 0 (full web tree); `eslint .` exit 0 (full web tree, zero warnings).

# KI-032 — `ENCRYPTION_KEY` used in code, missing from `.env.example`

## Status: RESOLVED 2026-09-19 (fix `4aed2ff`, pushed to origin as `3213e37`)

## Resolved

`.env.example` lists `ENCRYPTION_KEY=` with shape-only comments (64 hex OR base64 that decodes to exactly 32 bytes; never a value) + WIRO note reworded. Verified pushed: local `master` == `origin/master` at `3213e37`. Box `/opt/corvus/.env` already held a generated 64-hex key (value never pasted anywhere). Dual-key rotation stays a later task unless the founder orders it.

## History (open state, kept for the trail)

- `apps/gateway/src/lib/crypto.ts` requires a 32-byte key (AES-256-GCM, AAD = bot id). Accepts 64 hex **or** base64 that decodes to exactly 32 bytes.
- `.env.example` **now lists `ENCRYPTION_KEY=`** with shape-only comments (never a value). WIRO note reworded (WIRO_* already listed under V1-2; only CREEM_* still pending).
- Overnight env-032 agent died (`Connection refused`) before writing the example — superseded by this fix. Do not wait for a `0040` report.
- Live box `/opt/corvus/.env` **does** contain a generated 64-hex `ENCRYPTION_KEY` (never paste the value). The example gap was for the _next_ machine, not this one.
- `07` env checklist and `10` §4 mention the key (and dual-key rotation). Dual-key rotation is **docs-only**.

## Close when

Pushed to origin (founder `! git push`) — then mark Resolved in KNOWN_ISSUES with decision/date. `.env.example` lists `ENCRYPTION_KEY=` with shape-only comments (never a value) — DONE locally. Dual-key stays a later task unless the founder orders it. Do not paste real values into the example, chat, or this file.

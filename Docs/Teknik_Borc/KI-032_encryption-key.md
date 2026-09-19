# KI-032 — `ENCRYPTION_KEY` used in code, missing from `.env.example`

## Status: OPEN (P1) — example file still wrong; box already has a key

- `apps/gateway/src/lib/crypto.ts` requires a 32-byte key (AES-256-GCM, AAD = bot id). Accepts 64 hex **or** base64 that decodes to exactly 32 bytes.
- `.env.example` does **not** list `ENCRYPTION_KEY` (verified 2026-09-19 morning). Comment still says “do not add WIRO_* until then” while WIRO_* **are** listed.
- Overnight env-032 agent died (`Connection refused`) before writing the example. Do not wait for a `0040` report.
- Live box `/opt/corvus/.env` **does** contain a generated 64-hex `ENCRYPTION_KEY` (never paste the value). The example gap is for the _next_ machine, not this one.
- `07` env checklist and `10` §4 mention the key (and dual-key rotation). Dual-key rotation is **docs-only**.

## Close when

`.env.example` lists `ENCRYPTION_KEY=` with shape-only comments (never a value). Dual-key stays a later task unless the founder orders it. Do not paste real values into the example, chat, or this file.

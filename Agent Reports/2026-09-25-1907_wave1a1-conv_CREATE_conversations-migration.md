# Task Report: wave1a1-migration

## Status

SUCCESS

## Files Touched

- CREATED: apps/gateway/drizzle/0014_conversations.sql

## Dependencies Added

- None.

## Assumptions Made

- `gen_random_uuid()` is available (pgcrypto present — consistent with existing migrations using uuid PKs).
- No FOREIGN KEY constraints added deliberately: keeps the migration lock-free and avoids guessing the repo's FK style (only one style reference was permitted and it contained no FK examples). Ownership/append-only are enforced in the route layer per the pack contract.
- No `deleted_at` flag on conversations: SPEC states soft-deleted bots are excluded at query time and conversations need no deleted flag.
- `title` and `bot_id` nullable; `account_id` NOT NULL (ownership scope).
- Drizzle journal itself (`meta/_journal.json`) is owned by the orchestrator/toolchain, not touched here.

## Open Questions for Orchestrator

- None.

## Public Interface Exposed

SQL schema only (no code API):

- Table `conversations(id uuid PK, account_id uuid NOT NULL, bot_id uuid NULL, title text NULL, created_at timestamptz, updated_at timestamptz)`
- Table `conversation_turns(id uuid PK, conversation_id uuid NOT NULL, role text NOT NULL, text text NOT NULL, created_at timestamptz)`
- Indexes: `conversations_account_idx(account_id, updated_at DESC)`, `conversations_bot_idx(bot_id)`, `conversation_turns_order_idx(conversation_id, created_at, id)` — the last supports "(created_at, id) ordering + 50-cap" reads in the route layer.

## Known Limitations

- This task covers the migration file ONLY. Route handlers, client lib, rail/hook/thread edits, and tests belong to sibling wave-1 tasks.
- No FK between turns and conversations (see Assumptions); cascade/cleanup semantics, if ever wanted, are a follow-up decision.

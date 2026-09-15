# Corvus

Versioned behavior-spec bots on one multiplexed gateway: each customer's bot
runs from a recipe file (not code), so bots can't break each other; XP, warnings,
and economy persist transactionally in Postgres and survive restarts with zero loss.

## Prereqs

Node.js 24 LTS (`nvm use` / `.nvmrc`) and Docker (for the Postgres service).

## Quickstart

```sh
npm install && npm test
```

Copy `.env.example` to `.env` and fill it in (never commit real values).

## Docs

Start at `Docs/00_START_HERE.md` — it maps every doc and the build plan.

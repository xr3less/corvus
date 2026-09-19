# KI-034 — Unguarded parked routes would ship on first deploy

## Status: OPEN (P1 — source guarded + pushed in `54918cd`, live image not rebuilt)

Committed + pushed 2026-09-19 midday (`b5c9833..3213e37` master→origin via founder `! git push`). **Worktree** pages now `notFound()` when `NODE_ENV==='production'`. Live box image was built before the guards — those URLs still 200 until rebuild.

| Route                    | What it is                                                                                    | Prod guard?                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `/pryzm`                 | Full Pryzm marketing clone (other product). Self-contained since KI-011; copy still verbatim. | **Worktree yes** (`notFound` in production). Live image: no.                                 |
| `/pick`, `/pick/results` | Internal Turkish component picker                                                             | **Worktree yes** on the pages. Vote API already 404s in prod (KI-013). Live image pages: no. |
| `/demo/stats-bento`      | Fake “64% market share”, “+240%”, “4.9 G2”                                                    | **Worktree yes**. Live image: no.                                                            |
| `/clone-pryzm`           | **Gone from source** (07 still documents it — KI-031)                                         | N/A                                                                                          |
| `/demo`                  | Landing-linked interactive demo                                                               | **Intended** — do not treat as a leak                                                        |

## Close when

Parked routes `notFound()` in production (or deleted), **except** `/demo` if it stays a landing CTA. 07 map drops `clone-pryzm`.

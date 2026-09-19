# KI-034 — Unguarded parked routes would ship on first deploy

## Status: OPEN (P1 — guards LIVE in production 2026-09-19; `07` map leg remains)

Rebuilt 2026-09-19 afternoon (box-redeploy-003 from `5c6c134`). Production GETs re-verified off-box this session: `/pryzm` 404, `/pick` 404, `/pick/results` 404, `/demo/stats-bento` 404, `/demo` 200 (intended).

| Route                    | What it is                                                                                    | Prod guard?                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `/pryzm`                 | Full Pryzm marketing clone (other product). Self-contained since KI-011; copy still verbatim. | **Worktree yes** (`notFound` in production). Live image: no.                                 |
| `/pick`, `/pick/results` | Internal Turkish component picker                                                             | **Worktree yes** on the pages. Vote API already 404s in prod (KI-013). Live image pages: no. |
| `/demo/stats-bento`      | Fake “64% market share”, “+240%”, “4.9 G2”                                                    | **Worktree yes**. Live image: no.                                                            |
| `/clone-pryzm`           | **Gone from source** (07 still documents it — KI-031)                                         | N/A                                                                                          |
| `/demo`                  | Landing-linked interactive demo                                                               | **Intended** — do not treat as a leak                                                        |

## Close when

Parked routes `notFound()` in production (or deleted), **except** `/demo` if it stays a landing CTA. 07 map drops `clone-pryzm`.

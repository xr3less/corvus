# KI-030 — Public pages sell a paid live Discord bot that is not wired

## Status: OPEN (P0 honesty)

Filed 2026-09-19. Do not put strangers on `/` + `/dashboard` until this is fail-empty or real.

## Landing (`apps/web/app/page.tsx`)

| Copy                                        | Target        | Reality                                                                                                   |
| ------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------- |
| Start 3-Day Free Trial                      | `/dashboard`  | No trial clock, no 3-day, no sleep                                                                        |
| Upgrade to Pro                              | `/dashboard`  | No Creem, no checkout                                                                                     |
| Select Studio Plan                          | `/dashboard`  | Same                                                                                                      |
| Cancel anytime with a single click          | under Pro CTA | Cancel does not exist                                                                                     |
| FAQ: never store your password **or token** | —             | Password true (OAuth). Token: fleet vault intent (D-038) + `token_cipher` column. Mint writes empty `\x`. |

## Dashboard rail (`apps/web/components/ui/dashboard-rail.tsx`)

- Fake `Pro` pill on every visitor.
- `Credits 82/100` from hardcoded `CREDITS_USED` / `CREDITS_TOTAL` in `apps/web/lib/bots.ts`. No “(example)” on the visible line.
- Upgrade button is **honest**: disabled “Coming soon”.

## Silent mock fallback

- `fetchBots()` never throws. 401 / 500 / network → `MOCK_BOTS` (Study Hall, 1,240 members). Home/rail do not mark credits as example.
- Gallery starts on `MOCK_TEMPLATES` and keeps them if `/api/templates` fails (visible “412 forks”; “(example)” is aria-only).
- APIs themselves fail-fast. The lie is the **page fallback**.

## Publish ≠ live Discord

- `POST /api/spec/publish` moves `prod_spec_id` + audit. Does not set `status = live`, encrypt a token, or start a client.
- `encryptToken()` is test-only. Gateway `boot()` does not `addBot` a real fleet.
- Invite is the **shared** Discord app (`DISCORD_CLIENT_ID`), not a per-user bot.

## Close when

- Paid CTAs are disabled or go to a real checkout.
- Unauthenticated / failed-DB UI is empty, not a fake Pro account.
- FAQ token sentence matches custody (we hold fleet tokens; user never pastes one).
- “Published” cannot be read as “live on Discord” until it is.

# 09 — Auth & Billing

## Status: DRAFT (filled 2026-09-07 — auth locked D-006-adjacent, billing locked D-009/D-011/D-013/D-014)

> **DRIFT (2026-09-19, KI-031 / KI-030 / KI-033 / KI-016):** §1 auth (Discord OAuth + cookie sessions) is **built**. §3–5 money path is **not**: no Creem wiring, no `credit_ledger` / `subscriptions` tables, no checkout, no trial clock, no DPA page. `support@corvus.ai` is an assumption. Landing still sells the unpaid plans (KI-030). Detail: `Teknik_Borc/KI-031_docs-stale.md`, `Teknik_Borc/KI-030_honesty.md`, `Teknik_Borc/KI-033_trial-unenforced.md`.

> Login + money. Standalone and simple; nothing clever before validation.

---

## 1. Authentication

| Aspect                   | Choice                                                                                                             | Why                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Method                   | Discord OAuth2 only (V1)                                                                                           | Only identity our users all have; one click; no passwords to breach. Recovery email attached at signup for lockout/account-loss cases |
| Session handling         | HttpOnly secure cookie sessions, server-side store (Postgres); 30-day rolling                                      | No JWT-in-localStorage; revocation is a DB row; OAuth state + interview progress durable since V1-2 (KI-002)                          |
| Password/secret storage  | No passwords exist. Bot tokens AES-256-GCM envelope-encrypted, per-bot, never logged; decrypt only in owning shard | Token custody is the product's trust core (D-006)                                                                                     |
| Team access (V1 minimal) | Owner-only until V1-2+ (Editor matrix deferred — one invite row exists in no table yet; tracked in PLAN)           | Full matrix (viewer/audit) is V2                                                                                                      |

---

## 2. Authorization

Bot-level: owner > editor > viewer (V2 full). Server-level: Corvus never needs Discord Administrator — least-privilege invite computed from enabled behaviors (D-006); per-permission why-lines shown. Admin endpoints (quarantine, refunds) are orchestrator-only, never exposed to tenants.

---

## 3. Billing

| Aspect            | Choice                                                                                                                                                                                                                             | Why                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Provider          | Creem.io Merchant-of-Record, Test Mode until review passes (D-014; brother holds the account)                                                                                                                                      | TR payout works; subs+packs+trials+webhooks cover the ledger; ~$0.79 per $10 charge priced into tiers |
| What's billed     | Subscriptions (Pro $10, Studio $29) + $5 refill packs (1000 cr, 90d)                                                                                                                                                               | No meter, no surprise bills; credits are the single value metric                                      |
| Free tier / trial | 3-day full-Pro trial, 1 bot, 100 credits, NO card (D-011, app-owned per D-034 — no Creem object exists until the paid-upgrade checkout; Creem-managed trials require a card); day 4 pay-or-sleep, 12-mo data keep, wake on upgrade | Strictly easier than the competitor's card-wall + auto-charge + deletion threat                       |

---

## 4. Webhooks & edge cases

Creem events drive the ledger (checkout.completed, subscription created/paid/updated/past_due/unpaid/expired/canceled, refund.created, dispute.*) with HMAC verification + idempotency keys + backoff retries. Trial creates NO Creem object — trial state lives in our DB only; the first Creem event for a user is the upgrade checkout (D-034). Missed-event safety: nightly reconciler compares Creem subscription state vs local `subscriptions` table and repairs drift; allowance grants are ledger rows, never in-memory flags. Failed renewal → plan stays until period end, then falls back to sleep (NEVER deletes). Dispute → freeze AI spend, keep bot online, human review within 3 business days (MoR SLA).

---

## 5. Security & compliance notes

Sensitive data lives in: Postgres (OAuth IDs, configs, XP — EU box), secret store (tokens, encrypted), Creem (cards — WE NEVER TOUCH THEM), logs (no tokens, no message content). We explicitly do NOT store: card numbers, Discord passwords, member message content (unless an opted-in behavior needs it, then per-guild retention + owner-visible toggle). GDPR minimum: Privacy + DPA published before paid launch (Discord verification at 75+ servers requires a public privacy URL), sub-processors listed (Contabo/Hetzner, Creem, AI providers), 72h breach notice, access/delete via dashboard + support email.

// POST /api/webhooks/creem — Creem event receipt, and the ONLY writer of
// accounts.tier in the product.
//
// Contract shape from the live docs (not memory):
//   https://docs.creem.io/code/webhooks              (creem-signature header =
//     HMAC-SHA256 of the RAW request body, hex; 5 delivery attempts — initial
//     then 30s/5min/30min/6h; the same event CAN arrive more than once, so the
//     handler must be idempotent; no static source IPs, so the signature is the
//     only authenticator)
//   https://docs.creem.io/api-reference/introduction (event list; test vs live
//     are fully isolated)
//
// The order of operations IS the design, so it is stated once and obeyed:
//   1. Config first. No CREEM_WEBHOOK_SECRET -> honest 503 and nothing else
//      happens: we cannot authenticate a request we hold no key for.
//   2. Raw text BEFORE any parse — request.text(), never request.json(). The
//      signature covers the exact bytes Creem sent; a parse-then-reserialize
//      round trip can reorder keys and change whitespace, which would break
//      verification of every payload it touched.
//   3. Verify in constant time. A bad signature is a 400 with ZERO state change:
//      no receipt, no ledger row, no tier write.
//   4. Only then parse — parsing after authentication means parsing input we
//      trust rather than input a stranger chose.
//   5. Grant-vs-lifecycle is decided purely, before any database work, so an
//      authenticated event we cannot honour refuses LOUDLY (500, no receipt)
//      instead of committing a receipt that would swallow Creem's retry.
//      ACCESS and CREDITS are two separate decisions: an access event writes the
//      subscription and the tier, a payment event also writes the ledger, and the
//      events Creem fires for ONE purchase are not interchangeable — see
//      isCreditEvent and creditKeyFor.
//   6. ONE transaction: the receipt is inserted first (event_id is the primary
//      key, ON CONFLICT DO NOTHING), and when that insert changes nothing the
//      event is a replay -> 200 immediately with no further work. Because the
//      receipt and the work it authorises commit together or not at all, a retry
//      after a rolled-back attempt genuinely retries instead of being answered
//      as a duplicate of work that never happened.
//
// Money rules:
//   - accounts.tier is written from the PRODUCT id (a dashboard-created value
//     that reaches us only as an env VALUE read by NAME) and by no other route.
//     The sibling redirect routes deliberately never touch it: a browser
//     redirect is user-controlled input and can never be a grant.
//   - The join key is metadata.accountId, NEVER the customer email. The email is
//     not a key we minted and cannot bind a payment to an account. The Creem
//     customer id (accounts.creem_id) and the subscription id are recorded as
//     provider references on the account and the subscription row.
//   - ONE PURCHASE IS ONE GRANT. Creem sends checkout.completed,
//     subscription.active and subscription.paid for a single payment, each with
//     its own event id, so the receipt cannot deduplicate them against each
//     other. Crediting per access event would grant 3x the allowance for one
//     charge; the ledger is therefore written only by the payment event and
//     keyed on the payment identity (isCreditEvent / creditKeyFor).
//   - past_due / unpaid / expired / paused / canceled / scheduled_cancel record
//     the provider's status and change nothing else. No incoming event removes
//     money or access here: the plan holds until the period ends and the expiry
//     logic puts the bot to sleep (Docs/09 §4/§40). A failed renewal is not a
//     downgrade.
//
// Secrets: CREEM_WEBHOOK_SECRET and the product ids are read by NAME only. No
// value is ever logged, echoed, or placed in a response body — and neither is
// the raw payload, since the caller is Creem and a webhook response is not a
// place to hand back what we were sent.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { Pool } from 'pg';
import { MONTHLY_GRANTS, type PlanTier } from '@corvus/ai';
import { getPool, mapDbError } from '@/lib/db/pool';
import { isUuid } from '@/lib/editor/drafts';

// Re-exported so route tests inject a fake pool without touching env vars
// (mirrors app/api/chat/route.ts and app/api/simulate/route.ts).
export { __setPool, __resetPool } from '@/lib/db/pool';

/* --- Event classification (verbatim provider vocabulary) ------------------- */

// Access-granting events: every event that means "this account now has this
// plan". All three write subscription + accounts.tier, which is idempotent
// (the tier update is IS DISTINCT FROM, the subscription upsert converges), so
// a repeated access grant costs nothing. CREDITS ARE A DIFFERENT QUESTION, and
// these three events are NOT three payments — see isCreditEvent.
//
// Creem fires all three for ONE purchase (checkout.completed for the session,
// subscription.active "when a new subscription is created", subscription.paid
// "when the payment was collected"), and each carries its own distinct event id,
// so the receipt gate cannot deduplicate them against each other. Crediting every
// access event would hand a $10 Pro buyer 3 x 2000 credits for one payment.
export const GRANT_EVENTS: ReadonlySet<string> = new Set([
  'checkout.completed',
  'subscription.active',
  'subscription.paid',
]);

// Status-only events. None of these may downgrade a tier: they are recorded so
// the reconciler and the (deferred, KI-035) sleep logic can see what the
// provider said, and nothing else.
export const LIFECYCLE_EVENTS: ReadonlySet<string> = new Set([
  'subscription.canceled',
  'subscription.scheduled_cancel',
  'subscription.past_due',
  'subscription.unpaid',
  'subscription.expired',
  'subscription.paused',
  'subscription.trialing',
  'subscription.update',
  'refund.created',
  'dispute.created',
]);

export type EventKind = 'grant' | 'lifecycle' | 'other';

// An unrecognised type is 'other': its receipt is still recorded (so a replay is
// still a no-op and we can see what Creem sent), but it authorises no work. A
// future event type therefore arrives inert rather than being guessed at.
export function eventKind(type: string): EventKind {
  if (GRANT_EVENTS.has(type)) return 'grant';
  if (LIFECYCLE_EVENTS.has(type)) return 'lifecycle';
  return 'other';
}

/**
 * Whether this event OWES a credit grant — i.e. whether it describes money that
 * was collected and has not been counted yet.
 *
 * Creem fires several events per purchase, so "is this an access event" and "is
 * this a payment" are different questions and only the second may touch the
 * ledger:
 *
 *   subscription.paid   yes — Creem's own payment event, emitted per collection
 *                       (so a renewal grants again on the same subscription).
 *   checkout.completed  only for a ONE-TIME purchase (no subscription attached);
 *                       a subscription checkout is credited when its payment
 *                       event arrives, and the two keys never collide because
 *                       this branch requires subscriptionId to be absent.
 *   subscription.active NO. Its doc says "Use only for synchronization, we
 *                       encourage using subscription.paid for activating
 *                       access" — the money it announces is credited on the
 *                       payment event, not here.
 *
 * The invariant the handler relies on: if this returns true, creditKeyFor MUST
 * return a key, or the event is refused without a receipt (a payment we cannot
 * identify must reach a human, not a ledger row).
 */
export function isCreditEvent(event: CreemEvent): boolean {
  if (event.type === 'subscription.paid') return true;
  if (event.type === 'checkout.completed') {
    return event.subscriptionId === null && event.paid;
  }
  return false;
}

/**
 * THE CREDIT KEY — what makes one PAYMENT count once, whatever events it causes.
 *
 * The receipt gate keys on the Creem event id, and ONE purchase legitimately
 * produces several events with different ids. From the live payload samples
 * (docs.creem.io/code/webhooks.md), for a single subscription purchase:
 *
 *   checkout.completed   evt_5WHH…  object=checkout      order(paid) + sub id, NO period
 *   subscription.active  evt_6Ept…  object=subscription  sub id only
 *   subscription.paid    evt_21mO…  object=subscription  sub id + period + tran id
 *
 * Crediting each of those would hand a $10 Pro buyer 3 x 2000 credits. Note also
 * that the fields they carry DIFFER, so no single fallback chain over "whatever
 * ids are present" can collapse them onto one key — three events, three different
 * keys, three grants. The only sound fix is to credit ONE of them: the payment
 * event. isCreditEvent decides which; this decides what to key it on.
 *
 * Key order is most-specific-first, and every fallback is a field that a
 * redelivery or a sibling event for the SAME payment also carries:
 *
 *   tran:<transactionId>  the provider's id for one collection — the most precise
 *                         key there is, and the one that makes a renewal grant
 *                         again on the same subscription.
 *   sub:<subId>:<period>  the billing period, when the transaction id is absent.
 *                         A renewal advances current_period_start_date.
 *   order:<orderId>       a one-time purchase's unit of purchase.
 *   chk:<checkoutId>      last resort, so a checkout with no order recorded still
 *                         cannot double-count.
 *
 * Returns null ONLY when a credit is owed and nothing identifies it — the handler
 * refuses that loudly, with no receipt, so it stays visible in the dashboard.
 */
export function creditKeyFor(event: CreemEvent): string | null {
  if (event.transactionId !== null) {
    return `tran:${event.transactionId}`;
  }
  if (event.subscriptionId !== null && event.periodStart !== null) {
    return `sub:${event.subscriptionId}:${event.periodStart}`;
  }
  if (event.orderId !== null) {
    return `order:${event.orderId}`;
  }
  if (event.checkoutId !== null) {
    return `chk:${event.checkoutId}`;
  }
  return null;
}

/**
 * A deterministic uuid for a grant key: sha256(key), formatted as a uuid.
 *
 * No I/O and no randomness on purpose — the whole point is that the same payment
 * computes the SAME uuid in every delivery, on every process, so the unique index
 * on (ref_id, reason, attempt) can recognise the second insert as a duplicate.
 * A random uuid would defeat that. The version/variant nibbles are set to a
 * well-formed v4 shape so the value is a valid uuid by construction rather than
 * by luck (and 0011's ref_id column is uuid, so a malformed value would be a
 * driver error rather than a clean insert).
 */
export function grantRefId(grantKey: string): string {
  const digest = createHash('sha256').update(grantKey).digest('hex');
  const version = `4${digest.slice(13, 16)}`;
  const variant = ((parseInt(digest.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return (
    `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${version}-` +
    `${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`
  );
}

/* --- Payload parsing (pure; no I/O, no env reads) -------------------------- */

export interface CreemEvent {
  /** Provider event id — the idempotency key (webhook_receipts.event_id). */
  id: string;
  type: string;
  /** metadata.accountId, and only when it is a real uuid. The ONLY join key. */
  accountId: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  productId: string | null;
  /** The order the payment created (present on purchases, not on pure status). */
  orderId: string | null;
  /** The checkout session id, when the event nests one. */
  checkoutId: string | null;
  /**
   * The provider's transaction id — its identity for ONE collected payment
   * (`last_transaction_id` on subscription.paid, `transaction.id` on a refund or
   * dispute). This is the most precise credit key there is: a renewal is a new
   * transaction, so it grants again on the same subscription.
   */
  transactionId: string | null;
  /** The subscription status verbatim, or null when the payload carries none. */
  status: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  /**
   * Whether this event represents a COLLECTED PAYMENT (as opposed to a status
   * change). A checkout only counts once its order status is 'paid', so a
   * checkout that was completed but whose payment has not settled cannot grant.
   */
  paid: boolean;
}

export type ParsedEvent =
  { ok: true; value: CreemEvent } | { ok: false; status: 400; error: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

// Creem nests the same thing two ways depending on the event: an expanded
// object (`"customer": { "id": "cust_…" }`, which checkout.completed and
// subscription.paid send) or a bare id string (`"product": "prod_…"`, which
// subscription.active and dispute.created send). Both shapes are in the docs'
// own samples, so both are read here rather than assuming one.
function readId(value: unknown): string | null {
  const direct = asNonEmptyString(value);
  if (direct !== null) return direct;
  const record = asRecord(value);
  return record === null ? null : asNonEmptyString(record['id']);
}

function readMetadataAccountId(record: Record<string, unknown> | null): string | null {
  if (record === null) return null;
  const metadata = asRecord(record['metadata']);
  if (metadata === null) return null;
  const raw = asNonEmptyString(metadata['accountId']);
  // Anything that is not a uuid is not our join key. It is dropped rather than
  // passed on, so a malformed metadata value cannot reach a uuid column and
  // surface as a driver error that looks like an outage.
  return raw !== null && isUuid(raw) ? raw : null;
}

/**
 * Structural parse of one Creem webhook payload. Returns an allowlisted shape
 * rather than the raw object: nothing downstream reads a field this function did
 * not name, so a payload field we never considered cannot leak into a query, a
 * log or a response.
 */
export function parseCreemEvent(value: unknown): ParsedEvent {
  const root = asRecord(value);
  if (root === null) {
    return { ok: false, status: 400, error: 'payload must be a JSON object' };
  }
  const id = asNonEmptyString(root['id']);
  if (id === null) {
    return { ok: false, status: 400, error: 'payload must carry an event id' };
  }
  const type = asNonEmptyString(root['eventType']);
  if (type === null) {
    return { ok: false, status: 400, error: 'payload must carry an eventType' };
  }
  const object = asRecord(root['object']);
  if (object === null) {
    return { ok: false, status: 400, error: 'payload must carry an object' };
  }

  // The subscription, whether the event's object IS one (subscription.*) or
  // nests one (checkout.completed, refund.created, dispute.created).
  const isSubscriptionObject = object['object'] === 'subscription';
  const subscription = isSubscriptionObject ? object : asRecord(object['subscription']);

  // Status must come from a subscription: a checkout's own `status` is
  // 'completed', which is not a subscription status and must never be written
  // into subscriptions.status.
  const status = subscription === null ? null : asNonEmptyString(subscription['status']);

  // The checkout carries its own metadata; a nested subscription carries its
  // own. Either may hold our join key, so both are consulted, checkout first.
  const accountId = readMetadataAccountId(object) ?? readMetadataAccountId(subscription);

  // The product id, in both shapes the docs' samples use: expanded on the event
  // object (checkout.completed, subscription.paid, subscription.active all send
  // `"product": { "id": "prod_…" }`), or only on the nested subscription as a
  // bare string (dispute.created, refund.created). readId handles both, and the
  // nested subscription is consulted only when the object carries none.
  const productId =
    readId(object['product']) ?? (subscription === null ? null : readId(subscription['product']));

  // The order and checkout that this event is about, in both shapes: a checkout
  // event nests `order`, while a subscription event carries the order only in
  // its transaction/id fields. readId takes either.
  const order = asRecord(object['order']);
  const orderId = order === null ? null : asNonEmptyString(order['id']);

  // Whether a payment was actually COLLECTED. An order that exists and is not
  // 'paid' has not settled (a checkout can complete while its order is still
  // pending), and a checkout with no order at all has collected nothing — so
  // neither may grant credits. A subscription.paid event is paid by definition.
  const orderStatus = order === null ? null : asNonEmptyString(order['status']);
  const paid = type === 'subscription.paid' || orderStatus === 'paid';

  // The provider's per-payment id, in both shapes the samples use:
  // `last_transaction_id` on a subscription, or a nested `transaction` object
  // (refund.created, dispute.created). readId takes either.
  const transactionId =
    asNonEmptyString(object['last_transaction_id']) ?? readId(object['transaction']);

  return {
    ok: true,
    value: {
      id,
      type,
      accountId,
      customerId: readId(object['customer']),
      subscriptionId: isSubscriptionObject
        ? asNonEmptyString(object['id'])
        : readId(object['subscription']),
      productId,
      orderId,
      checkoutId: isSubscriptionObject ? null : asNonEmptyString(object['id']),
      transactionId,
      status,
      periodStart:
        subscription === null ? null : asNonEmptyString(subscription['current_period_start_date']),
      periodEnd:
        subscription === null ? null : asNonEmptyString(subscription['current_period_end_date']),
      paid,
    },
  };
}

/* --- Tier resolution (product id -> plan) ---------------------------------- */

// Product ids are created in the Creem dashboard, not in code, so each one
// reaches us only as an env VALUE read by NAME. No value is defaulted and no
// placeholder is invented: an unmapped product resolves to null and the route
// refuses loudly rather than guessing a tier from a price or a name.
const PRODUCT_ENV_BY_TIER: Record<'pro' | 'studio', string> = {
  pro: 'CREEM_TEST_PRODUCT_PRO',
  studio: 'CREEM_TEST_PRODUCT_STUDIO',
};

const MAPPABLE_TIERS: readonly ('pro' | 'studio')[] = ['pro', 'studio'];

export function planTierForProduct(productId: string | null): PlanTier | null {
  const id = asNonEmptyString(productId);
  if (id === null) return null;
  for (const tier of MAPPABLE_TIERS) {
    const configured = (process.env[PRODUCT_ENV_BY_TIER[tier]] ?? '').trim();
    if (configured !== '' && configured === id) return tier;
  }
  return null;
}

/** The refill product id, dashboard-created like the tier products: read by NAME, never defaulted. */
export function refillProductId(): string {
  return (process.env.CREEM_TEST_PRODUCT_REFILL ?? '').trim();
}

/**
 * True only when the event's product is the configured refill pack — the $5 /
 * 1,000-credit / 90-day pack the terms promise. Never matches on an empty
 * config (an unset product env means no refill exists to buy). A refill
 * purchase extends the allowance only and never moves a tier.
 */
export function isRefillProduct(productId: string | null): boolean {
  const id = asNonEmptyString(productId);
  if (id === null) return false;
  const configured = refillProductId();
  return configured !== '' && configured === id;
}

/* --- Signature verification ------------------------------------------------ */

const SIGNATURE_HEX = /^[0-9a-f]{64}$/;

/**
 * Constant-time check of the `creem-signature` header: HMAC-SHA256 over the raw
 * body, keyed by the webhook secret, hex-encoded. An optional `sha256=` prefix
 * is tolerated (a common header convention) and the digest is lowercased before
 * comparison, so a differently-cased digest from the provider cannot be read as
 * a forgery.
 */
export function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  const received = (header ?? '')
    .trim()
    .toLowerCase()
    .replace(/^sha256=/, '');
  if (!SIGNATURE_HEX.test(received)) {
    // Wrong shape, wrong length, empty, or absent: never a match. Length is not
    // secret, so rejecting on it leaks nothing.
    return false;
  }
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  // Both sides are 64 hex characters by construction, so the buffers are equal
  // length and timingSafeEqual cannot throw.
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
}

/** Content hash of the raw body, for the receipt's payload_hash audit column. */
export function payloadHash(rawBody: string): string {
  return createHash('sha256').update(rawBody).digest('hex');
}

/* --- Statements (exported so tests assert the real SQL, not a mock's) ------ */

const EVENT_ID_COLUMN = 'event_id';

// Row-level replay protection: the primary key does the deduplication, and
// DO NOTHING (not DO UPDATE) is what makes a replay free — nothing is rewritten,
// so a duplicate cannot refresh a timestamp and look like fresh work.
export const INSERT_RECEIPT_SQL =
  'INSERT INTO webhook_receipts (event_id, type, payload_hash) VALUES ($1, $2, $3)' +
  ` ON CONFLICT (${EVENT_ID_COLUMN}) DO NOTHING`;

// THE credit gate — exactly-once per payment, enforced by the DATABASE rather
// than by this process's logic.
//
// 0011's partial unique index covers (ref_id, reason, attempt) where both ref_id
// and attempt are NOT NULL, and its comment notes that Creem-driven rows were
// left outside it (no uuid ref, no attempt). This writer deliberately puts them
// INSIDE it, because the index is the only mechanism available that survives
// concurrent delivery: the events for one purchase arrive as separate requests,
// so an application-level "have I granted this yet?" read is a check-then-act
// race that two simultaneous deliveries can both win — and the loser's prize is
// 2000 free credits.
//
// So: ref_id is a DETERMINISTIC uuid derived from the grant key (same payment ->
// same uuid, computed with no I/O), attempt is fixed at 1, and DO NOTHING makes
// the second insert a no-op. rowCount 0 therefore means "this payment's credits
// were already granted", which the handler treats as success without a second
// movement. attempt=1 is a deliberate deviation from 0011's "grants carry no
// attempt" convention — flagged as an open question in the task report.
export const INSERT_GRANT_SQL =
  'INSERT INTO credit_ledger (account_id, ref_id, reason, attempt, amount_cr, meta)' +
  ' VALUES ($1, $2, $3, 1, $4, $5)' +
  ' ON CONFLICT (ref_id, reason, attempt) WHERE ref_id IS NOT NULL AND attempt IS NOT NULL' +
  ' DO NOTHING';

export const GRANT_REASON = 'monthly_grant';

/** Fixed attempt number for a webhook grant (see INSERT_GRANT_SQL). */
export const GRANT_ATTEMPT = 1;

/** Ledger reason + grant for the $5 / 1,000-credit / 90-day refill pack
 * (terms promise, Docs/06 closed vocabulary). */
export const REFILL_REASON = 'refill';
export const REFILL_CREDITS = 1000;

// One subscription row per account (account_id is the primary key). The grant
// path states the tier the provider just confirmed; COALESCE keeps a known Creem
// id when a later payload omits it rather than blanking it.
export const UPSERT_SUBSCRIPTION_SQL =
  'INSERT INTO subscriptions (account_id, tier, creem_subscription_id, status, updated_at)' +
  ' VALUES ($1, $2, $3, $4, now())' +
  ' ON CONFLICT (account_id) DO UPDATE SET' +
  ' tier = EXCLUDED.tier,' +
  ' creem_subscription_id = COALESCE(EXCLUDED.creem_subscription_id, subscriptions.creem_subscription_id),' +
  ' status = EXCLUDED.status,' +
  ' updated_at = now()';

// The lifecycle path is the same statement MINUS the tier assignment: a status
// event must never move a plan. The insert branch's literal tier only applies
// when no row exists yet, and 0011 is explicit that a row created before a plan
// is known is not a claim of payment.
export const UPSERT_SUBSCRIPTION_STATUS_SQL =
  'INSERT INTO subscriptions (account_id, tier, creem_subscription_id, status, updated_at)' +
  " VALUES ($1, 'trial', $2, $3, now())" +
  ' ON CONFLICT (account_id) DO UPDATE SET' +
  ' creem_subscription_id = COALESCE(EXCLUDED.creem_subscription_id, subscriptions.creem_subscription_id),' +
  ' status = EXCLUDED.status,' +
  ' updated_at = now()';

// The one line that makes an account paid. IS DISTINCT FROM keeps a replayed or
// downgrade-free event from rewriting a row it would not change (rowCount 0 =
// "already this tier"), and there is no event in the grant set that could move a
// tier down — the downgrade-capable events are all status-only.
export const SET_PAID_TIER_SQL =
  'UPDATE accounts SET tier = $2 WHERE id = $1 AND tier IS DISTINCT FROM $2';

// accounts.creem_id is the Creem CUSTOMER id (06_data_model: "set at first paid
// event"). COALESCE keeps the id we already hold: the first paying customer is
// the one the account is bound to, and a later event carrying a different
// customer must not silently re-point the account's billing identity.
export const SET_CREEM_CUSTOMER_SQL =
  'UPDATE accounts SET creem_id = COALESCE(creem_id, $2) WHERE id = $1';

/* --- Transaction plumbing -------------------------------------------------- */

interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rowCount: number | null; rows: unknown[] }>;
}

// BEGIN/COMMIT/ROLLBACK around one unit of work on ONE connection — a
// transaction spread across pooled connections is not a transaction. A failing
// ROLLBACK never replaces the original error, which is the one worth reporting.
async function withTransaction<T>(pool: Pool, work: (client: Queryable) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Swallowed on purpose: the caller needs the original failure.
    }
    throw error;
  } finally {
    client.release();
  }
}

/* --- Handler --------------------------------------------------------------- */

function refuse(error: string, status: number): NextResponse {
  // Never a payload echo, never a secret, never upstream detail: an error code
  // the dashboard can show and a grep can find.
  return NextResponse.json({ error }, { status });
}

function accepted(duplicate: boolean): NextResponse {
  return NextResponse.json(duplicate ? { received: true, duplicate: true } : { received: true });
}

export async function POST(req: Request): Promise<NextResponse> {
  // 1. Config, before touching the request. A missing secret is an honest 503:
  //    we cannot verify anything, so we record nothing and let Creem retry —
  //    which is exactly what should happen once the secret is configured.
  const secret = (process.env.CREEM_WEBHOOK_SECRET ?? '').trim();
  if (secret === '') {
    return refuse('webhook_unavailable', 503);
  }

  // 2. Raw body, unparsed. The signature covers these exact bytes.
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return refuse('invalid_body', 400);
  }

  // 3. Authenticate. Failing here is a 400 with no state change at all.
  if (!verifySignature(rawBody, req.headers.get('creem-signature'), secret)) {
    return refuse('invalid_signature', 400);
  }

  // 4. Parse (authenticated input).
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return refuse('invalid_payload', 400);
  }
  const parsed = parseCreemEvent(payload);
  if (!parsed.ok) {
    return refuse('invalid_payload', parsed.status);
  }
  const event = parsed.value;
  const kind = eventKind(event.type);

  // 5. Pure preconditions, before the transaction. A grant we cannot attribute
  //    is a payment we must not silently swallow, so it refuses with no receipt:
  //    Creem retries it 5 times and shows it red in the dashboard, which is the
  //    visible failure a misconfigured join key deserves. Nothing is owed by an
  //    unattributable status event, so that path records the receipt and stops.
  let tier: PlanTier | null = null;
  let creditKey: string | null = null;
  let isRefill = false;
  if (kind === 'grant') {
    if (event.accountId === null) {
      return refuse('grant_target_missing', 500);
    }
    // A refill purchase never moves a tier: it extends the allowance only. The
    // refill product is checked first, so no tier is resolved and no
    // tier/subscription write is authorised for it.
    isRefill = isRefillProduct(event.productId);
    if (!isRefill) {
      tier = planTierForProduct(event.productId);
      if (tier === null) {
        return refuse('product_unmapped', 500);
      }
    }
    // The credit unit is a PAYMENT, not an event (see isCreditEvent): one
    // purchase arrives as several access events with different ids, and only the
    // payment event may touch the ledger. A payment with nothing to key on is
    // refused here, BEFORE the receipt — a receipt would swallow Creem's retry
    // and hide the problem instead of surfacing it for a human.
    if (isCreditEvent(event)) {
      creditKey = creditKeyFor(event);
      if (creditKey === null) {
        return refuse('credit_reference_missing', 500);
      }
    }
  }

  // 6. One transaction. Receipt first.
  try {
    const duplicate = await withTransaction(getPool(), async (client) => {
      const receipt = await client.query(INSERT_RECEIPT_SQL, [
        event.id,
        event.type,
        payloadHash(rawBody),
      ]);
      if ((receipt.rowCount ?? 0) === 0) {
        return true; // Replay: the receipt already existed. No further work.
      }

      if (kind === 'grant' && event.accountId !== null && (tier !== null || isRefill)) {
        const accountId: string = event.accountId;
        if (isRefill) {
          // A refill extends the allowance only: no subscription row, no tier
          // move, no customer rebind. Only the collected-payment event owns a
          // ledger row (creditKey !== null); the other access events for the same
          // purchase record their receipt and stop. The refill row reuses the
          // same deterministic ref_id + partial-unique ON CONFLICT DO NOTHING
          // exactly-once idiom as the plan grant — the reason distinguishes the
          // two namespaces, so a refill can never collide with a plan grant for
          // the same payment identity.
          if (creditKey !== null) {
            const refill = await client.query(INSERT_GRANT_SQL, [
              accountId,
              grantRefId(creditKey),
              REFILL_REASON,
              REFILL_CREDITS,
              JSON.stringify(grantMeta(event, creditKey)),
            ]);
            if ((refill.rowCount ?? 0) === 0) {
              return true; // This refill's credits were already granted.
            }
          }
          return false;
        }
        const planTier: PlanTier = tier as PlanTier;
        // The subscription row mirrors a RECURRING subscription, so it is written
        // only when the payload actually describes one with a status. A one-time
        // purchase has neither, and subscriptions.status is NOT NULL — inventing
        // a status for it would be a guess, and the access that matters
        // (accounts.tier) is written below regardless.
        if (event.subscriptionId !== null && event.status !== null) {
          await client.query(UPSERT_SUBSCRIPTION_SQL, [
            accountId,
            planTier,
            event.subscriptionId,
            event.status,
          ]);
        }
        // Access first: idempotent, so it runs on every access event (all three
        // of them for one purchase agree) and needs no guard.
        await client.query(SET_CREEM_CUSTOMER_SQL, [accountId, event.customerId]);
        await client.query(SET_PAID_TIER_SQL, [accountId, planTier]);

        // Credits second, and only when this event is the one that OWNS the
        // payment (isCreditEvent). The unique index decides, not this process: a
        // redelivery of the same payment inserts nothing (rowCount 0) and is
        // reported as a duplicate even though its event id was new.
        if (creditKey !== null) {
          const grant = await client.query(INSERT_GRANT_SQL, [
            accountId,
            grantRefId(creditKey),
            GRANT_REASON,
            MONTHLY_GRANTS[planTier],
            JSON.stringify(grantMeta(event, creditKey)),
          ]);
          if ((grant.rowCount ?? 0) === 0) {
            return true; // This payment's credits were already granted.
          }
        }
        return false;
      }

      // Lifecycle (and anything unrecognised): records the provider's status
      // when the payload carries one and we can attribute it, and otherwise
      // only the receipt. No ledger row, no tier move, in either case.
      if (kind === 'lifecycle' && event.accountId !== null && event.status !== null) {
        await client.query(UPSERT_SUBSCRIPTION_STATUS_SQL, [
          event.accountId,
          event.subscriptionId,
          event.status,
        ]);
      }
      return false;
    });
    return accepted(duplicate);
  } catch (error) {
    // A missing DATABASE_URL is its own honest answer (mapDbError). Everything
    // else is a 500 so Creem retries: the transaction rolled back, so nothing
    // was recorded and the retry is free to do the work for real.
    const mapped = mapDbError(error);
    if (mapped) {
      return refuse(mapped.error, mapped.status);
    }
    console.error(
      'creem webhook: cannot record the receipt',
      error instanceof Error ? error.message : 'unknown error',
    );
    return refuse('webhook_storage_failed', 500);
  }
}

/**
 * The provider identity a grant row keeps, so the ledger explains itself to the
 * reconciler without a second table: which payment granted it (creditKey), which
 * event delivered it first, for which Creem subscription, transaction and billing
 * period, on which product and order.
 */
function grantMeta(event: CreemEvent, creditKey: string): Record<string, string | null> {
  return {
    credit: 'creem',
    creditKey,
    firstEventId: event.id,
    firstEventType: event.type,
    productId: event.productId,
    orderId: event.orderId,
    transactionId: event.transactionId,
    creemCustomerId: event.customerId,
    creemSubscriptionId: event.subscriptionId,
    periodStart: event.periodStart,
    periodEnd: event.periodEnd,
  };
}

// Tests for POST /api/webhooks/creem (overnight money-harness wave).
//
// This route is the only writer of accounts.tier in the product, so the suite
// is built around the two ways money goes wrong: a forged request (bad HMAC →
// 400 with ZERO state change) and a double-counted request (a replayed event id
// → 200 with no further work). Both are asserted by inspecting the exact SQL the
// route issued, not by trusting a status code — a 200 is a claim, the query log
// is evidence.
//
// Payloads are the shapes from the live docs (https://docs.creem.io/code/webhooks),
// including both nesting conventions: an expanded `"customer": { "id": … }` and a
// bare `"product": "prod_…"`. The signature is computed over the exact bytes sent,
// so a test that passes proves the route hashed the RAW body rather than a
// re-serialized parse.
//
// No test here reaches the network or a provider. The database is the Postgres
// path only in the final (loud-skipping) describe; every other case injects a
// fake pool and asserts against the recorded statements.

import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { MONTHLY_GRANTS } from '@corvus/ai';
import { DatabaseNotConfiguredError, TEST_DATABASE_URL, __resetPool } from '@/lib/db/pool';
import { Pool as LivePool } from 'pg';
import {
  GRANT_REASON,
  INSERT_GRANT_SQL,
  INSERT_RECEIPT_SQL,
  REFILL_CREDITS,
  REFILL_REASON,
  SET_CREEM_CUSTOMER_SQL,
  SET_PAID_TIER_SQL,
  UPSERT_SUBSCRIPTION_SQL,
  UPSERT_SUBSCRIPTION_STATUS_SQL,
  POST,
  __setPool,
  creditKeyFor,
  eventKind,
  grantRefId,
  isCreditEvent,
  isRefillProduct,
  parseCreemEvent,
  payloadHash,
  planTierForProduct,
  refillProductId,
  verifySignature,
} from './route';

const SECRET = 'whsec_test_value_never_a_real_secret';
const ACCOUNT_ID = '11111111-2222-4333-8444-555555555555';
const SUBSCRIPTION_ID = 'sub_6pC2lNB6joCRQIZ1aMrTpi';
const CUSTOMER_ID = 'cust_1OcIK1GEuVvXZwD19tjq2z';
const ORDER_ID = 'ord_4aDwWXjMLpes4Kj4XqNnUA';
const CHECKOUT_ID = 'ch_4l0N34kxo16AhRKUHFUuXr';
const TRANSACTION_ID = 'tran_5yMaWzAl3jxuGJMCOrYWwk';
const PRO_PRODUCT = 'prod_pro_from_dashboard';
const STUDIO_PRODUCT = 'prod_studio_from_dashboard';
const REFILL_PRODUCT = 'prod_refill_from_dashboard';

interface RecordedQuery {
  text: string;
  params: unknown[];
}

/* The fake pool records every statement (BEGIN/COMMIT included) and answers by
   dispatching on SQL text. A sequential-response fake would mis-answer the
   moment the route's query order changed, which is exactly the regression this
   suite exists to catch. */
function makePool(
  handler: (text: string, params: unknown[]) => { rowCount: number; rows?: unknown[] },
): { pool: Pool; calls: RecordedQuery[] } {
  const calls: RecordedQuery[] = [];
  const client = {
    query: async (text: string, params: unknown[] = []) => {
      calls.push({ text, params });
      return handler(text, params);
    },
    release: () => undefined,
  };
  const pool = { connect: async () => client } as unknown as Pool;
  return { pool, calls };
}

/* The statements the route issues around its own SQL. Kept as literals here so a
   transaction that silently stopped opening (or stopped committing) shows up as
   a diff in the assertion rather than passing unnoticed. */
const BEGIN = 'BEGIN';
const COMMIT = 'COMMIT';
const ROLLBACK = 'ROLLBACK';

/* Every statement a RECURRING grant expects, in order: the access writes plus the
   ledger row. Kept as a literal list here so a transaction that silently stopped
   opening, or a grant that stopped writing credits, shows up as a diff rather
   than passing unnoticed. */
const GRANT_STATEMENTS = [
  BEGIN,
  INSERT_RECEIPT_SQL,
  UPSERT_SUBSCRIPTION_SQL,
  SET_CREEM_CUSTOMER_SQL,
  SET_PAID_TIER_SQL,
  INSERT_GRANT_SQL,
  COMMIT,
];

/* A ONE-TIME purchase: no subscription row (there is no subscription, and its
   status is NOT NULL), but access and credits both land. */
const ONE_TIME_GRANT_STATEMENTS = [
  BEGIN,
  INSERT_RECEIPT_SQL,
  SET_CREEM_CUSTOMER_SQL,
  SET_PAID_TIER_SQL,
  INSERT_GRANT_SQL,
  COMMIT,
];

const STATUS_STATEMENTS = [BEGIN, INSERT_RECEIPT_SQL, UPSERT_SUBSCRIPTION_STATUS_SQL, COMMIT];

/* A first-delivery pool: the receipt insert reports one row written, so the
   event is new and the work proceeds. */
function freshPool(): { pool: Pool; calls: RecordedQuery[] } {
  return makePool((text) => {
    if (text === INSERT_RECEIPT_SQL) return { rowCount: 1, rows: [] };
    return { rowCount: 1, rows: [] };
  });
}

/* A replay pool: the receipt insert reports zero rows changed (ON CONFLICT DO
   NOTHING matched), so the event was already received. BEGIN/COMMIT are still
   legitimate — the transaction opens and closes around the no-op insert — but
   any WRITE it authorises would throw, which is what makes the "no further work"
   assertion real rather than decorative. */
function replayPool(): { pool: Pool; calls: RecordedQuery[] } {
  return makePool((text) => {
    if (text === INSERT_RECEIPT_SQL) return { rowCount: 0, rows: [] };
    if (text === BEGIN || text === COMMIT || text === ROLLBACK) return { rowCount: 0, rows: [] };
    throw new Error(`replay must not issue further work: ${text}`);
  });
}

function sign(rawBody: string): string {
  return createHmac('sha256', SECRET).update(rawBody).digest('hex');
}

function webhookRequest(
  rawBody: string,
  options: { signature?: string | null; omitSignature?: boolean } = {},
): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.omitSignature !== true) {
    // `signature: null` sends an empty header (present but unusable); omitting
    // the key entirely models a request that never carried one. They are
    // different requests and both must be refused.
    headers['creem-signature'] =
      options.signature === undefined ? sign(rawBody) : (options.signature ?? '');
  }
  return new Request('http://localhost/api/webhooks/creem', {
    method: 'POST',
    headers,
    body: rawBody,
  });
}

/* --- Payload builders (doc shapes) ----------------------------------------- */

/* The doc's checkout.completed shape. Note what the nested subscription does NOT
   carry: no current_period_* fields (the checkout sample has none), and the
   subscription id is only reachable via `subscription.id`. The route must handle
   the purchase from this event as the real provider sends it. */
function checkoutCompleted(
  overrides: {
    metadataAccountId?: string | null;
    eventId?: string;
    /** Attach a subscription: the recurring-purchase case. */
    withSubscription?: boolean;
    /** The order status, so an unsettled checkout can be modelled. */
    orderStatus?: string;
  } = {},
): string {
  const accountId =
    overrides.metadataAccountId === undefined ? ACCOUNT_ID : overrides.metadataAccountId;
  const withSubscription = overrides.withSubscription ?? false;
  return JSON.stringify({
    id: overrides.eventId ?? 'evt_5WHHcZPv7VS0YUsberIuOz',
    eventType: 'checkout.completed',
    created_at: 1728734325927,
    object: {
      id: CHECKOUT_ID,
      object: 'checkout',
      request_id: 'corvus-request',
      order: {
        id: ORDER_ID,
        customer: CUSTOMER_ID,
        product: PRO_PRODUCT,
        amount: 1000,
        currency: 'EUR',
        status: overrides.orderStatus ?? 'paid',
        type: withSubscription ? 'recurring' : 'one-time',
      },
      product: {
        id: PRO_PRODUCT,
        name: 'Pro',
        price: 1000,
        currency: 'EUR',
        billing_type: 'recurring',
        billing_period: 'every-month',
        status: 'active',
      },
      customer: { id: CUSTOMER_ID, object: 'customer', email: 'customer@emaildomain' },
      // Present only for a recurring purchase, and — per the doc sample — with no
      // period fields at all.
      subscription: withSubscription
        ? {
            id: SUBSCRIPTION_ID,
            object: 'subscription',
            product: PRO_PRODUCT,
            customer: CUSTOMER_ID,
            status: 'active',
          }
        : null,
      status: 'completed',
      metadata: accountId === null ? {} : { accountId },
    },
  });
}

/* subscription.* events carry the subscription AS the object, with the product
   expanded and the customer expanded — the other nesting convention.
   `current_period_start_date` and `last_transaction_id` reflect what the real
   payloads carry: subscription.paid has both, subscription.active has neither. */
function subscriptionEvent(
  eventType: string,
  status: string,
  options: {
    metadataAccountId?: string | null;
    productId?: string;
    eventId?: string;
    withPeriod?: boolean;
    withTransaction?: boolean;
  } = {},
): string {
  const accountId =
    options.metadataAccountId === undefined ? ACCOUNT_ID : options.metadataAccountId;
  const withPeriod = options.withPeriod ?? true;
  const withTransaction = options.withTransaction ?? true;
  return JSON.stringify({
    id: options.eventId ?? `evt_for_${eventType}`,
    eventType,
    created_at: 1728734327355,
    object: {
      id: SUBSCRIPTION_ID,
      object: 'subscription',
      product: {
        id: options.productId ?? PRO_PRODUCT,
        name: 'Pro',
        price: 1000,
        currency: 'EUR',
        billing_type: 'recurring',
        billing_period: 'every-month',
        status: 'active',
      },
      customer: { id: CUSTOMER_ID, object: 'customer', email: 'customer@emaildomain' },
      collection_method: 'charge_automatically',
      status,
      ...(withTransaction ? { last_transaction_id: TRANSACTION_ID } : {}),
      ...(withPeriod
        ? {
            current_period_start_date: '2024-10-12T11:58:38.000Z',
            current_period_end_date: '2024-11-12T11:58:38.000Z',
          }
        : {}),
      canceled_at: null,
      metadata: accountId === null ? {} : { accountId },
    },
  });
}

/* A bare-string product id (`"product": "prod_…"`) with the metadata on the
   nested subscription — the refund/dispute convention. */
function disputeCreated(): string {
  return JSON.stringify({
    id: 'evt_6mfLDL7P0NYwYQqCrICvDH',
    eventType: 'dispute.created',
    created_at: 1750941264812,
    object: {
      id: 'disp_6vSsOdTANP5PhOzuDlUuXE',
      object: 'dispute',
      amount: 1331,
      currency: 'EUR',
      subscription: {
        id: SUBSCRIPTION_ID,
        object: 'subscription',
        product: PRO_PRODUCT,
        customer: CUSTOMER_ID,
        status: 'active',
        metadata: { accountId: ACCOUNT_ID },
      },
    },
  });
}

beforeEach(() => {
  vi.stubEnv('CREEM_WEBHOOK_SECRET', SECRET);
  vi.stubEnv('CREEM_TEST_PRODUCT_PRO', PRO_PRODUCT);
  vi.stubEnv('CREEM_TEST_PRODUCT_STUDIO', STUDIO_PRODUCT);
  vi.stubEnv('CREEM_TEST_PRODUCT_REFILL', REFILL_PRODUCT);
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetPool();
});

/* --- Signature verification (pure) ----------------------------------------- */

describe('verifySignature', () => {
  const body = '{"hello":"world"}';

  it('accepts the HMAC-SHA256 hex digest of the raw body', () => {
    expect(verifySignature(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects a digest computed over a different body', () => {
    expect(verifySignature(body, sign(`${body} `), SECRET)).toBe(false);
  });

  it('rejects a digest computed with a different secret', () => {
    const forged = createHmac('sha256', 'not-the-secret').update(body).digest('hex');
    expect(verifySignature(body, forged, SECRET)).toBe(false);
  });

  it('rejects an absent header, an empty header and a wrong-length digest', () => {
    expect(verifySignature(body, null, SECRET)).toBe(false);
    expect(verifySignature(body, '', SECRET)).toBe(false);
    expect(verifySignature(body, 'abc123', SECRET)).toBe(false);
  });

  it('rejects a non-hex digest rather than coercing it', () => {
    expect(verifySignature(body, 'z'.repeat(64), SECRET)).toBe(false);
  });

  it('tolerates a sha256= prefix, surrounding whitespace and uppercase hex', () => {
    const digest = sign(body);
    expect(verifySignature(body, `sha256=${digest}`, SECRET)).toBe(true);
    expect(verifySignature(body, `  ${digest}  `, SECRET)).toBe(true);
    expect(verifySignature(body, digest.toUpperCase(), SECRET)).toBe(true);
  });
});

describe('payloadHash', () => {
  it('is a 64-char hex sha256 of the raw body, and changes with it', () => {
    const a = payloadHash('{"a":1}');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(payloadHash('{"a":2}')).not.toBe(a);
  });
});

/* --- Classification + parsing (pure) --------------------------------------- */

describe('eventKind', () => {
  it('classifies the three granting events', () => {
    expect(eventKind('checkout.completed')).toBe('grant');
    expect(eventKind('subscription.active')).toBe('grant');
    expect(eventKind('subscription.paid')).toBe('grant');
  });

  it('classifies every non-granting lifecycle event as lifecycle', () => {
    for (const type of [
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
    ]) {
      expect(eventKind(type)).toBe('lifecycle');
    }
  });

  it('answers other for any type it does not know — inert, never a guess', () => {
    expect(eventKind('subscription.teleported')).toBe('other');
    expect(eventKind('')).toBe('other');
  });
});

describe('parseCreemEvent', () => {
  it('reads the checkout.completed doc shape, expanded customer and product', () => {
    const parsed = parseCreemEvent(JSON.parse(checkoutCompleted({ withSubscription: true })));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.id).toBe('evt_5WHHcZPv7VS0YUsberIuOz');
    expect(parsed.value.type).toBe('checkout.completed');
    expect(parsed.value.accountId).toBe(ACCOUNT_ID);
    expect(parsed.value.customerId).toBe(CUSTOMER_ID);
    expect(parsed.value.subscriptionId).toBe(SUBSCRIPTION_ID);
    expect(parsed.value.productId).toBe(PRO_PRODUCT);
    expect(parsed.value.orderId).toBe(ORDER_ID);
    expect(parsed.value.checkoutId).toBe(CHECKOUT_ID);
    expect(parsed.value.status).toBe('active');
  });

  it('reads a one-time checkout, which carries no subscription at all', () => {
    const parsed = parseCreemEvent(JSON.parse(checkoutCompleted()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.subscriptionId).toBeNull();
    expect(parsed.value.status).toBeNull();
    expect(parsed.value.orderId).toBe(ORDER_ID);
    expect(parsed.value.paid).toBe(true);
  });

  it('reads the subscription.* doc shape, where the object IS the subscription', () => {
    const parsed = parseCreemEvent(
      JSON.parse(subscriptionEvent('subscription.past_due', 'past_due')),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.subscriptionId).toBe(SUBSCRIPTION_ID);
    expect(parsed.value.productId).toBe(PRO_PRODUCT);
    expect(parsed.value.status).toBe('past_due');
  });

  it('reads a bare-string product id and nested-subscription metadata (dispute shape)', () => {
    const parsed = parseCreemEvent(JSON.parse(disputeCreated()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.productId).toBe(PRO_PRODUCT);
    expect(parsed.value.accountId).toBe(ACCOUNT_ID);
  });

  it('takes status from the SUBSCRIPTION, never the checkout status', () => {
    // A checkout's own status is 'completed' — not a subscription status, and it
    // must never reach subscriptions.status.
    const parsed = parseCreemEvent(JSON.parse(checkoutCompleted({ withSubscription: true })));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.status).not.toBe('completed');
    expect(parsed.value.status).toBe('active');
  });

  it('drops a non-uuid metadata.accountId instead of passing it to a uuid column', () => {
    const parsed = parseCreemEvent(JSON.parse(checkoutCompleted({ metadataAccountId: 'acct-1' })));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.accountId).toBeNull();
  });

  it('reports no account when metadata is absent', () => {
    const parsed = parseCreemEvent(JSON.parse(checkoutCompleted({ metadataAccountId: null })));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.accountId).toBeNull();
  });

  it('rejects a non-object, a missing id, a missing eventType and a missing object', () => {
    expect(parseCreemEvent(null).ok).toBe(false);
    expect(parseCreemEvent([]).ok).toBe(false);
    expect(parseCreemEvent({ eventType: 'checkout.completed', object: {} }).ok).toBe(false);
    expect(parseCreemEvent({ id: 'evt_1', object: {} }).ok).toBe(false);
    expect(parseCreemEvent({ id: 'evt_1', eventType: 'checkout.completed' }).ok).toBe(false);
  });
});

describe('planTierForProduct', () => {
  it('maps the configured pro and studio product ids to their tiers', () => {
    expect(planTierForProduct(PRO_PRODUCT)).toBe('pro');
    expect(planTierForProduct(STUDIO_PRODUCT)).toBe('studio');
  });

  it('returns null for an unmapped product rather than guessing from the price', () => {
    expect(planTierForProduct('prod_something_else')).toBeNull();
    expect(planTierForProduct(null)).toBeNull();
    expect(planTierForProduct('')).toBeNull();
  });

  it('never matches on an empty configured value', () => {
    vi.stubEnv('CREEM_TEST_PRODUCT_PRO', '');
    expect(planTierForProduct('')).toBeNull();
    expect(planTierForProduct(PRO_PRODUCT)).toBeNull();
  });
});

/* --- The one-purchase-many-events hazard ----------------------------------- */

describe('isCreditEvent / creditKeyFor — one payment, one grant', () => {
  function eventOf(raw: string) {
    const parsed = parseCreemEvent(JSON.parse(raw));
    if (!parsed.ok) throw new Error('fixture must parse');
    return parsed.value;
  }

  it('credits subscription.paid — Creem’s own payment event', () => {
    expect(isCreditEvent(eventOf(subscriptionEvent('subscription.paid', 'active')))).toBe(true);
  });

  it('does NOT credit subscription.active, which Creem marks synchronization-only', () => {
    expect(isCreditEvent(eventOf(subscriptionEvent('subscription.active', 'active')))).toBe(false);
  });

  it('credits a ONE-TIME checkout, but not a recurring one', () => {
    // A recurring purchase is credited by its subscription.paid event; crediting
    // the checkout too would double it.
    expect(isCreditEvent(eventOf(checkoutCompleted({ withSubscription: false })))).toBe(true);
    expect(isCreditEvent(eventOf(checkoutCompleted({ withSubscription: true })))).toBe(false);
  });

  it('does NOT credit an unsettled checkout — nothing was collected yet', () => {
    expect(isCreditEvent(eventOf(checkoutCompleted({ orderStatus: 'pending' })))).toBe(false);
  });

  it('keys subscription.paid on the transaction id, so a renewal grants again', () => {
    const key = creditKeyFor(eventOf(subscriptionEvent('subscription.paid', 'active')));
    expect(key).toBe(`tran:${TRANSACTION_ID}`);

    // Next month: same subscription, new transaction and new period.
    const renewal = JSON.stringify({
      ...JSON.parse(subscriptionEvent('subscription.paid', 'active')),
      object: {
        ...JSON.parse(subscriptionEvent('subscription.paid', 'active')).object,
        last_transaction_id: 'tran_NEXT_MONTH',
        current_period_start_date: '2024-11-12T11:58:38.000Z',
      },
    });
    expect(creditKeyFor(eventOf(renewal))).toBe('tran:tran_NEXT_MONTH');
    expect(creditKeyFor(eventOf(renewal))).not.toBe(key);
  });

  it('falls back to the billing period when no transaction id is present', () => {
    const body = subscriptionEvent('subscription.paid', 'active', { withTransaction: false });
    expect(creditKeyFor(eventOf(body))).toBe(`sub:${SUBSCRIPTION_ID}:2024-10-12T11:58:38.000Z`);
  });

  it('keys a one-time checkout on its order', () => {
    expect(creditKeyFor(eventOf(checkoutCompleted()))).toBe(`order:${ORDER_ID}`);
  });

  it('falls back to the checkout session when no order is recorded', () => {
    const raw = JSON.parse(checkoutCompleted());
    delete raw.object.order;
    expect(creditKeyFor(eventOf(JSON.stringify(raw)))).toBe(`chk:${CHECKOUT_ID}`);
  });

  it('returns null when a credit is owed but nothing identifies the payment', () => {
    // Collected (the order says paid) but no id for the order, the checkout or a
    // subscription: the money is real and unattributable. That must not be granted
    // — and must not be receipted either, so it stays visible.
    const raw = JSON.parse(checkoutCompleted());
    raw.object.order = { status: 'paid', amount: 1000 };
    delete raw.object.id;
    const event = eventOf(JSON.stringify(raw));
    expect(event.paid).toBe(true);
    expect(isCreditEvent(event)).toBe(true);
    expect(creditKeyFor(event)).toBeNull();
  });

  it('THE REGRESSION: one purchase across all three events grants credits exactly once', async () => {
    // The exact sequence Creem sends for a single subscription purchase — three
    // different event ids, which the receipt gate cannot deduplicate. Only the
    // payment event may write the ledger.
    const bodies = [
      checkoutCompleted({ withSubscription: true, eventId: 'evt_checkout' }),
      subscriptionEvent('subscription.active', 'active', {
        eventId: 'evt_active',
        withPeriod: false,
        withTransaction: false,
      }),
      subscriptionEvent('subscription.paid', 'active', { eventId: 'evt_paid' }),
    ];
    const { pool, calls } = freshPool();
    __setPool(pool);

    for (const body of bodies) {
      const res = await POST(webhookRequest(body));
      expect(res.status).toBe(200);
    }

    const grants = calls.filter((call) => call.text === INSERT_GRANT_SQL);
    expect(grants).toHaveLength(1);
    // And the one grant is for a single month's allowance, not three.
    expect(grants[0].params[3]).toBe(MONTHLY_GRANTS.pro);

    // All three still granted ACCESS, and all three agree on the tier.
    const tierWrites = calls.filter((call) => call.text === SET_PAID_TIER_SQL);
    expect(tierWrites).toHaveLength(3);
    for (const write of tierWrites) {
      expect(write.params).toEqual([ACCOUNT_ID, 'pro']);
    }
  });

  it('uses ONE ref_id for the same payment across processes (deterministic)', () => {
    const a = creditKeyFor(eventOf(subscriptionEvent('subscription.paid', 'active')));
    const b = creditKeyFor(eventOf(subscriptionEvent('subscription.paid', 'active')));
    expect(a).toBe(b);
    if (a === null || b === null) throw new Error('expected a key');
    expect(grantRefId(a)).toBe(grantRefId(b));
    expect(grantRefId(a)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

/* --- HTTP: refusals before any state change -------------------------------- */

describe('POST /api/webhooks/creem — refusals', () => {
  it('answers an honest 503 with no secret configured, and touches nothing', async () => {
    vi.stubEnv('CREEM_WEBHOOK_SECRET', '');
    // A pool that fails loudly if the route reaches the database at all.
    __setPool(
      makePool(() => {
        throw new Error('a missing secret must not reach the database');
      }).pool,
    );

    const res = await POST(webhookRequest(checkoutCompleted()));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'webhook_unavailable' });
  });

  it('answers 400 on a bad signature with zero statements issued', async () => {
    const { pool, calls } = makePool(() => {
      throw new Error('a forged request must not reach the database');
    });
    __setPool(pool);

    const res = await POST(webhookRequest(checkoutCompleted(), { signature: 'f'.repeat(64) }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_signature' });
    expect(calls).toHaveLength(0);
  });

  it('answers 400 for missing, empty and malformed signature headers', async () => {
    const { pool, calls } = makePool(() => {
      throw new Error('unauthenticated requests must not reach the database');
    });
    __setPool(pool);
    const body = checkoutCompleted();

    const missing = await POST(webhookRequest(body, { omitSignature: true }));
    const empty = await POST(webhookRequest(body, { signature: null }));
    const malformed = await POST(webhookRequest(body, { signature: 'not-a-digest' }));

    for (const res of [missing, empty, malformed]) {
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_signature' });
    }
    expect(calls).toHaveLength(0);
  });

  it('answers 400 when the body was altered after signing', async () => {
    const body = checkoutCompleted();
    const signature = sign(body);
    const tampered = body.replace(ACCOUNT_ID, '99999999-2222-4333-8444-555555555555');
    const { pool, calls } = makePool(() => {
      throw new Error('a tampered body must not reach the database');
    });
    __setPool(pool);

    const res = await POST(webhookRequest(tampered, { signature }));

    expect(res.status).toBe(400);
    const payload = (await res.json()) as Record<string, unknown>;
    expect(payload).toEqual({ error: 'invalid_signature' });
    // The refusal never echoes what it was sent.
    expect(JSON.stringify(payload)).not.toContain(ACCOUNT_ID);
    expect(calls).toHaveLength(0);
  });

  it('verifies the RAW bytes — a re-serialized equivalent body does not match', async () => {
    // Same data, different key order and whitespace. If the route parsed first
    // and re-serialized, this would still verify; it must not.
    const pretty = `{\n  "id": "evt_x",\n  "eventType": "subscription.past_due",\n  "object": {}\n}`;
    const compact = JSON.stringify(JSON.parse(pretty));
    const { pool, calls } = makePool(() => {
      throw new Error('must not reach the database');
    });
    __setPool(pool);

    const res = await POST(webhookRequest(compact, { signature: sign(pretty) }));

    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('answers 400 on a signed body that is not JSON', async () => {
    const body = 'not json{';
    const { pool, calls } = makePool(() => {
      throw new Error('an unparseable body must not reach the database');
    });
    __setPool(pool);

    const res = await POST(webhookRequest(body, { signature: sign(body) }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_payload' });
    expect(calls).toHaveLength(0);
  });
});

/* --- HTTP: idempotency ----------------------------------------------------- */

describe('POST /api/webhooks/creem — idempotency', () => {
  it('records the receipt first and answers 200 { received: true } on first delivery', async () => {
    const { pool, calls } = freshPool();
    __setPool(pool);

    const res = await POST(webhookRequest(checkoutCompleted()));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(calls[0].text).toBe(BEGIN);
    expect(calls[1].text).toBe(INSERT_RECEIPT_SQL);
    expect(calls[1].params[0]).toBe('evt_5WHHcZPv7VS0YUsberIuOz');
    expect(calls[1].params[1]).toBe('checkout.completed');
    expect(calls[1].params[2]).toMatch(/^[0-9a-f]{64}$/);
    expect(calls[calls.length - 1].text).toBe(COMMIT);
  });

  it('answers 200 { duplicate: true } on a replay and does NO further work', async () => {
    const { pool, calls } = replayPool();
    __setPool(pool);

    const res = await POST(webhookRequest(checkoutCompleted()));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, duplicate: true });
    // The receipt insert is the WHOLE story: no ledger row, no subscription
    // write, no tier move. The replay handler would have thrown otherwise.
    expect(calls.map((call) => call.text)).toEqual([BEGIN, INSERT_RECEIPT_SQL, COMMIT]);
  });

  it('is honest about the same event id delivered twice in a row', async () => {
    const body = checkoutCompleted();
    const seen = new Set<string>();
    const { pool, calls } = makePool((text, params) => {
      if (text === INSERT_RECEIPT_SQL) {
        const id = String(params[0]);
        if (seen.has(id)) return { rowCount: 0, rows: [] };
        seen.add(id);
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    });
    __setPool(pool);

    const first = await POST(webhookRequest(body));
    const second = await POST(webhookRequest(body));

    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ received: true });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ received: true, duplicate: true });

    // One grant's worth of work across two deliveries.
    const grants = calls.filter((call) => call.text === INSERT_GRANT_SQL);
    const tierWrites = calls.filter((call) => call.text === SET_PAID_TIER_SQL);
    expect(grants).toHaveLength(1);
    expect(tierWrites).toHaveLength(1);
  });
});

/* --- HTTP: grants ---------------------------------------------------------- */

describe('POST /api/webhooks/creem — grants', () => {
  it('grants pro from a one-time checkout in ONE transaction, joining on metadata.accountId', async () => {
    const body = checkoutCompleted();
    const { pool, calls } = freshPool();
    __setPool(pool);

    const res = await POST(webhookRequest(body));

    expect(res.status).toBe(200);
    expect(calls.map((call) => call.text)).toEqual(ONE_TIME_GRANT_STATEMENTS);

    const receipt = calls[1];
    expect(receipt.params).toEqual([
      'evt_5WHHcZPv7VS0YUsberIuOz',
      'checkout.completed',
      payloadHash(body),
    ]);

    const customer = calls[2];
    expect(customer.params).toEqual([ACCOUNT_ID, CUSTOMER_ID]);

    const tier = calls[3];
    expect(tier.params).toEqual([ACCOUNT_ID, 'pro']);

    // The ledger row: account, deterministic ref, reason, amount, meta.
    const ledger = calls[4];
    expect(ledger.params[0]).toBe(ACCOUNT_ID);
    expect(String(ledger.params[1])).toMatch(/^[0-9a-f-]{36}$/);
    expect(ledger.params[2]).toBe(GRANT_REASON);
    expect(ledger.params[3]).toBe(MONTHLY_GRANTS.pro);
    expect(String(ledger.params[4])).toContain(`order:${ORDER_ID}`);
  });

  it('writes the subscription row for a recurring grant, and credits the payment event', async () => {
    const { pool, calls } = freshPool();
    __setPool(pool);

    const res = await POST(webhookRequest(subscriptionEvent('subscription.paid', 'active')));

    expect(res.status).toBe(200);
    expect(calls.map((call) => call.text)).toEqual(GRANT_STATEMENTS);
    const subscription = calls[2];
    expect(subscription.params).toEqual([ACCOUNT_ID, 'pro', SUBSCRIPTION_ID, 'active']);
    const ledger = calls[5];
    expect(ledger.params[3]).toBe(MONTHLY_GRANTS.pro);
    expect(String(ledger.params[4])).toContain(TRANSACTION_ID);
  });

  it('grants studio for the studio product id', async () => {
    const body = subscriptionEvent('subscription.paid', 'active', { productId: STUDIO_PRODUCT });
    const { pool, calls } = freshPool();
    __setPool(pool);

    const res = await POST(webhookRequest(body));

    expect(res.status).toBe(200);
    const ledger = calls.find((call) => call.text === INSERT_GRANT_SQL);
    expect(ledger?.params[3]).toBe(MONTHLY_GRANTS.studio);
    const tier = calls.find((call) => call.text === SET_PAID_TIER_SQL);
    expect(tier?.params).toEqual([ACCOUNT_ID, 'studio']);
  });

  it('grants ACCESS on subscription.active but writes no ledger row', async () => {
    // Creem's own guidance: subscription.active is for synchronization; the money
    // it announces is credited by subscription.paid. Crediting both would double
    // every subscription's first month.
    const { pool, calls } = freshPool();
    __setPool(pool);

    const res = await POST(webhookRequest(subscriptionEvent('subscription.active', 'active')));

    expect(res.status).toBe(200);
    expect(calls.map((call) => call.text)).not.toContain(INSERT_GRANT_SQL);
    expect(calls.map((call) => call.text)).toContain(SET_PAID_TIER_SQL);
    expect(calls.find((call) => call.text === SET_PAID_TIER_SQL)?.params).toEqual([
      ACCOUNT_ID,
      'pro',
    ]);
  });

  it('joins on metadata.accountId, never the customer email', async () => {
    const { pool, calls } = freshPool();
    __setPool(pool);

    await POST(webhookRequest(checkoutCompleted()));

    for (const call of calls) {
      expect(call.params).not.toContain('customer@emaildomain');
    }
  });

  it('refuses an unattributable grant with 500 and NO receipt, so Creem retries it', async () => {
    const { pool, calls } = makePool(() => {
      throw new Error('an unattributable grant must not be receipted');
    });
    __setPool(pool);

    const res = await POST(webhookRequest(checkoutCompleted({ metadataAccountId: null })));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'grant_target_missing' });
    // No receipt means the retry is real: recording it would swallow the event
    // and the customer's payment would never be honoured.
    expect(calls).toHaveLength(0);
  });

  it('refuses a payment it cannot identify with 500 and NO receipt', async () => {
    // Nothing names the payment: no transaction, no period, no order, no session.
    // Crediting it is impossible and receipting it would hide it — refuse loudly.
    const raw = JSON.parse(subscriptionEvent('subscription.paid', 'active', { withPeriod: false }));
    delete raw.object.last_transaction_id;
    delete raw.object.id;
    const { pool, calls } = makePool(() => {
      throw new Error('an unidentifiable payment must not be receipted');
    });
    __setPool(pool);

    const res = await POST(webhookRequest(JSON.stringify(raw)));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'credit_reference_missing' });
    expect(calls).toHaveLength(0);
  });

  it('refuses an unmapped product with 500 and NO receipt, never guessing a tier', async () => {
    const body = checkoutCompleted().replaceAll(PRO_PRODUCT, 'prod_unknown_to_us');
    const { pool, calls } = makePool(() => {
      throw new Error('an unmapped product must not be receipted');
    });
    __setPool(pool);

    const res = await POST(webhookRequest(body));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'product_unmapped' });
    expect(calls).toHaveLength(0);
  });

  it('refuses an unmapped product when the product env is unset entirely', async () => {
    vi.stubEnv('CREEM_TEST_PRODUCT_PRO', '');
    const { pool, calls } = makePool(() => {
      throw new Error('must not reach the database');
    });
    __setPool(pool);

    const res = await POST(webhookRequest(checkoutCompleted()));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'product_unmapped' });
    expect(calls).toHaveLength(0);
  });

  it('rolls back the receipt when the grant fails, so a retry does the work for real', async () => {
    const { pool, calls } = makePool((text) => {
      if (text === INSERT_RECEIPT_SQL) return { rowCount: 1, rows: [] };
      if (text === SET_PAID_TIER_SQL) throw new Error('connection reset');
      return { rowCount: 1, rows: [] };
    });
    __setPool(pool);

    const res = await POST(webhookRequest(checkoutCompleted()));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'webhook_storage_failed' });
    // BEGIN -> receipt -> … -> tier(throws) -> ROLLBACK. The receipt is undone
    // with everything else, so the retry is not mistaken for a duplicate of work
    // that never committed.
    expect(calls[calls.length - 1].text).toBe(ROLLBACK);
    expect(calls.map((call) => call.text)).not.toContain(COMMIT);
  });

  it('reports a second event for the same payment as a duplicate, not a second grant', async () => {
    // Distinct event ids (so the receipt does not catch it) but the SAME payment:
    // the ledger's unique index reports zero rows and the route stays honest.
    const seen = new Set<string>();
    const { pool, calls } = makePool((text, params) => {
      if (text === INSERT_RECEIPT_SQL) {
        const id = String(params[0]);
        if (seen.has(id)) return { rowCount: 0, rows: [] };
        seen.add(id);
        return { rowCount: 1, rows: [] };
      }
      if (text === INSERT_GRANT_SQL) {
        const ref = String(params[1]);
        if (seen.has(ref)) return { rowCount: 0, rows: [] };
        seen.add(ref);
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    });
    __setPool(pool);

    const first = await POST(
      webhookRequest(subscriptionEvent('subscription.paid', 'active', { eventId: 'evt_a' })),
    );
    const redelivery = await POST(
      webhookRequest(subscriptionEvent('subscription.paid', 'active', { eventId: 'evt_b' })),
    );

    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ received: true });
    expect(redelivery.status).toBe(200);
    expect(await redelivery.json()).toEqual({ received: true, duplicate: true });

    const grants = calls.filter((call) => call.text === INSERT_GRANT_SQL);
    expect(grants).toHaveLength(2); // Attempted twice…
    expect(grants[0].params[1]).toBe(grants[1].params[1]); // …with the SAME ref_id,
    // which is why the database — not this process — is what prevents the double
    // grant. The second attempt writes nothing.
  });
});

/* --- HTTP: refill purchases extend the allowance only ---------------------- */

describe('POST /api/webhooks/creem — refill purchases', () => {
  /* A refill one-time checkout: same shape as a plan checkout, but the product
     is the refill pack. isCreditEvent owns it (no subscription attached). */
  function refillCompleted(eventId: string): string {
    return JSON.stringify({
      id: eventId,
      eventType: 'checkout.completed',
      created_at: 1728734325927,
      object: {
        id: 'ch_refill_1',
        object: 'checkout',
        request_id: 'corvus-refill-request',
        order: {
          id: 'ord_refill_1',
          customer: CUSTOMER_ID,
          product: REFILL_PRODUCT,
          amount: 500,
          currency: 'USD',
          status: 'paid',
          type: 'one-time',
        },
        product: {
          id: REFILL_PRODUCT,
          name: 'Refill',
          price: 500,
          currency: 'USD',
          billing_type: 'one_time',
          status: 'active',
        },
        customer: { id: CUSTOMER_ID, object: 'customer', email: 'customer@emaildomain' },
        subscription: null,
        status: 'completed',
        metadata: { accountId: ACCOUNT_ID },
      },
    });
  }

  it('routes only the refill product to refill semantics', () => {
    expect(refillProductId()).toBe(REFILL_PRODUCT);
    expect(isRefillProduct(REFILL_PRODUCT)).toBe(true);
    expect(isRefillProduct(PRO_PRODUCT)).toBe(false);
    expect(isRefillProduct(null)).toBe(false);
    expect(REFILL_REASON).toBe('refill');
    expect(REFILL_CREDITS).toBe(1000);
  });

  it('never matches a refill when the product env is unset', () => {
    vi.stubEnv('CREEM_TEST_PRODUCT_REFILL', '');
    expect(refillProductId()).toBe('');
    expect(isRefillProduct(REFILL_PRODUCT)).toBe(false);
  });

  it('writes ONE refill ledger row and NO tier/subscription move', async () => {
    const { pool, calls } = freshPool();
    __setPool(pool);

    const res = await POST(webhookRequest(refillCompleted('evt_refill_1')));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(calls.map((call) => call.text)).toEqual([
      BEGIN,
      INSERT_RECEIPT_SQL,
      INSERT_GRANT_SQL,
      COMMIT,
    ]);

    const ledger = calls[2];
    expect(ledger.params[0]).toBe(ACCOUNT_ID);
    expect(String(ledger.params[1])).toMatch(/^[0-9a-f-]{36}$/);
    expect(ledger.params[2]).toBe(REFILL_REASON);
    expect(ledger.params[3]).toBe(REFILL_CREDITS);
    expect(String(ledger.params[4])).toContain('ord_refill_1');
  });

  it('double-delivery of a refill writes one row (same deterministic ref_id)', async () => {
    // Same payment identity, two distinct event ids: receipt cannot dedupe, so
    // the ledger's partial-unique index must.
    const seen = new Set<string>();
    const { pool, calls } = makePool((text, params) => {
      if (text === INSERT_RECEIPT_SQL) {
        const id = String(params[0]);
        if (seen.has(id)) return { rowCount: 0, rows: [] };
        seen.add(id);
        return { rowCount: 1, rows: [] };
      }
      if (text === INSERT_GRANT_SQL) {
        const ref = String(params[1]);
        if (seen.has(ref)) return { rowCount: 0, rows: [] };
        seen.add(ref);
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    });
    __setPool(pool);

    const first = await POST(webhookRequest(refillCompleted('evt_refill_a')));

    // Same payment (same order), new event id: a redelivery of the same purchase.
    const redelivery = await POST(webhookRequest(refillCompleted('evt_refill_b')));

    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ received: true });
    expect(redelivery.status).toBe(200);
    expect(await redelivery.json()).toEqual({ received: true, duplicate: true });

    const grants = calls.filter((call) => call.text === INSERT_GRANT_SQL);
    expect(grants).toHaveLength(2); // Attempted twice…
    expect(grants[0].params[1]).toBe(grants[1].params[1]); // …with the SAME ref_id,
    for (const grant of grants) {
      expect(grant.params[2]).toBe(REFILL_REASON);
      expect(grant.params[3]).toBe(REFILL_CREDITS);
    }
    // And no tier or subscription move on either delivery.
    expect(calls.map((call) => call.text)).not.toContain(SET_PAID_TIER_SQL);
    expect(calls.map((call) => call.text)).not.toContain(UPSERT_SUBSCRIPTION_SQL);
  });

  it('records a receipt but no refill row for a non-payment refill event', async () => {
    // checkout NOT settled: isCreditEvent is false, so this event owns nothing.
    const raw = JSON.parse(refillCompleted('evt_refill_unsettled'));
    raw.object.order.status = 'pending';
    const { pool, calls } = freshPool();
    __setPool(pool);

    const res = await POST(webhookRequest(JSON.stringify(raw)));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(calls.map((call) => call.text)).toEqual([BEGIN, INSERT_RECEIPT_SQL, COMMIT]);
    expect(calls.map((call) => call.text)).not.toContain(SET_PAID_TIER_SQL);
  });
});

/* --- HTTP: lifecycle events never downgrade -------------------------------- */

describe('POST /api/webhooks/creem — lifecycle events', () => {
  it('records past_due without touching the tier or the ledger', async () => {
    const { pool, calls } = freshPool();
    __setPool(pool);

    const res = await POST(webhookRequest(subscriptionEvent('subscription.past_due', 'past_due')));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(calls.map((call) => call.text)).toEqual(STATUS_STATEMENTS);
    expect(calls.map((call) => call.text)).not.toContain(SET_PAID_TIER_SQL);
    expect(calls.map((call) => call.text)).not.toContain(INSERT_GRANT_SQL);
    const status = calls[2];
    expect(status.params).toEqual([ACCOUNT_ID, SUBSCRIPTION_ID, 'past_due']);
  });

  it('never downgrades on canceled, expired, paused, scheduled_cancel or unpaid', async () => {
    const cases: [string, string][] = [
      ['subscription.canceled', 'canceled'],
      ['subscription.expired', 'expired'],
      ['subscription.paused', 'paused'],
      ['subscription.scheduled_cancel', 'scheduled_cancel'],
      ['subscription.unpaid', 'unpaid'],
    ];
    for (const [type, status] of cases) {
      const { pool, calls } = freshPool();
      __setPool(pool);

      const res = await POST(webhookRequest(subscriptionEvent(type, status)));

      expect(res.status).toBe(200);
      // The tier statement is absent AND the status statement carries no tier
      // assignment — a failed renewal holds the plan until the period ends.
      expect(calls.map((call) => call.text)).not.toContain(SET_PAID_TIER_SQL);
      expect(calls.map((call) => call.text)).not.toContain(INSERT_GRANT_SQL);
      const statusWrite = calls.find((call) => call.text === UPSERT_SUBSCRIPTION_STATUS_SQL);
      expect(statusWrite).toBeDefined();
      expect(statusWrite?.text).not.toContain('tier = EXCLUDED.tier');
      expect(statusWrite?.params[2]).toBe(status);
    }
  });

  it('records a receipt but no status write when the event cannot be attributed', async () => {
    const { pool, calls } = freshPool();
    __setPool(pool);

    const res = await POST(
      webhookRequest(
        subscriptionEvent('subscription.canceled', 'canceled', { metadataAccountId: null }),
      ),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(calls.map((call) => call.text)).toEqual([BEGIN, INSERT_RECEIPT_SQL, COMMIT]);
  });

  it('receipts an unknown event type inertly — no ledger, no subscription, no tier', async () => {
    const body = JSON.stringify({
      id: 'evt_future',
      eventType: 'subscription.teleported',
      object: { id: SUBSCRIPTION_ID, object: 'subscription', status: 'active' },
    });
    const { pool, calls } = freshPool();
    __setPool(pool);

    const res = await POST(webhookRequest(body));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(calls.map((call) => call.text)).toEqual([BEGIN, INSERT_RECEIPT_SQL, COMMIT]);
  });
});

/* --- HTTP: database failures ---------------------------------------------- */

describe('POST /api/webhooks/creem — database failures', () => {
  it('answers the canonical 500 when DATABASE_URL is missing, and never claims success', async () => {
    const client = {
      query: async () => {
        throw new DatabaseNotConfiguredError();
      },
      release: () => undefined,
    };
    __setPool({ connect: async () => client } as unknown as Pool);

    const res = await POST(webhookRequest(checkoutCompleted()));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'database not configured' });
  });

  it('answers 500 on a refused connection so Creem retries', async () => {
    __setPool({
      connect: async () => {
        throw new Error('connection refused');
      },
    } as unknown as Pool);

    const res = await POST(webhookRequest(checkoutCompleted()));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'webhook_storage_failed' });
  });

  it('never echoes the payload or the secret in any refusal body', async () => {
    const { pool } = makePool(() => {
      throw new Error(`driver said: ${SECRET}`);
    });
    __setPool(pool);

    const res = await POST(webhookRequest(checkoutCompleted()));
    const text = await res.text();

    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(CUSTOMER_ID);
    expect(text).not.toContain('customer@emaildomain');
    expect(text).not.toContain(SUBSCRIPTION_ID);
  });
});

/* --- Live Postgres (loud skip when unreachable) ---------------------------- */

const connectionString = process.env.DATABASE_URL ?? TEST_DATABASE_URL;

async function probeDatabase(): Promise<{ ok: boolean; reason: string }> {
  const probe = new LivePool({ connectionString, connectionTimeoutMillis: 3000 });
  try {
    await probe.query('SELECT 1');
    return { ok: true, reason: '' };
  } catch (error) {
    return { ok: false, reason: (error as Error).message || 'connection failed' };
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const probe = await probeDatabase();
const skipReason =
  `Postgres unreachable at ${connectionString} ` +
  `(${process.env.DATABASE_URL ? 'DATABASE_URL' : 'default TEST_DATABASE_URL'}): ${probe.reason}`;
// The live describe SKIPS (rather than early-returning) when Postgres is
// unreachable. That distinction is the whole point: an early `return` inside the
// test body reports a PASS, so a run with no database at all would be
// indistinguishable from a run that proved the money guard against real
// Postgres — and this project's vitest config suppresses console.warn, so the
// warning below would not rescue it. A skip is honest in the reporter, and
// `0 passed / N skipped` is visibly different from `N passed`.
//
// The warning is kept as well, for the case where a developer runs with
// --silent=false and wants the reason in the log.
if (!probe.ok) {
  console.warn(
    `[webhooks/creem.test] LOUD SKIP: ${skipReason}. ` +
      'The live-PG describe needs a TEST_DATABASE_URL (or DATABASE_URL) with ' +
      'migration 0011 applied; the hermetic cases above still ran.',
  );
}

/* The tables AND indexes 0011_credit_ledger_subscriptions.sql owns. Created here
   only as a fallback for a database where that migration has not been applied —
   the statements mirror it column-for-column AND index-for-index.

   The unique indexes are not incidental: credit_ledger_ref_reason_attempt_uidx is
   what INSERT_GRANT_SQL's ON CONFLICT infers (without it Postgres raises 42P10 and
   every grant 500s), and it is the mechanism that makes a payment count exactly
   once. A fallback that created the tables but not the index would let this suite
   pass against a database where the money guard does not actually exist. */
const FALLBACK_DDL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id text UNIQUE NOT NULL,
  email text,
  creem_id text,
  credits numeric NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'trial',
  trial_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  ref_id uuid,
  reason text NOT NULL,
  attempt integer,
  amount_cr numeric NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_ref_reason_attempt_uidx
  ON credit_ledger (ref_id, reason, attempt)
  WHERE ref_id IS NOT NULL AND attempt IS NOT NULL;
CREATE TABLE IF NOT EXISTS subscriptions (
  account_id uuid PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  tier text NOT NULL DEFAULT 'trial',
  creem_subscription_id text,
  status text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_creem_subscription_id_uidx
  ON subscriptions (creem_subscription_id)
  WHERE creem_subscription_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS webhook_receipts (
  event_id text PRIMARY KEY,
  type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload_hash text NOT NULL
);`;

describe('live PG paths (loud skip when unreachable)', () => {
  // skipIf, not an early `return` inside the body: a returned test reports PASS,
  // which would make "no database" indistinguishable from "proved against real
  // Postgres". The reason travels in skipReason (and the module-level warn above).
  it.skipIf(!probe.ok)('grants once, and treats a replayed event id as a no-op', async () => {
    const pool = new LivePool({ connectionString });
    const discordId = `creem-live-${Date.now()}`;
    // webhook_receipts is a persistent dedupe table with no FK to accounts, so a
    // fixed event id would be answered as a duplicate on the NEXT run and the
    // "first delivery" assertion below would be a lie about a fresh event. Every
    // id in this test is therefore unique to the run, and the receipts it writes
    // are deleted in the finally block.
    const eventId = `evt_live_${Date.now()}`;
    const statusEventId = `evt_live_status_${Date.now()}`;
    const receiptIds = [eventId, statusEventId];
    try {
      await pool.query(FALLBACK_DDL);
      const inserted = await pool.query<{ id: string }>(
        'INSERT INTO accounts (discord_id, tier) VALUES ($1, $2) RETURNING id',
        [discordId, 'trial'],
      );
      const accountId = inserted.rows[0]?.id;
      expect(accountId).toBeDefined();
      if (accountId === undefined) return;

      const body = subscriptionEvent('subscription.paid', 'active', {
        metadataAccountId: accountId,
        eventId,
      });
      __setPool(pool);

      const first = await POST(webhookRequest(body));
      expect(first.status).toBe(200);
      expect(await first.json()).toEqual({ received: true });

      // Same event id again: the receipt catches it.
      const second = await POST(webhookRequest(body));
      expect(second.status).toBe(200);
      expect(await second.json()).toEqual({ received: true, duplicate: true });

      // A DIFFERENT event id for the SAME payment (the real multi-event case):
      // the receipt cannot catch this one, so the ledger's unique index must.
      const sibling = subscriptionEvent('subscription.paid', 'active', {
        metadataAccountId: accountId,
        eventId: `${eventId}_sibling`,
      });
      receiptIds.push(`${eventId}_sibling`);
      const third = await POST(webhookRequest(sibling));
      expect(third.status).toBe(200);
      expect(await third.json()).toEqual({ received: true, duplicate: true });

      // The account is pro, and there is exactly one ledger row for the grant.
      const account = await pool.query<{ tier: string; creem_id: string | null }>(
        'SELECT tier, creem_id FROM accounts WHERE id = $1',
        [accountId],
      );
      expect(account.rows[0]?.tier).toBe('pro');
      expect(account.rows[0]?.creem_id).toBe(CUSTOMER_ID);

      const ledger = await pool.query<{ count: string; amount_cr: string }>(
        'SELECT COUNT(*)::text AS count, COALESCE(SUM(amount_cr), 0)::text AS amount_cr' +
          ' FROM credit_ledger WHERE account_id = $1',
        [accountId],
      );
      // ONE grant, not two and not three — asserted as a set AND a sum, because
      // the costly defect is the row that should not be there.
      expect(ledger.rows[0]?.count).toBe('1');
      expect(ledger.rows[0]?.amount_cr).toBe(String(MONTHLY_GRANTS.pro));

      const subscription = await pool.query<{ tier: string; status: string }>(
        'SELECT tier, status FROM subscriptions WHERE account_id = $1',
        [accountId],
      );
      expect(subscription.rows[0]).toEqual({ tier: 'pro', status: 'active' });

      // A status-only event moves no money and no tier.
      const pastDue = await POST(
        webhookRequest(
          subscriptionEvent('subscription.past_due', 'past_due', {
            metadataAccountId: accountId,
            eventId: statusEventId,
          }),
        ),
      );
      expect(pastDue.status).toBe(200);
      const after = await pool.query<{ tier: string }>('SELECT tier FROM accounts WHERE id = $1', [
        accountId,
      ]);
      expect(after.rows[0]?.tier).toBe('pro');
      const ledgerAfter = await pool.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM credit_ledger WHERE account_id = $1',
        [accountId],
      );
      expect(ledgerAfter.rows[0]?.count).toBe('1');
    } finally {
      await pool
        .query('DELETE FROM accounts WHERE discord_id = $1', [discordId])
        .catch(() => undefined);
      await pool
        .query('DELETE FROM webhook_receipts WHERE event_id = ANY($1::text[])', [receiptIds])
        .catch(() => undefined);
      await pool.end().catch(() => undefined);
    }
  });
});

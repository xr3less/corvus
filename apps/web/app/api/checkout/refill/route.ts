// POST /api/checkout/refill — open a Creem checkout session for the refill
// pack (TEST MODE ONLY): $5 / 1,000 credits / 90 days, the pack the terms page
// promises ("A $5 refill pack of 1,000 credits, valid for 90 days, is planned").
//
// What this route is allowed to do: ask Creem for a hosted checkout URL and
// hand it back. What it must never do: write accounts.tier or credit_ledger.
// Tier and ledger rows are written by exactly one place — the webhook route
// (HMAC-verified, server-to-server). A redirect is user-controlled browser
// input and can never be a grant; if this route touched the ledger, anybody
// could mint credits by typing a URL.
//
// Money-safety rules baked in here (mirroring checkout/create's guard order):
//   - Session first: no session answers 401 and no upstream call is made, so an
//     anonymous stranger cannot burn API quota or mint checkouts.
//   - Test host only: the session is created against https://test-api.creem.io.
//     There is no live-host branch in this file, so a misconfigured production
//     process cannot charge a real card through this route.
//   - Missing config is honest: if the refill product env is unset we answer
//     503 with an error code and NO checkoutUrl key. We never synthesize a
//     placeholder link, because a fake "success" URL is worse than a visible
//     outage.
//   - metadata.accountId is the ONLY join key the webhook will accept (never
//     the customer email), so the paying account is bound at session creation,
//     server-side, from the session — not from anything the client sent.
//     metadata.kind='refill' is a hint for the sibling webhook agent (which
//     owns refill rows) so it can tell a refill purchase from a subscription
//     purchase that shares the same checkout shape; the accountId join-key
//     contract is unchanged.
//   - request_id carries a `corvus-refill-` prefix (vs `corvus-` for plan
//     checkouts) so a refill attempt is greppable in the Creem dashboard and
//     can never collide with a plan-checkout request id for the same account
//     at the same millisecond.
//
// Field names + host come from the live Creem docs, not memory:
//   https://docs.creem.io/api-reference/endpoint/create-checkout (POST /v1/checkouts)
//   https://docs.creem.io/features/checkout/checkout-api (request_id / success_url / metadata)
//   https://docs.creem.io/getting-started/test-mode (test-api.creem.io host, test keys)
// Response shape is snake_case on the wire (`checkout_url`); we expose it to our
// own client as camelCase `checkoutUrl`, matching the SDK's own mapping.
//
// The $5 / 1,000 / 90-day numbers below are the TERMS truth (terms page +
// credits route's REFILL_CREDITS_SQL window), restated here so the route's
// product contract is greppable next to the env name that selects it. This
// route does not enforce them — Creem sells the dashboard-created product; the
// webhook's refill row and the budget gate enforce the allowance.
//
// Secrets: CREEM_API_KEY is read by NAME only and travels in the x-api-key
// header. It is never logged, never echoed, and never included in an error body.

import { NextResponse } from 'next/server';
import { createSessionReader, type SessionReader } from '../../../../lib/interview/session-bind';

export const CREEM_TEST_API_BASE = 'https://test-api.creem.io';
export const REFILL_UNAVAILABLE_ERROR = 'refill_unavailable';
export const REFILL_UPSTREAM_ERROR = 'refill_upstream_failed';

/** Terms truth for the refill pack (see header): price, grant, and window. */
export const REFILL_PRICE_USD = 5;
export const REFILL_CREDITS = 1000;
export const REFILL_WINDOW_DAYS = 90;

/** Ledger vocabulary for refill rows (matches the credits route + Docs/06). */
export const REFILL_REASON = 'refill';

// `FetchFn` is declared locally rather than imported from lib/auth/discord so
// this route stays importable without dragging the Discord module (and its
// process.env reads) into the graph. Same structural signature, so the two are
// assignment-compatible.
export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface RefillPlan {
  accountId: string;
  productId: string;
  apiKey: string;
  successUrl: string;
}

// Injectable seam (test-only writer), mirroring the sibling routes: the test
// suite replaces it with a recording double so no assertion ever spends a real
// Creem call or needs a network. Production never touches it.
let fetchFn: FetchFn = fetch;

export function __setFetchFn(fn: FetchFn): void {
  fetchFn = fn;
}

export function __resetFetchFn(): void {
  fetchFn = fetch;
}

let sessionReader: SessionReader = createSessionReader();

export function __setSessionReader(reader: SessionReader): void {
  sessionReader = reader;
}

export function __resetSessionReader(): void {
  sessionReader = createSessionReader();
}

// APP_URL is the same base the OAuth callback uses; without it there is no URL
// Creem could redirect back to, so an unset APP_URL is a refusal, not a guess.
function appBase(): string {
  return (process.env.APP_URL ?? '').trim().replace(/\/+$/, '');
}

function errorResponse(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

// request_id: stable-per-checkout, collision-free per attempt, and readable in
// the Creem dashboard. Shape: `corvus-refill-<accountId>-<epochMs>` — the
// `refill` infix keeps it disjoint from plan-checkout ids by construction.
export function buildRefillRequestId(accountId: string, now: number): string {
  return `corvus-refill-${accountId}-${now}`;
}

// Builds the wire payload. Exported so the test suite asserts the exact body we
// send — including the metadata join key — rather than trusting a mock.
export function buildRefillPayload(plan: RefillPlan, now: number): Record<string, unknown> {
  return {
    product_id: plan.productId,
    request_id: buildRefillRequestId(plan.accountId, now),
    success_url: plan.successUrl,
    metadata: { accountId: plan.accountId, kind: 'refill' },
  };
}

// Only a non-empty string is a checkout URL. Anything else — a missing key, a
// number, an object, a blank string — is a malformed upstream answer, and a
// malformed answer must never be handed to the browser as a link.
export function readCheckoutUrl(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const raw = (payload as Record<string, unknown>).checkout_url;
  if (typeof raw !== 'string') {
    return null;
  }
  const url = raw.trim();
  return url === '' ? null : url;
}

export async function POST(req: Request): Promise<NextResponse> {
  // 1. Session, before anything else: no upstream call for an anonymous caller.
  let session = null;
  try {
    session = await sessionReader.getSession(req);
  } catch {
    session = null;
  }
  if (!session) {
    return errorResponse('unauthorized', 401);
  }

  // 2. Config. Each missing piece is reported as its own honest 503 with no
  //    URL in the body — the client shows "payments are not available yet"
  //    instead of a dead button that looks live.
  const apiKey = (process.env.CREEM_API_KEY ?? '').trim();
  // The refill product id is created in the Creem dashboard, not in code, so
  // it reaches us only as an env value. We read the NAME; the value is never
  // logged, echoed, or defaulted to a placeholder.
  const productId = (process.env.CREEM_TEST_PRODUCT_REFILL ?? '').trim();
  const base = appBase();
  if (apiKey === '' || productId === '' || base === '') {
    return errorResponse(REFILL_UNAVAILABLE_ERROR, 503);
  }

  const plan: RefillPlan = {
    accountId: session.accountId,
    productId,
    apiKey,
    successUrl: `${base}/api/checkout/success`,
  };

  // 3. Create the session upstream. Any failure — network, timeout, non-2xx,
  //    unparseable body, a 200 without a usable checkout_url — collapses to the
  //    same 502. Upstream detail is never forwarded: it can carry fragments of
  //    our own request, and the client can do nothing with it anyway.
  try {
    const response = await fetchFn(`${CREEM_TEST_API_BASE}/v1/checkouts`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildRefillPayload(plan, Date.now())),
    });
    if (!response.ok) {
      return errorResponse(REFILL_UPSTREAM_ERROR, 502);
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return errorResponse(REFILL_UPSTREAM_ERROR, 502);
    }
    const checkoutUrl = readCheckoutUrl(payload);
    if (!checkoutUrl) {
      return errorResponse(REFILL_UPSTREAM_ERROR, 502);
    }
    // Deliberately the only success shape: the account id is NOT echoed back
    // (the client already knows who it is; the server keeps the binding).
    return NextResponse.json({ checkoutUrl }, { status: 200 });
  } catch {
    return errorResponse(REFILL_UPSTREAM_ERROR, 502);
  }
}

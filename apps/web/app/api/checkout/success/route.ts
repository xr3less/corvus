// GET /api/checkout/success — where Creem sends the buyer after paying.
//
// This route is a RECEIPT VIEW, not a grant. It writes nothing: no tier, no
// subscription, no ledger row. Creem's own docs say the redirect signature
// exists so you can show a trustworthy confirmation, and that webhooks are what
// production access should be granted from:
//   https://docs.creem.io/features/checkout/checkout-api ("For production
//   applications, we recommend using Webhooks to handle payment events.")
// The tier write lives in /api/webhooks/creem, HMAC-verified server to server.
// Anyone can type this URL, so anything it granted, everyone would have.
//
// It also deliberately does NOT require a session. The buyer may complete
// checkout in a different browser or a fresh device, and a 401 here would show
// a paying customer an error page for a payment that actually succeeded. The
// page is read-only and leaks nothing but the presence of Creem's own signed
// ids, so the correct behavior for an unknown visitor is a calm confirmation.
//
// Copy rule that this file enforces: the page says the payment is being
// FINALIZED. It never says "upgraded", "active", or "Pro is on" — at redirect
// time the webhook may not have landed yet, and a page that claims an upgrade
// the database has not recorded is exactly the dishonesty KI-030 exists to
// prevent.
//
// Signature verification follows the documented algorithm verbatim:
//   - parameters in the order they arrive in the query string (NOT sorted),
//   - null / empty values excluded (the docs are explicit that including
//     `order_id=null` breaks verification),
//   - the `signature` param itself excluded,
//   - `salt=<apiKey>` appended last, `|`-joined, SHA-256 hex,
//   - compared in constant time.
// Source: https://docs.creem.io/features/checkout/checkout-api → "Verifying
// Redirect Signatures".
//
// When CREEM_API_KEY is unset we cannot verify anything, so the page renders the
// honest unverified variant rather than inventing a verification result. The
// user-visible difference between verified and unverified is one sentence, and
// neither variant claims the account changed.

import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';

// "finalizing" is the load-bearing word: it is true at redirect time (the
// webhook may still be in flight), where "upgraded" would be a promise the
// database has not made yet. No string in this file may claim the plan is
// active — the test suite asserts exactly that.
export const CHECKOUT_SUCCESS_MESSAGE = 'Payment received — finalizing your plan.';
export const CHECKOUT_UNVERIFIED_MESSAGE =
  'We could not verify that this page came from Creem, so treat it as unconfirmed.';

const SIGNATURE_PARAM = 'signature';
const SALT_PARAM = 'salt';

export interface SuccessView {
  verified: boolean;
  status: number;
}

// Values that count as "no value" and must be dropped from the signed string.
// Matches the docs' exclusion rule; the literal string "null" is included
// because it is what a URL-encoded null arrives as.
function hasValue(value: string | null): value is string {
  return value !== null && value !== '' && value !== 'null';
}

// Canonical string: `k1=v1|k2=v2|...|salt={apiKey}` in arrival order.
export function canonicalSignatureString(
  pairs: readonly (readonly [string, string])[],
  apiKey: string,
): string {
  const parts: string[] = [];
  for (const [key, value] of pairs) {
    if (key === SIGNATURE_PARAM) {
      continue;
    }
    parts.push(`${key}=${value}`);
  }
  parts.push(`${SALT_PARAM}=${apiKey}`);
  return parts.join('|');
}

export function computeSignature(canonical: string): string {
  return createHash('sha256').update(canonical).digest('hex');
}

// Length-independent and timing-safe: comparing digests of the two candidate
// strings means neither the length nor the content of the correct signature
// leaks through timing. Never a plain `===` on secrets.
export function constantTimeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}

// Reads the params in arrival order straight from the raw query string. We
// deliberately do not use URLSearchParams: it exposes no ordering guarantee, and
// arrival order is exactly what Creem signed.
export function parseOrderedParams(search: string): [string, string][] {
  const query = search.startsWith('?') ? search.slice(1) : search;
  if (query === '') {
    return [];
  }
  const pairs: [string, string][] = [];
  for (const segment of query.split('&')) {
    if (segment === '') {
      continue;
    }
    const eq = segment.indexOf('=');
    const rawKey = eq < 0 ? segment : segment.slice(0, eq);
    const rawValue = eq < 0 ? '' : segment.slice(eq + 1);
    try {
      pairs.push([decodeURIComponent(rawKey), decodeURIComponent(rawValue)]);
    } catch {
      // A malformed escape is not a reason to throw inside a request handler;
      // the raw segment then simply cannot match any real signature.
      pairs.push([rawKey, rawValue]);
    }
  }
  return pairs;
}

function unverified(): SuccessView {
  return { verified: false, status: 401 };
}

// Pure decision: given the raw query string and the API key, is this redirect
// genuinely signed by Creem? Exported for direct unit testing — the HTTP
// handler below is a thin wrapper over it.
export function verifyRedirectSignature(search: string, apiKey: string): boolean {
  if (typeof apiKey !== 'string' || apiKey === '') {
    return false;
  }
  const pairs = parseOrderedParams(search);
  let signature: string | null = null;
  const signed: [string, string][] = [];
  for (const [key, value] of pairs) {
    if (key === SIGNATURE_PARAM) {
      signature = value;
      continue;
    }
    if (!hasValue(value)) {
      continue;
    }
    signed.push([key, value]);
  }
  if (signature === null || signature === '') {
    return false;
  }
  return constantTimeEqual(signature, computeSignature(canonicalSignatureString(signed, apiKey)));
}

export function resolveSuccessView(search: string, apiKey: string): SuccessView {
  if (apiKey === '') {
    return unverified();
  }
  return verifyRedirectSignature(search, apiKey) ? { verified: true, status: 200 } : unverified();
}

// Deliberately NOT named "upgraded" and deliberately not a fetch of account
// state: the wording is the honest description of what is true at redirect
// time, which is that the webhook may still be in flight.
function renderHtml(view: SuccessView, requestId: string | null): string {
  const headline = view.verified ? CHECKOUT_SUCCESS_MESSAGE : CHECKOUT_UNVERIFIED_MESSAGE;
  const detail = view.verified
    ? 'We are finishing the activation now — this usually takes a few seconds, and the dashboard shows your plan as soon as it lands.'
    : 'If you completed a payment, it will still be applied by our payment provider. Open the dashboard to check your plan.';
  const reference =
    requestId === null ? '' : `<p class="ref">Reference: ${escapeHtml(requestId)}</p>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Checkout</title>
<style>
  :root {
    --color-bg: #f8fafc;
    --color-surface: #ffffff;
    --color-text: #0f172a;
    --color-muted: #64748b;
    --color-border: #e2e8f0;
    --color-primary: #1e40af;
    --radius-card: 10px;
    --shadow-raised: 0 1px 2px rgb(15 23 42 / 0.06);
  }
  body {
    margin: 0;
    background: var(--color-bg);
    color: var(--color-text);
    font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 16px;
    line-height: 24px;
  }
  main {
    max-width: 560px;
    margin: 64px auto;
    padding: 32px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-raised);
  }
  h1 { font-size: 24px; line-height: 32px; font-weight: 700; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .ref { color: var(--color-muted); font-size: 14px; }
  a { color: var(--color-primary); }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(headline)}</h1>
<p>${escapeHtml(detail)}</p>
${reference}
<p><a href="/dashboard">Back to dashboard</a></p>
</main>
</body>
</html>`;
}

// The reference id comes from Creem's own signed, URL-encoded query string, so
// it is attacker-influenced text: it is escaped before it reaches the document.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function GET(req: Request): Promise<Response> {
  const search = new URL(req.url).search;
  const apiKey = (process.env.CREEM_API_KEY ?? '').trim();
  const view = resolveSuccessView(search, apiKey);
  const pairs = parseOrderedParams(search);
  const requestId = pairs.find(([key]) => key === 'request_id')?.[1] ?? null;
  return new NextResponse(renderHtml(view, requestId), {
    status: view.status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // A receipt page is never cached: the signature is single-use context.
      'cache-control': 'no-store',
    },
  });
}

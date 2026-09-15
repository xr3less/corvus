import { NextResponse } from 'next/server';
import { scriptedBrain } from '../../../../lib/demo/brain';
import type { DemoBrain } from '../../../../lib/demo/brain';

// Single-process v1: per-IP fixed-window counters live in this module-level
// Map. No durable store. Clients without a forwarded address share one
// bucket keyed as unknown. Replace with shared storage only if abused.
const LIMIT_PER_HOUR = 20;
const WINDOW_MS = 60 * 60 * 1000;
const UNKNOWN_BUCKET = 'unknown';

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

let nowFn: () => number = () => Date.now();

export function __setNow(fn: () => number): void {
  nowFn = fn;
}

export function __resetNow(): void {
  nowFn = () => Date.now();
}

export function __clearBuckets(): void {
  buckets.clear();
}

function clientIp(req: Request): string {
  const raw = req.headers.get('x-forwarded-for');
  if (raw === null) {
    return UNKNOWN_BUCKET;
  }
  const first = raw.split(',')[0];
  if (first === undefined) {
    return UNKNOWN_BUCKET;
  }
  const trimmed = first.trim();
  return trimmed === '' ? UNKNOWN_BUCKET : trimmed;
}

function invalid(): NextResponse {
  return NextResponse.json({ error: 'invalid text' }, { status: 422 });
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalid();
  }
  if (typeof body !== 'object' || body === null) {
    return invalid();
  }
  const text = (body as { text?: unknown }).text;
  if (typeof text !== 'string') {
    return invalid();
  }
  const trimmed = text.trim();
  if (trimmed.length < 1 || trimmed.length > 500) {
    return invalid();
  }

  const now = nowFn();
  const ip = clientIp(req);
  const record = buckets.get(ip);
  if (record === undefined || now - record.windowStart >= WINDOW_MS) {
    buckets.set(ip, { count: 1, windowStart: now });
  } else if (record.count >= LIMIT_PER_HOUR) {
    const retryAfterSeconds = Math.ceil((record.windowStart + WINDOW_MS - now) / 1000);
    return NextResponse.json(
      { error: 'slow down', retryAfterSeconds },
      { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
    );
  } else {
    record.count += 1;
  }

  const brain: DemoBrain = scriptedBrain; // the persona swap changes ONE line
  const reply = await brain.reply(trimmed);
  return NextResponse.json({ reply }, { status: 200 });
}

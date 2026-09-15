/*
 * DEV-ONLY local vote sink for the /pick component picker.
 *
 * Never linked from production navigation, never shipped to users. It writes a
 * plain JSON file at `<cwd>/.pick-votes/votes.json` — run the dev server from
 * `apps/web` (e.g. `npm run dev --workspace apps/web`) so the file lands at
 * `apps/web/.pick-votes/votes.json` for the orchestrator to read.
 *
 * POST  { variantId: string (1..64), delta: 1 | -1 } -> { votes }
 * DELETE                                            -> clears all -> { votes: {} }
 *
 * Never throws unhandled: 400 on bad input, 500 with a plain message on IO
 * failure. No durable store, no auth — this is a local dev tool only.
 *
 * Production guard: when NODE_ENV is 'production' every handler answers 404
 * with an empty body, so the endpoint is unreachable outside dev/test.
 */
import { NextResponse } from 'next/server';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_VARIANT_ID_LENGTH = 64;
const VOTES_DIR = path.join(process.cwd(), '.pick-votes');
const VOTES_FILE = path.join(VOTES_DIR, 'votes.json');

type Votes = Record<string, number>;

async function readVotes(): Promise<Votes> {
  try {
    const raw = await readFile(VOTES_FILE, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const votes: Votes = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        votes[key] = Math.max(0, Math.floor(value));
      }
    }
    return votes;
  } catch {
    // Missing file, unreadable file, or malformed JSON all mean "no votes yet".
    return {};
  }
}

async function writeVotes(votes: Votes): Promise<void> {
  await mkdir(VOTES_DIR, { recursive: true });
  await writeFile(VOTES_FILE, `${JSON.stringify(votes, null, 2)}\n`, 'utf8');
}

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function prodNotFound(): NextResponse {
  return new NextResponse(null, { status: 404 });
}

export async function POST(req: Request): Promise<NextResponse> {
  if (isProduction()) {
    return prodNotFound();
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest('gövde okunamadı');
  }
  if (typeof body !== 'object' || body === null) {
    return badRequest('gövde bir nesne olmalı');
  }

  const { variantId, delta } = body as { variantId?: unknown; delta?: unknown };
  if (typeof variantId !== 'string') {
    return badRequest('variantId metin olmalı');
  }
  const id = variantId.trim();
  if (id.length < 1 || id.length > MAX_VARIANT_ID_LENGTH) {
    return badRequest('variantId 1 ile 64 karakter arasında olmalı');
  }
  if (delta !== 1 && delta !== -1) {
    return badRequest('delta 1 veya -1 olmalı');
  }

  try {
    const votes = await readVotes();
    votes[id] = Math.max(0, (votes[id] ?? 0) + delta);
    await writeVotes(votes);
    return NextResponse.json({ votes }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'oy kaydedilemedi' }, { status: 500 });
  }
}

export async function DELETE(): Promise<NextResponse> {
  if (isProduction()) {
    return prodNotFound();
  }
  try {
    await writeVotes({});
    return NextResponse.json({ votes: {} }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'oylar temizlenemedi' }, { status: 500 });
  }
}

// POST /api/bots/[botId]/token — store a bot token (E6 token custody).
// GET /api/bots/[botId]/token — presence-only status ({ saved, length }).
//
// The token is encrypted with AES-256-GCM (AAD = bot id) before it is written
// to bots.token_cipher, mirroring apps/gateway/src/lib/crypto.ts (whose
// decrypt side is already live at gateway boot). The web package must not
// import gateway internals (see the publish-route contract note), so the
// minimal envelope is duplicated here — same algorithm, same AAD, same
// ENCRYPTION_KEY shape (64 hex chars or base64 of 32 bytes; shape only, never
// values — see .env.example).
//
// Ownership: the bot must belong to the session account or the route answers
// 404 — unknown, foreign, and malformed ids share the exact same shape, so
// bot existence never leaks (never a 403). The token value is never returned,
// never logged, and never appears in an error message: GET answers
// presence-only { saved, length } and POST answers the same shape.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getPool, mapDbError, __setPool } from '../../../../../lib/db/pool';
import { defaultSessionReader } from '../../../../../lib/interview/session-bind';
import { isUuid } from '../../../../../lib/editor/drafts';

export interface TokenSession {
  accountId: string;
  discordId: string;
}

export interface SessionReader {
  getSession(req: Request): Promise<TokenSession | null>;
}

// Re-exported so route tests inject a pool without touching env vars
// (mirrors app/api/bots/[botId]/activity/route.ts).
export { __setPool };

const closedReader: SessionReader = {
  getSession: async () => null,
};

let sessionReader: SessionReader = defaultSessionReader;

export function __setSessionReader(reader: SessionReader): void {
  sessionReader = reader;
}

export function __resetSessionReader(): void {
  sessionReader = closedReader;
}

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

// --- Token envelope (mirrors apps/gateway/src/lib/crypto.ts) ----------------
// Duplicated inline because web must not import gateway internals. Any change
// to the gateway envelope (algorithm, layout, AAD) must be mirrored here, or
// the web writer and the gateway reader stop agreeing.

const ALGORITHM = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;
const MIN_ENVELOPE_LEN = IV_LEN + TAG_LEN + 1;

export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoError';
  }
}

function loadKey(): Buffer {
  const raw = process.env['ENCRYPTION_KEY'];
  const trimmed = (raw ?? '').trim();
  if (trimmed.length === 0) {
    throw new CryptoError('invalid ENCRYPTION_KEY: must decode to exactly 32 bytes');
  }
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }
  if (/^[A-Za-z0-9+/]*={0,2}$/.test(trimmed) && trimmed.length % 4 === 0) {
    const decoded = Buffer.from(trimmed, 'base64');
    if (decoded.length === KEY_LEN) {
      return decoded;
    }
  }
  throw new CryptoError('invalid ENCRYPTION_KEY: must decode to exactly 32 bytes');
}

function requireBotId(botId: string): void {
  if (typeof botId !== 'string' || botId.trim().length === 0) {
    throw new CryptoError('encrypt failed: empty bot id');
  }
}

// Layout: iv (12) | tag (16) | ciphertext. AAD is the bot id, so a cipher
// written for one bot never decrypts under another.
export function encryptToken(botId: string, token: string): Buffer {
  requireBotId(botId);
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new CryptoError('encrypt failed: empty token');
  }
  const key = loadKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(botId, 'utf8'));
  const ct = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

export function decryptToken(botId: string, data: Buffer): string {
  if (typeof botId !== 'string' || botId.trim().length === 0) {
    throw new CryptoError('decrypt failed: empty bot id');
  }
  if (!Buffer.isBuffer(data) || data.length < MIN_ENVELOPE_LEN) {
    throw new CryptoError('decrypt failed: truncated input');
  }
  const key = loadKey();
  const iv = data.subarray(0, IV_LEN);
  const tag = data.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = data.subarray(IV_LEN + TAG_LEN);
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(Buffer.from(botId, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    throw new CryptoError('decrypt failed: authentication');
  }
}

// True only for the key-shape failures (missing/malformed ENCRYPTION_KEY).
// Used to answer an honest 'not configured' instead of a generic failure —
// the matched message names the variable, never any value.
function keyMisconfigured(err: unknown): boolean {
  return err instanceof CryptoError && err.message.includes('ENCRYPTION_KEY');
}

// --- Validation (pure, token bytes never leave the caller) -------------------

// Generous abuse cap, far above any real Discord token: the route validates
// shape only, never the token format (formats change; the gateway login is
// the honest judge of a wrong token).
export const MAX_TOKEN_CHARS = 2000;

export type TokenValidation =
  | { ok: true; value: string }
  | { ok: false; status: 422; error: string };

export function validateTokenInput(value: unknown): TokenValidation {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false, status: 422, error: 'token must be a non-empty string' };
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_TOKEN_CHARS) {
    return { ok: false, status: 422, error: 'token is too long' };
  }
  return { ok: true, value: trimmed };
}

// --- Presence (touches the key only when a token is actually stored) ---------

export interface TokenPresence {
  saved: boolean;
  length: number;
}

// An empty cipher is the mint placeholder (no token custody on mint), so it
// resolves without the key. Anything longer is measured by decrypting — the
// plaintext is returned only as a length, never as bytes.
export function readPresence(botId: string, cipher: Buffer): TokenPresence {
  if (cipher.length === 0) {
    return { saved: false, length: 0 };
  }
  return { saved: true, length: decryptToken(botId, cipher).length };
}

// pg returns bytea as a Buffer; accept the '\\x<hex>' text shape too so a
// differently-configured driver still reads instead of failing the status.
function toCipherBytes(value: unknown): Buffer | null {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (typeof value === 'string' && value.startsWith('\\x')) {
    return Buffer.from(value.slice(2), 'hex');
  }
  return null;
}

// --- SQL ---------------------------------------------------------------------

export const SELECT_TOKEN_SQL =
  'SELECT token_cipher FROM bots WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL';

export const OWNED_BOT_SQL =
  'SELECT 1 FROM bots WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL';

export const UPDATE_TOKEN_SQL =
  'UPDATE bots SET token_cipher = $1, updated_at = now() ' +
  'WHERE id = $2 AND account_id = $3 AND deleted_at IS NULL';

// --- Routes ------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ botId: string }> },
): Promise<Response> {
  const session = await sessionReader.getSession(req);
  if (!session) {
    return error(401, 'unauthorized');
  }

  const { botId } = await params;
  if (!isUuid(botId)) {
    return error(404, 'not found');
  }

  try {
    const result = await getPool().query<{ token_cipher: Buffer }>(SELECT_TOKEN_SQL, [
      botId,
      session.accountId,
    ]);
    const row = result.rows[0];
    if (!row) {
      return error(404, 'not found');
    }
    // Presence-only: the cipher row is measured, never returned.
    const cipher = toCipherBytes(row.token_cipher);
    if (!cipher) {
      return error(500, 'could not load token status');
    }
    try {
      return Response.json(readPresence(botId, cipher), { status: 200 });
    } catch (err) {
      if (keyMisconfigured(err)) {
        return error(500, 'token storage not configured');
      }
      return error(500, 'could not load token status');
    }
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not load token status');
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ botId: string }> },
): Promise<Response> {
  const session = await sessionReader.getSession(req);
  if (!session) {
    return error(401, 'unauthorized');
  }

  const { botId } = await params;
  if (!isUuid(botId)) {
    return error(404, 'not found');
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error(422, 'body must be JSON');
  }
  const checked = validateTokenInput((body as { token?: unknown } | null)?.token);
  if (!checked.ok) {
    return error(checked.status, checked.error);
  }

  const pool = getPool();

  try {
    const owned = await pool.query(OWNED_BOT_SQL, [botId, session.accountId]);
    if (owned.rowCount !== 1) {
      return error(404, 'not found');
    }

    let cipher: Buffer;
    try {
      cipher = encryptToken(botId, checked.value);
    } catch (err) {
      if (keyMisconfigured(err)) {
        return error(500, 'token storage not configured');
      }
      return error(500, 'could not save token');
    }

    const updated = await pool.query(UPDATE_TOKEN_SQL, [cipher, botId, session.accountId]);
    if (updated.rowCount !== 1) {
      // Deleted between the gate and the write — still 404-shaped, never a leak.
      return error(404, 'not found');
    }
    // Same presence-only shape as GET: saved flag + plaintext length, never
    // the value. The plaintext lives only in this closure and is never logged.
    return Response.json({ saved: true, length: checked.value.length }, { status: 200 });
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      return error(mapped.status, mapped.error);
    }
    return error(500, 'could not save token');
  }
}

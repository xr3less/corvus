import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

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

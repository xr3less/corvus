import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CryptoError, decryptToken, encryptToken } from './crypto.js';

const BOT_ID = 'bot-row-001';
const TOKEN = 'xoxb-fake-token-for-tests-only-12345';
const UNICODE_TOKEN = 's3cr3t-🔑-ünïcödé-トークン-🚀';

function stubBase64Key(bytes?: Buffer): Buffer {
  const key = bytes ?? randomBytes(32);
  vi.stubEnv('ENCRYPTION_KEY', key.toString('base64'));
  return key;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('crypto token envelope', () => {
  it('round-trips decrypt(encrypt(x)) === x', () => {
    stubBase64Key();
    const envelope = encryptToken(BOT_ID, TOKEN);
    expect(Buffer.isBuffer(envelope)).toBe(true);
    expect(decryptToken(BOT_ID, envelope)).toBe(TOKEN);
  });

  it('round-trips a unicode token byte-for-byte', () => {
    stubBase64Key();
    const envelope = encryptToken(BOT_ID, UNICODE_TOKEN);
    expect(decryptToken(BOT_ID, envelope)).toBe(UNICODE_TOKEN);
  });

  it('lays out iv(12B) ‖ tag(16B) ‖ ct and randomizes the iv', () => {
    stubBase64Key();
    const a = encryptToken(BOT_ID, TOKEN);
    const b = encryptToken(BOT_ID, TOKEN);
    expect(a.length).toBe(28 + Buffer.byteLength(TOKEN, 'utf8'));
    expect(a.subarray(0, 12)).not.toEqual(b.subarray(0, 12));
    expect(a.equals(b)).toBe(false);
    expect(decryptToken(BOT_ID, a)).toBe(TOKEN);
    expect(decryptToken(BOT_ID, b)).toBe(TOKEN);
  });

  it('accepts a hex ENCRYPTION_KEY', () => {
    const key = randomBytes(32);
    vi.stubEnv('ENCRYPTION_KEY', key.toString('hex'));
    const envelope = encryptToken(BOT_ID, TOKEN);
    expect(decryptToken(BOT_ID, envelope)).toBe(TOKEN);
  });

  it('fails closed on a wrong key', () => {
    const keyA = randomBytes(32);
    let keyB = randomBytes(32);
    while (keyB.equals(keyA)) {
      keyB = randomBytes(32);
    }
    vi.stubEnv('ENCRYPTION_KEY', keyA.toString('base64'));
    const envelope = encryptToken(BOT_ID, TOKEN);
    vi.stubEnv('ENCRYPTION_KEY', keyB.toString('base64'));
    expect(() => decryptToken(BOT_ID, envelope)).toThrow(CryptoError);
  });

  it('fails closed on a wrong botId (AAD row-swap)', () => {
    stubBase64Key();
    const envelope = encryptToken(BOT_ID, TOKEN);
    expect(() => decryptToken('bot-row-002', envelope)).toThrow(CryptoError);
  });

  it('fails closed on a flipped bit in the ciphertext', () => {
    stubBase64Key();
    const envelope = encryptToken(BOT_ID, TOKEN);
    const tampered = Buffer.from(envelope);
    tampered[tampered.length - 1] = tampered[tampered.length - 1] ^ 0x01;
    expect(() => decryptToken(BOT_ID, tampered)).toThrow(CryptoError);
  });

  it('fails closed on a flipped bit in the tag', () => {
    stubBase64Key();
    const envelope = encryptToken(BOT_ID, TOKEN);
    const tampered = Buffer.from(envelope);
    tampered[12] = tampered[12] ^ 0x01;
    expect(() => decryptToken(BOT_ID, tampered)).toThrow(CryptoError);
  });

  it('fails closed on truncated input', () => {
    stubBase64Key();
    const envelope = encryptToken(BOT_ID, TOKEN);
    expect(() => decryptToken(BOT_ID, envelope.subarray(0, envelope.length - 1))).toThrow(
      CryptoError,
    );
    expect(() => decryptToken(BOT_ID, Buffer.alloc(10))).toThrow(CryptoError);
    expect(() => decryptToken(BOT_ID, Buffer.alloc(0))).toThrow(CryptoError);
  });

  it('never leaks plaintext or key material in error messages', () => {
    const key = stubBase64Key();
    const envelope = encryptToken(BOT_ID, TOKEN);
    const tampered = Buffer.from(envelope);
    tampered[tampered.length - 1] = tampered[tampered.length - 1] ^ 0x01;
    try {
      decryptToken(BOT_ID, tampered);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(CryptoError);
      const message = (err as Error).message;
      expect(message).not.toContain(TOKEN);
      expect(message).not.toContain(key.toString('base64'));
      expect(message).not.toContain(key.toString('hex'));
    }
  });

  it.each([
    ['empty botId', '', TOKEN],
    ['whitespace botId', '   ', TOKEN],
    ['empty token', BOT_ID, ''],
    ['whitespace token', BOT_ID, '   '],
  ])('throws on %s (never encrypts nothing)', (_label, botId, token) => {
    stubBase64Key();
    expect(() => encryptToken(botId, token)).toThrow(CryptoError);
  });

  it('throws on empty botId at decrypt time', () => {
    stubBase64Key();
    const envelope = encryptToken(BOT_ID, TOKEN);
    expect(() => decryptToken('', envelope)).toThrow(CryptoError);
    expect(() => decryptToken('  ', envelope)).toThrow(CryptoError);
  });

  it('throws on missing/empty ENCRYPTION_KEY at first use', () => {
    vi.stubEnv('ENCRYPTION_KEY', '');
    expect(() => encryptToken(BOT_ID, TOKEN)).toThrow(CryptoError);
    vi.stubEnv('ENCRYPTION_KEY', '   ');
    expect(() => decryptToken(BOT_ID, Buffer.alloc(64))).toThrow(CryptoError);
  });

  it('throws on a wrong-length ENCRYPTION_KEY', () => {
    vi.stubEnv('ENCRYPTION_KEY', randomBytes(16).toString('base64'));
    expect(() => encryptToken(BOT_ID, TOKEN)).toThrow(CryptoError);
    vi.stubEnv('ENCRYPTION_KEY', randomBytes(16).toString('hex'));
    expect(() => encryptToken(BOT_ID, TOKEN)).toThrow(CryptoError);
  });

  it('throws on an undecodable ENCRYPTION_KEY', () => {
    vi.stubEnv('ENCRYPTION_KEY', 'not-a-key!!!');
    expect(() => encryptToken(BOT_ID, TOKEN)).toThrow(CryptoError);
  });
});

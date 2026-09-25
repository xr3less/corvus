// Unit tests for the trial-only DNS workaround (./dns-fix.js).
// Fully hermetic: dns.resolve4 is stubbed, so no network is touched and no
// public-DNS results are asserted — only the delegation logic is tested.

import dns from 'node:dns';
import { afterEach, describe, expect, it, vi } from 'vitest';
import './dns-fix.js';

type Resolve4 = typeof dns.resolve4;
type Resolve4Callback = (err: NodeJS.ErrnoException | null, addresses: string[]) => void;

function stubResolve4(impl: (hostname: string, callback: Resolve4Callback) => void): void {
  vi.spyOn(dns, 'resolve4').mockImplementation(impl as unknown as Resolve4);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('dns-fix', () => {
  it('leaves dns.lookup as a function', () => {
    expect(typeof dns.lookup).toBe('function');
  });

  it('prefers the public-DNS answer when resolve4 succeeds', async () => {
    stubResolve4((_hostname, callback) => {
      callback(null, ['203.0.113.7']);
    });
    const result = await new Promise<{ address: string; family: number }>((resolve, reject) => {
      dns.lookup('example.invalid', (err, address, family) => {
        if (err !== null) {
          reject(err);
        } else {
          resolve({ address, family });
        }
      });
    });
    expect(result.address).toBe('203.0.113.7');
    expect(result.family).toBe(4);
  });

  it('falls back to the OS resolver when public DNS fails', async () => {
    stubResolve4((_hostname, callback) => {
      callback(Object.assign(new Error('mock public-DNS failure'), { code: 'ENOTFOUND' }), []);
    });
    const address = await new Promise<string>((resolve, reject) => {
      dns.lookup('localhost', (err, resolved) => {
        if (err !== null) {
          reject(err);
        } else {
          resolve(resolved);
        }
      });
    });
    expect(typeof address).toBe('string');
    expect(address.length).toBeGreaterThan(0);
  });

  it('returns array form when all:true and public DNS succeeds', async () => {
    stubResolve4((_hostname, callback) => {
      callback(null, ['203.0.113.7']);
    });
    const result = await new Promise<dns.LookupAddress[]>((resolve, reject) => {
      dns.lookup('example.invalid', { all: true }, (err, addresses) => {
        if (err !== null) {
          reject(err);
        } else {
          resolve(addresses);
        }
      });
    });
    expect(result).toEqual([{ address: '203.0.113.7', family: 4 }]);
  });

  it('preserves all:true on fallback when public DNS fails', async () => {
    stubResolve4((_hostname, callback) => {
      callback(Object.assign(new Error('mock public-DNS failure'), { code: 'ENOTFOUND' }), []);
    });
    // localhost resolves via the OS resolver with no network traffic. If the
    // fallback stripped the all:true option, the callback would receive a
    // string instead of an array, so the Array check below proves passthrough.
    const result = await new Promise<dns.LookupAddress[]>((resolve, reject) => {
      dns.lookup('localhost', { all: true }, (err, addresses) => {
        if (err !== null) {
          reject(err);
        } else {
          resolve(addresses);
        }
      });
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    for (const entry of result) {
      expect(typeof entry.address).toBe('string');
    }
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ADMINISTRATOR_BIT,
  CAPABILITY_MAP,
  DEFAULT_CAPABILITIES,
  VALID_CAPABILITIES,
  buildInvite,
  capabilityBitfield,
  type Capability,
} from './permissions';
import { GET } from '../../app/api/invite/route';

const TEST_CLIENT_ID = '123456789012345678';

function allSubsets<T>(items: readonly T[]): T[][] {
  const out: T[][] = [[]];
  for (const item of items) {
    for (const existing of [...out]) {
      out.push([...existing, item]);
    }
  }
  return out;
}

describe('invite permissions', () => {
  describe('bitfield math', () => {
    it('computes the welcome bitfield exactly', () => {
      // ViewChannel (1024) | SendMessages (2048) | EmbedLinks (16384).
      expect(capabilityBitfield(['welcome'])).toBe(19456n);
    });

    it('computes the moderation bitfield exactly', () => {
      // Kick (2) | Ban (4) | Timeout 1<<40 | ManageMessages (8192) | ReadHistory (65536).
      expect(capabilityBitfield(['moderation'])).toBe(1099511701510n);
    });

    it('dedupes shared permissions across combined capabilities', () => {
      const combined = capabilityBitfield(['welcome', 'logging']);
      const separate = capabilityBitfield(['welcome']) | capabilityBitfield(['logging']);
      expect(combined).toBe(separate);
      const invite = buildInvite({
        clientId: TEST_CLIENT_ID,
        capabilities: ['welcome', 'logging'],
      });
      const names = invite.permissions.map((entry) => entry.perm);
      expect(names.length).toBe(new Set(names).size);
    });
  });

  describe('Administrator never', () => {
    it('excludes Administrator across ALL capability subsets (exhaustive)', () => {
      const subsets = allSubsets(VALID_CAPABILITIES);
      expect(subsets.length).toBe(64);
      for (const subset of subsets) {
        const bits = capabilityBitfield(subset as Capability[]);
        expect(bits & ADMINISTRATOR_BIT).toBe(0n);
        if (subset.length > 0) {
          const invite = buildInvite({ clientId: TEST_CLIENT_ID, capabilities: subset });
          expect(invite.permissions.some((entry) => entry.perm === 'Administrator')).toBe(false);
        }
      }
    });

    it('throws if the map ever gains the Administrator bit', () => {
      expect(ADMINISTRATOR_BIT).toBe(8n);
      for (const capability of VALID_CAPABILITIES) {
        expect(CAPABILITY_MAP[capability].some((entry) => entry.perm === 'Administrator')).toBe(
          false,
        );
      }
    });
  });

  describe('why-lines and defaults', () => {
    it('carries a non-empty why-line for every permission in every capability', () => {
      for (const capability of VALID_CAPABILITIES) {
        for (const entry of CAPABILITY_MAP[capability]) {
          expect(entry.perm.length).toBeGreaterThan(0);
          expect(entry.why.length).toBeGreaterThan(0);
        }
      }
    });

    it('keeps the default set at or under 6 permissions', () => {
      const invite = buildInvite({ clientId: TEST_CLIENT_ID, capabilities: DEFAULT_CAPABILITIES });
      expect(invite.permissions.length).toBeGreaterThan(0);
      expect(invite.permissions.length).toBeLessThanOrEqual(6);
    });

    it('builds the SPEC invite URL shape', () => {
      const invite = buildInvite({ clientId: TEST_CLIENT_ID, capabilities: ['welcome'] });
      expect(invite.url).toBe(
        `https://discord.com/oauth2/authorize?client_id=${TEST_CLIENT_ID}` +
          '&permissions=19456&guild_id=&disable_guild_select=false&scope=bot%20applications.commands',
      );
    });
  });

  describe('GET /api/invite', () => {
    const savedClientId = process.env.DISCORD_CLIENT_ID;

    beforeEach(() => {
      process.env.DISCORD_CLIENT_ID = TEST_CLIENT_ID;
    });

    afterEach(() => {
      process.env.DISCORD_CLIENT_ID = savedClientId;
    });

    it('returns 200 with url + permissions for valid capabilities', async () => {
      const res = await GET(
        new Request('http://localhost/api/invite?capabilities=welcome,tickets'),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        url: string;
        permissions: { perm: string; why: string }[];
      };
      expect(body.url).toContain(`client_id=${TEST_CLIENT_ID}`);
      expect(body.url).toContain('scope=bot%20applications.commands');
      expect(body.permissions.length).toBeGreaterThan(0);
      for (const entry of body.permissions) {
        expect(entry.why.length).toBeGreaterThan(0);
      }
    });

    it('falls back to the default set when the param is empty or missing', async () => {
      for (const url of [
        'http://localhost/api/invite',
        'http://localhost/api/invite?capabilities=',
      ]) {
        const res = await GET(new Request(url));
        expect(res.status).toBe(200);
        const body = (await res.json()) as { url: string; permissions: unknown[] };
        expect(body.permissions.length).toBeLessThanOrEqual(6);
      }
    });

    it('returns 422 with the valid list for unknown capabilities', async () => {
      const res = await GET(new Request('http://localhost/api/invite?capabilities=welcome,admin'));
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: string; valid: string[] };
      expect(body.error).toContain('admin');
      expect(body.valid).toEqual([...VALID_CAPABILITIES]);
    });
  });
});

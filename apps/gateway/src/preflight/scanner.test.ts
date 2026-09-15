import { PermissionFlagsBits } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { scanGuild, type ScanDeps, type ScanInput } from './scanner.js';

const VIEW = PermissionFlagsBits.ViewChannel;
const SEND = PermissionFlagsBits.SendMessages;

type Role = { id: string; name: string; position: number };
type Channel = {
  id: string;
  name: string;
  type: string;
  overwrites: { roleId: string; allow: string; deny: string }[];
};

function makeRoles(total: number, botPos: number): Role[] {
  const roles: Role[] = [];
  for (let pos = 0; pos < total; pos += 1) {
    if (pos === botPos) roles.push({ id: 'role-bot', name: 'Corvus', position: pos });
    else if (pos === 0) roles.push({ id: 'role-everyone', name: '@everyone', position: 0 });
    else roles.push({ id: `role-${pos}`, name: `Role ${pos}`, position: pos });
  }
  return roles;
}

function textChannel(name: string, denyBot = '0', type = 'GUILD_TEXT'): Channel {
  return {
    id: `ch-${name}`,
    name,
    type,
    overwrites: denyBot === '0' ? [] : [{ roleId: 'role-bot', allow: '0', deny: denyBot }],
  };
}

function greenInput(): ScanInput {
  return {
    guildId: '123456789012345678',
    botUserId: '987654321098765432',
    required: [
      { perm: 'ViewChannel', why: 'I need ViewChannel to read the channels I moderate.' },
      { perm: 'SendMessages', why: 'I need SendMessages to post warnings and summaries.' },
    ],
    requiredBitfield: (VIEW | SEND).toString(),
    intents: ['GuildMembers'],
    expectedCommands: 3,
  };
}

function greenDeps(): ScanDeps {
  return {
    getRoles: async () => makeRoles(8, 7),
    getChannels: async () => [textChannel('general'), textChannel('announcements')],
    getBotMember: async () => ({
      roles: ['role-bot'],
      permissions: (VIEW | SEND | PermissionFlagsBits.ManageMessages).toString(),
    }),
    probeIntents: async () => [{ intent: 'GuildMembers', ok: true }],
    getCommandCount: async () => 3,
  };
}

function rowsFor(check: string, deps: ScanDeps, input: ScanInput = greenInput()) {
  return scanGuild(input, deps).then((rows) => rows.filter((row) => row.check === check));
}

describe('installed', () => {
  it('returns one red row with the dashboard fix when the bot member is null', async () => {
    const deps = greenDeps();
    deps.getBotMember = async () => null;
    const rows = await scanGuild(greenInput(), deps);
    const installed = rows.filter((row) => row.check === 'installed');
    expect(installed).toHaveLength(1);
    expect(installed[0]?.tone).toBe('red');
    expect(installed[0]?.fix).toBe('Install the bot from the dashboard, then re-run the scan.');
  });

  it('degrades member-dependent checks to yellow and keeps check order when not installed', async () => {
    const deps = greenDeps();
    deps.getBotMember = async () => null;
    const rows = await scanGuild(greenInput(), deps);
    expect(rows.map((row) => row.check)).toEqual([
      'installed',
      'role-position',
      'permissions',
      'channels',
      'intents',
      'commands-sync',
    ]);
    for (const check of ['role-position', 'permissions', 'channels'] as const) {
      const found = rows.filter((row) => row.check === check);
      expect(found).toHaveLength(1);
      expect(found[0]?.tone).toBe('yellow');
    }
    expect(rows.filter((row) => row.tone === 'red')).toHaveLength(1);
  });

  it('returns green when the bot is a member', async () => {
    const installed = await rowsFor('installed', greenDeps());
    expect(installed).toHaveLength(1);
    expect(installed[0]?.tone).toBe('green');
  });
});

describe('role-position', () => {
  it('is red when the bot role sits at the bottom (p <= 1)', async () => {
    const deps = greenDeps();
    deps.getRoles = async () => makeRoles(8, 1);
    const found = await rowsFor('role-position', deps);
    expect(found).toHaveLength(1);
    expect(found[0]?.tone).toBe('red');
    expect(found[0]?.detail).toContain('sits at the bottom');
    expect(found[0]?.detail).toContain('I cannot act on anyone with a higher role');
    expect(found[0]?.fix).toBe(
      'Drag the bot role above the roles it manages, then re-run the scan.',
    );
  });

  it('is red when only one role exists (N <= 1)', async () => {
    const deps = greenDeps();
    deps.getRoles = async () => [{ id: 'role-everyone', name: '@everyone', position: 0 }];
    deps.getBotMember = async () => ({ roles: ['role-everyone'], permissions: '0' });
    const found = await rowsFor('role-position', deps);
    expect(found).toHaveLength(1);
    expect(found[0]?.tone).toBe('red');
  });

  it('is green exactly at the top-quartile boundary (p = ceil(3N/4))', async () => {
    const deps = greenDeps();
    deps.getRoles = async () => makeRoles(8, 6);
    const found = await rowsFor('role-position', deps);
    expect(found).toHaveLength(1);
    expect(found[0]?.tone).toBe('green');
    expect(found[0]?.detail).toContain('6');
    expect(found[0]?.detail).toContain('8');
  });

  it('is yellow just below the top-quartile boundary', async () => {
    const deps = greenDeps();
    deps.getRoles = async () => makeRoles(8, 5);
    const found = await rowsFor('role-position', deps);
    expect(found).toHaveLength(1);
    expect(found[0]?.tone).toBe('yellow');
    expect(found[0]?.detail).toContain('5');
    expect(found[0]?.detail).toContain('8');
  });

  it('is yellow when my roles are missing from the role list', async () => {
    const deps = greenDeps();
    deps.getBotMember = async () => ({ roles: ['role-ghost'], permissions: '0' });
    const found = await rowsFor('role-position', deps);
    expect(found).toHaveLength(1);
    expect(found[0]?.tone).toBe('yellow');
  });

  it('degrades to yellow without throwing on empty role data', async () => {
    const deps = greenDeps();
    deps.getRoles = async () => [];
    const found = await rowsFor('role-position', deps);
    expect(found).toHaveLength(1);
    expect(found[0]?.tone).toBe('yellow');
  });
});

describe('permissions', () => {
  it('returns one red per missing permission carrying its why-line and fix', async () => {
    const deps = greenDeps();
    deps.getBotMember = async () => ({ roles: ['role-bot'], permissions: VIEW.toString() });
    const found = await rowsFor('permissions', deps);
    expect(found).toHaveLength(1);
    expect(found[0]?.tone).toBe('red');
    expect(found[0]?.detail).toBe('I need SendMessages to post warnings and summaries.');
    expect(found[0]?.fix).toBe('Re-run the install link, then re-run the scan.');
  });

  it('returns green when nothing is missing', async () => {
    const found = await rowsFor('permissions', greenDeps());
    expect(found).toHaveLength(1);
    expect(found[0]?.tone).toBe('green');
  });

  it('compares bits above 32 with BigInt, never Number', async () => {
    const table = PermissionFlagsBits as unknown as Record<string, unknown>;
    const high = table['PinMessages'];
    expect(typeof high).toBe('bigint');
    expect(high as bigint).toBeGreaterThan(2n ** 32n);
    const input = greenInput();
    input.required = [{ perm: 'PinMessages', why: 'I need PinMessages to pin key updates.' }];
    const without = greenDeps();
    without.getBotMember = async () => ({
      roles: ['role-bot'],
      permissions: (VIEW | SEND).toString(),
    });
    const missingRows = await rowsFor('permissions', without, input);
    expect(missingRows).toHaveLength(1);
    expect(missingRows[0]?.tone).toBe('red');
    const withIt = greenDeps();
    withIt.getBotMember = async () => ({
      roles: ['role-bot'],
      permissions: (VIEW | SEND | (high as bigint)).toString(),
    });
    const grantedRows = await rowsFor('permissions', withIt, input);
    expect(grantedRows).toHaveLength(1);
    expect(grantedRows[0]?.tone).toBe('green');
  });

  it('returns yellow naming the permission for unknown names without throwing', async () => {
    const input = greenInput();
    const found = await rowsFor('permissions', greenDeps(), input);
    expect(found.map((row) => row.tone)).toEqual(['green']);
    const unknownInput = greenInput();
    unknownInput.required = [
      { perm: 'ViewChannel', why: 'I need ViewChannel to read the channels I moderate.' },
      { perm: 'NotARealPerm', why: 'nobody needs this.' },
    ];
    const mixed = await rowsFor('permissions', greenDeps(), unknownInput);
    const yellow = mixed.filter((row) => row.tone === 'yellow');
    expect(yellow).toHaveLength(1);
    expect(yellow[0]?.detail).toContain('unknown permission');
    expect(yellow[0]?.detail).toContain('NotARealPerm');
    expect(mixed.filter((row) => row.tone === 'green')).toHaveLength(1);
  });

  it('degrades to yellow on an unreadable permission bitfield', async () => {
    const deps = greenDeps();
    deps.getBotMember = async () => ({ roles: ['role-bot'], permissions: 'not-a-number' });
    const found = await rowsFor('permissions', deps);
    expect(found).toHaveLength(1);
    expect(found[0]?.tone).toBe('yellow');
  });
});

describe('channels', () => {
  it('is red when zero text channels are visible', async () => {
    const deps = greenDeps();
    deps.getChannels = async () => [
      textChannel('general', VIEW.toString()),
      textChannel('secret', VIEW.toString()),
    ];
    const found = await rowsFor('channels', deps);
    expect(found).toHaveLength(1);
    expect(found[0]?.tone).toBe('red');
  });

  it('emits one yellow per blocked channel capped at five plus a more row', async () => {
    const deps = greenDeps();
    deps.getChannels = async () => [
      textChannel('open'),
      textChannel('b1', VIEW.toString()),
      textChannel('b2', SEND.toString()),
      textChannel('b3', VIEW.toString()),
      textChannel('b4', VIEW.toString()),
      textChannel('b5', VIEW.toString()),
      textChannel('b6', VIEW.toString()),
      textChannel('b7', VIEW.toString()),
    ];
    const found = await rowsFor('channels', deps);
    expect(found).toHaveLength(6);
    expect(found.slice(0, 5).every((row) => row.tone === 'yellow')).toBe(true);
    expect(found[5]?.tone).toBe('yellow');
    expect(found[5]?.detail).toBe('+2 more channels need attention.');
  });

  it('ignores voice and category channels silently', async () => {
    const deps = greenDeps();
    deps.getChannels = async () => [
      textChannel('general'),
      textChannel('voice-room', (VIEW | SEND).toString(), 'GUILD_VOICE'),
      textChannel('section', (VIEW | SEND).toString(), 'GUILD_CATEGORY'),
    ];
    const found = await rowsFor('channels', deps);
    expect(found).toHaveLength(1);
    expect(found[0]?.tone).toBe('green');
  });

  it('is yellow when my top role cannot be resolved - never red, never throws', async () => {
    const deps = greenDeps();
    deps.getBotMember = async () => ({ roles: ['role-ghost'], permissions: '0' });
    const rows = await scanGuild(greenInput(), deps);
    const found = rows.filter((row) => row.check === 'channels');
    expect(found).toHaveLength(1);
    expect(found[0]?.tone).toBe('yellow');
    expect(found[0]?.detail).toContain('could not resolve my role');
    expect(found[0]?.fix).toBeUndefined();
    expect(rows.filter((row) => row.check === 'channels' && row.tone === 'red')).toHaveLength(0);
  });

  it('degrades to yellow on empty channel data', async () => {
    const deps = greenDeps();
    deps.getChannels = async () => [];
    const found = await rowsFor('channels', deps);
    expect(found).toHaveLength(1);
    expect(found[0]?.tone).toBe('yellow');
  });

  it('is green when nothing is blocked', async () => {
    const found = await rowsFor('channels', greenDeps());
    expect(found).toHaveLength(1);
    expect(found[0]?.tone).toBe('green');
  });
});

describe('intents', () => {
  it('returns one yellow per disabled intent and never red', async () => {
    const input = greenInput();
    input.intents = ['GuildMembers', 'MessageContent'];
    const deps = greenDeps();
    deps.probeIntents = async () => [
      { intent: 'GuildMembers', ok: false },
      { intent: 'MessageContent', ok: false },
    ];
    const rows = await scanGuild(input, deps);
    const found = rows.filter((row) => row.check === 'intents');
    expect(found).toHaveLength(2);
    expect(found.every((row) => row.tone === 'yellow')).toBe(true);
    expect(found[0]?.detail).toContain('GuildMembers is not enabled on our side yet');
    expect(found[0]?.detail).toContain('retry in a minute; nothing you need to do.');
    expect(rows.filter((row) => row.tone === 'red')).toHaveLength(0);
  });

  it('returns green when all probes pass', async () => {
    const found = await rowsFor('intents', greenDeps());
    expect(found).toHaveLength(1);
    expect(found[0]?.tone).toBe('green');
  });
});

describe('commands-sync', () => {
  it('is yellow on mismatch and never red', async () => {
    const deps = greenDeps();
    deps.getCommandCount = async () => 2;
    const rows = await scanGuild(greenInput(), deps);
    const found = rows.filter((row) => row.check === 'commands-sync');
    expect(found).toHaveLength(1);
    expect(found[0]?.tone).toBe('yellow');
    expect(found[0]?.detail).toContain('command sync pending - retry shortly.');
    expect(rows.filter((row) => row.tone === 'red')).toHaveLength(0);
  });

  it('is green on match', async () => {
    const found = await rowsFor('commands-sync', greenDeps());
    expect(found).toHaveLength(1);
    expect(found[0]?.tone).toBe('green');
  });
});

describe('scan shape', () => {
  it('returns rows in spec check order on a full green scan', async () => {
    const rows = await scanGuild(greenInput(), greenDeps());
    expect(rows.map((row) => row.check)).toEqual([
      'installed',
      'role-position',
      'permissions',
      'channels',
      'intents',
      'commands-sync',
    ]);
    expect(rows.every((row) => row.tone === 'green')).toBe(true);
  });

  it('never throws on empty roles and channels together', async () => {
    const deps = greenDeps();
    deps.getRoles = async () => [];
    deps.getChannels = async () => [];
    const rows = await scanGuild(greenInput(), deps);
    expect(rows.filter((row) => row.check === 'role-position')[0]?.tone).toBe('yellow');
    expect(rows.filter((row) => row.check === 'channels')[0]?.tone).toBe('yellow');
  });
});

// Pure validators for feature modules (apps/testbot).
// A malformed module degrades to a thrown Error naming the file — never a
// boot failure elsewhere. Easily unit-tested, zero discord.js runtime calls.

import type { BotCommand, BotEvent } from './registry.js';

/** Assert a loaded module satisfies the BotCommand shape. */
export function validateCommand(mod: unknown, file = 'unknown'): asserts mod is BotCommand {
  if (typeof mod !== 'object' || mod === null) {
    throw new Error(
      `Invalid command module ${file}: expected an object with 'data' and 'execute'.`,
    );
  }
  const rec = mod as Record<string, unknown>;
  if (rec.data == null || rec.execute == null) {
    throw new Error(`Invalid command module ${file}: missing 'data' or 'execute' export.`);
  }
}

/** Assert a loaded module satisfies the BotEvent shape. */
export function validateEvent(mod: unknown, file = 'unknown'): asserts mod is BotEvent {
  if (typeof mod !== 'object' || mod === null) {
    throw new Error(`Invalid event module ${file}: expected an object with 'name' and 'execute'.`);
  }
  const rec = mod as Record<string, unknown>;
  if (rec.name == null || rec.execute == null) {
    throw new Error(`Invalid event module ${file}: missing 'name' or 'execute' export.`);
  }
}

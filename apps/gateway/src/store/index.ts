// Transactional XP/economy store for the gateway.
//
// V1-8 rule: every mutation is awaited against Postgres before it returns.
// There is deliberately NO write-behind cache here — batching is a later
// optimization (SPEC section 4), not a correctness shortcut. A process killed
// with kill -9 loses nothing because nothing lives only in memory.
//
// The pool is injected by the caller (never a global singleton, never a
// hardcoded URL). All SQL targets user_records with snake_case columns and
// parameterized ($n) queries only. Member content is never logged — this
// module logs nothing at all.

export interface StorePool {
  query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface RecordXpInput {
  botId: string;
  guildId: string;
  memberId: string;
  delta: number;
}

export interface GetXpInput {
  botId: string;
  guildId: string;
  memberId: string;
}

export interface Store {
  recordXp(input: RecordXpInput): Promise<number>;
  getXp(input: GetXpInput): Promise<number>;
  flush(): Promise<void>;
}

function assertId(name: string, value: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`store: ${name} must be a non-empty string`);
  }
}

function assertDelta(delta: number): void {
  if (!Number.isInteger(delta)) {
    throw new Error('store: delta must be an integer');
  }
}

export function createStore({ pool }: { pool: StorePool }): Store {
  async function recordXp({ botId, guildId, memberId, delta }: RecordXpInput): Promise<number> {
    assertId('botId', botId);
    assertId('guildId', guildId);
    assertId('memberId', memberId);
    assertDelta(delta);
    // Upsert is atomic in a single statement: concurrent writers serialize on
    // the UNIQUE(bot_id, guild_id, member_id) constraint. The await below is
    // the durability point — the new balance is returned only after Postgres
    // has committed it.
    const result = await pool.query<{ xp: number }>(
      `INSERT INTO user_records (bot_id, guild_id, member_id, xp, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (bot_id, guild_id, member_id)
       DO UPDATE SET xp = user_records.xp + EXCLUDED.xp, updated_at = NOW()
       RETURNING xp`,
      [botId, guildId, memberId, delta],
    );
    return result.rows[0].xp;
  }

  async function getXp({ botId, guildId, memberId }: GetXpInput): Promise<number> {
    assertId('botId', botId);
    assertId('guildId', guildId);
    assertId('memberId', memberId);
    const result = await pool.query<{ xp: number }>(
      `SELECT xp FROM user_records
       WHERE bot_id = $1 AND guild_id = $2 AND member_id = $3`,
      [botId, guildId, memberId],
    );
    return result.rows[0]?.xp ?? 0;
  }

  async function flush(): Promise<void> {
    // No-op by design: writes are already durable before recordXp returns
    // (see above), so there is nothing buffered left to flush. Kept because
    // the SPEC section 4 store interface requires flush() for lifecycle
    // symmetry with gateway shutdown.
  }

  return { recordXp, getXp, flush };
}

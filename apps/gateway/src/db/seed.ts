// Template-gallery seed entry (V1-6, T-seed owned): `npm run seed`.
//
// - `--check` validates the in-code array and prints counts WITHOUT touching
//   any database — this is what CI and local smoke runs use (no PG needed).
// - A real run targets a REAL database: `DATABASE_URL` must be set. Unset
//   (or empty) prints `SEED-FAIL: DATABASE_URL is not set` to stderr and
//   exits 2 — seeding without a DB is an explicit loud failure, never a
//   silent pass.
// - `pg` is imported statically: seeding always runs against Postgres, and
//   the `--check` path is proven DB-free by the unit contract (no pool is
//   constructed before the flag branch returns).
import { Pool } from 'pg';
import { TEMPLATE_SEEDS, seedTemplates } from './seed-templates.js';

function fail(message: string, code: number): never {
  console.error(message);
  process.exit(code);
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  if (args.has('--check')) {
    const slugs = new Set(TEMPLATE_SEEDS.map((row) => row.slug));
    if (TEMPLATE_SEEDS.length !== 8 || slugs.size !== TEMPLATE_SEEDS.length) {
      fail(
        `SEED-FAIL: expected 8 uniquely-slugged templates, got ${TEMPLATE_SEEDS.length} rows`,
        1,
      );
    }
    const badEnvelope = TEMPLATE_SEEDS.filter((row) => row.sourceSpec.version !== 1);
    if (badEnvelope.length > 0) {
      fail(`SEED-FAIL: ${badEnvelope.length} template(s) without a v1 source_spec envelope`, 1);
    }
    console.log(`CHECK-OK templates=${TEMPLATE_SEEDS.length} slugs=${slugs.size}`);
    return;
  }
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === '') {
    fail('SEED-FAIL: DATABASE_URL is not set', 2);
  }
  const pool = new Pool({ connectionString: url });
  try {
    const { inserted, updated } = await seedTemplates(pool);
    console.log(`SEEDED inserted=${inserted} updated=${updated}`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  fail(`SEED-FAIL: ${message}`, 1);
});

import { getPool, mapDbError } from '../../../lib/db/pool';
import { toTemplateCard, type TemplateRow } from '../../../lib/templates/templates';

// GET /api/templates -> 200 { templates: TemplateCard[] } ordered by slug.
// PUBLIC: the gallery is browsable without a session (fork is not). The
// SELECT lists card columns only — source_spec never leaves this route.
// NOTE: `templates` has no `deleted_at` column (unlike `bots`), so no
// soft-delete predicate is added here.
export async function GET(): Promise<Response> {
  try {
    const found = await getPool().query<TemplateRow>(
      `SELECT slug, name, category, capabilities, perms_needed, forks, semver
       FROM templates ORDER BY slug`,
    );
    return Response.json({ templates: found.rows.map(toTemplateCard) }, { status: 200 });
  } catch (err) {
    // A missing DATABASE_URL means the process is unconfigured, not that the
    // gallery is broken — the honest canonical shape (KI-021).
    const mapped = mapDbError(err);
    if (mapped) {
      return Response.json({ error: mapped.error }, { status: mapped.status });
    }
    return Response.json({ error: 'could not list templates' }, { status: 500 });
  }
}

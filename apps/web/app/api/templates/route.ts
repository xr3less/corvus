import { getPool } from '../../../lib/db/pool';
import { toTemplateCard, type TemplateRow } from '../../../lib/templates/templates';

// GET /api/templates -> 200 { templates: TemplateCard[] } ordered by slug.
// PUBLIC: the gallery is browsable without a session (fork is not). The
// SELECT lists card columns only — source_spec never leaves this route.
export async function GET(): Promise<Response> {
  try {
    const found = await getPool().query<TemplateRow>(
      `SELECT slug, name, category, capabilities, perms_needed, forks, semver
       FROM templates ORDER BY slug`,
    );
    return Response.json({ templates: found.rows.map(toTemplateCard) }, { status: 200 });
  } catch {
    return Response.json({ error: 'could not list templates' }, { status: 500 });
  }
}

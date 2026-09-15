import { getPool } from '../../../../lib/db/pool';
import { validateSlug, type TemplateRow } from '../../../../lib/templates/templates';

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

// GET /api/templates/[slug] -> 200 full row (incl. source_spec).
// PUBLIC: the gallery is browsable without a session (fork is not).
// Malformed slugs are indistinguishable from unknown ones: 404, no leak.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  if (!validateSlug(slug).ok) {
    return error(404, 'not found');
  }
  try {
    const found = await getPool().query<TemplateRow>(
      `SELECT slug, name, category, capabilities, perms_needed, forks, semver, source_spec
       FROM templates WHERE slug = $1`,
      [slug],
    );
    if (found.rowCount !== 1) {
      return error(404, 'not found');
    }
    return Response.json(found.rows[0], { status: 200 });
  } catch {
    return Response.json({ error: 'could not load template' }, { status: 500 });
  }
}

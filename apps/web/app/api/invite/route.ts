import { NextResponse } from 'next/server';
import {
  DEFAULT_CAPABILITIES,
  VALID_CAPABILITIES,
  buildInvite,
  isCapability,
  type Capability,
} from '../../../lib/invite/permissions';

export async function GET(request: Request): Promise<NextResponse> {
  const raw = new URL(request.url).searchParams.get('capabilities');

  let capabilities: Capability[];
  if (raw === null || raw.trim() === '') {
    capabilities = [...DEFAULT_CAPABILITIES];
  } else {
    const parsed = [...new Set(raw.split(',').map((part) => part.trim().toLowerCase()))].filter(
      (part) => part !== '',
    );
    const unknown = parsed.filter((part) => !isCapability(part));
    if (unknown.length > 0) {
      return NextResponse.json(
        { error: `Unknown capability: ${unknown.join(', ')}`, valid: [...VALID_CAPABILITIES] },
        { status: 422 },
      );
    }
    capabilities = (parsed.length > 0 ? parsed : [...DEFAULT_CAPABILITIES]) as Capability[];
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Invite links are not configured.' }, { status: 500 });
  }

  return NextResponse.json(buildInvite({ clientId, capabilities }));
}

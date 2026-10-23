import { NextRequest, NextResponse } from 'next/server';
import { permissionsForRole, searchGateway } from '@org/db';
import { getCurrentAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/search?q=…
 *
 * Global search across authorized record types: payment references,
 * (masked) API key names/prefixes, staff emails, request-log correlations.
 * Each result category is only returned when the caller's role includes the
 * matching permission, so the endpoint never confirms the existence of
 * records outside the caller's data scope.
 */
export async function GET(request: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get('q') ?? '';
  if (query.trim().length < 2) {
    return NextResponse.json({
      status: 'success',
      data: { payments: [], users: [], apiKeys: [], requests: [] },
    });
  }

  const permissions = new Set(permissionsForRole(admin.role));
  const results = await searchGateway(query, permissions);
  return NextResponse.json({ status: 'success', data: results });
}

import { NextRequest, NextResponse } from 'next/server';
import {
  can,
  createApiKey,
  listApiKeys,
  API_KEY_SCOPES,
  isApiKeyScope,
  type AdminUser,
  type ApiKeyScope,
} from '@org/db';
import { getCurrentAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/keys — list API keys (admin only).
 * POST /api/admin/keys — issue a new key (admin only).
 *
 * POST body: { name, scopes: string[], expiresAt?: string|null }
 * Response: { status, data: { key, secret } } — the secret is returned
 * exactly once for the one-time reveal; it is never stored or logged.
 */
export async function GET() {
  const admin: AdminUser | null = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }
  if (!can(admin.role, 'keys.manage')) {
    return NextResponse.json(
      { message: 'Insufficient permissions (requires admin)' },
      { status: 403 }
    );
  }
  return NextResponse.json({ status: 'success', data: { keys: await listApiKeys() } });
}

function parseScopesInput(value: unknown): ApiKeyScope[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const parsed = value.filter(isApiKeyScope);
  // An empty explicit list means "no known scope selected".
  return Array.isArray(value) && parsed.length === value.filter(String).length ? parsed : null;
}

function errorResponse(err: unknown): NextResponse {
  const message = String((err as Error)?.message ?? 'VALIDATION');
  if (message.startsWith('VALIDATION-')) {
    return NextResponse.json(
      {
        message:
          message === 'VALIDATION-name'
            ? 'Provide a key name of 1–80 characters.'
            : message === 'VALIDATION-scopes'
              ? 'Select at least one supported scope.'
              : 'Invalid request.',
      },
      { status: 400 }
    );
  }
  if (message.includes('UNIQUE') || message.includes('P2002')) {
    return NextResponse.json(
      { message: 'Key identifier collision — try again.' },
      { status: 409 }
    );
  }
  console.error('[admin/keys] request failed:', message);
  return NextResponse.json({ message: 'API key operation failed' }, { status: 500 });
}

export async function POST(request: NextRequest) {
  const admin: AdminUser | null = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }
  if (!can(admin.role, 'keys.manage')) {
    return NextResponse.json(
      { message: 'Insufficient permissions (requires admin)' },
      { status: 403 }
    );
  }

  let body: { name?: string; scopes?: unknown; expiresAt?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const scopes = parseScopesInput(body.scopes);
  if (scopes === null || scopes.length === 0) {
    return NextResponse.json(
      { message: `Select at least one scope. Supported: ${API_KEY_SCOPES.join(', ')}` },
      { status: 400 }
    );
  }

  let expiresAt: string | null = null;
  if (body.expiresAt) {
    const time = Date.parse(String(body.expiresAt));
    if (Number.isNaN(time) || time <= Date.now()) {
      return NextResponse.json(
        { message: 'Expiration must be a future date.' },
        { status: 400 }
      );
    }
    expiresAt = new Date(time).toISOString();
  }

  try {
    const created = await createApiKey({
      name: String(body.name ?? ''),
      scopes,
      expiresAt,
      actor: admin,
    });
    return NextResponse.json({
      status: 'success',
      message: 'API key created',
      data: {
        key: created.key,
        // Shown exactly once by the client, then discarded.
        secret: created.secret,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

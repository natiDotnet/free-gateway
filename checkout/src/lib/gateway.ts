import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateApiKey,
  deliverPaymentNotification,
  logGatewayRequest,
  type ApiKeyAuthResult,
  type ApiKeyScope,
} from '@org/db';

/**
 * Gateway request observability + API-key enforcement.
 *
 * `withGatewayLog` wraps every checkout API route handler:
 *  - assigns/propagates a correlation id (x-correlation-id),
 *  - measures duration and status, and records a *sanitized* row in
 *    `request_logs` in the shared database (no headers, no bodies,
 *    no query values — only shape/size and opaque references),
 *  - never lets logging failures break the API response.
 *
 * `enforceApiKey` optionally authenticates merchant API keys (opt-in via
 * `GATEWAY_API_KEYS_REQUIRED=true`) and checks the required scope.
 */

export interface GatewayRequestMeta {
  correlationId: string;
  apiKeyId: string | null;
  apiKeyPrefix: string | null;
  merchantReference: string | null;
  errorCode: string | null;
}

function newCorrelationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sanitizeQuery(request: NextRequest): string | null {
  const search = request.nextUrl.search;
  if (!search) return null;
  // The gateway's URLs only ever carry opaque references and page params,
  // but keep the stored value short anyway.
  return search.startsWith('?') ? search.slice(1, 301) : search.slice(0, 301);
}

function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? null;
}

function classify(statusCode: number, current: string | null): string | null {
  if (current) return current;
  if (statusCode >= 500) return 'handler_error';
  if (statusCode === 401 || statusCode === 403) return 'unauthorized';
  if (statusCode === 404) return 'not_found';
  if (statusCode === 400 || statusCode === 409) return 'validation';
  return null;
}

export function withGatewayLog(
  request: NextRequest,
  route: string,
  handler: (meta: GatewayRequestMeta) => Promise<NextResponse> | NextResponse,
  options?: { skipLog?: boolean }
): Promise<NextResponse> {
  const correlationId = request.headers.get('x-correlation-id') || newCorrelationId();
  const meta: GatewayRequestMeta = {
    correlationId,
    apiKeyId: null,
    apiKeyPrefix: null,
    merchantReference: null,
    errorCode: null,
  };
  const startedAt = Date.now();

  return (async () => {
    let response: NextResponse;
    try {
      response = await handler(meta);
    } catch (err) {
      console.error(`[gateway:${route}] handler failed:`, err);
      meta.errorCode = meta.errorCode ?? 'handler_error';
      response = NextResponse.json(
        { message: 'Internal gateway error' },
        { status: 500 }
      );
    }
    if (!response.headers.has('x-correlation-id')) {
      response.headers.set('x-correlation-id', correlationId);
    }
    if (!options?.skipLog) {
      meta.errorCode = classify(response.status, meta.errorCode) ?? 'validation';
      const errorCode = response.status < 400 ? null : meta.errorCode;
      await logGatewayRequest({
        correlationId,
        method: request.method,
        path: request.nextUrl.pathname,
        query: sanitizeQuery(request),
        statusCode: response.status,
        durationMs: Date.now() - startedAt,
        ip: clientIp(request),
        userAgent: request.headers.get('user-agent'),
        apiKeyId: meta.apiKeyId,
        apiKeyPrefix: meta.apiKeyPrefix,
        merchantReference: meta.merchantReference,
        errorCode,
      });
    }
    return response;
  })();
}

/** Read the bearer/API-key secret from the request (never stored, never logged). */
export function extractApiKeySecret(request: NextRequest): string | null {
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  return request.headers.get('x-api-key') ?? null;
}

export interface ApiKeyGateResult {
  ok: boolean;
  response?: NextResponse;
  auth?: ApiKeyAuthResult | null;
}

/**
 * Enforce API-key authentication when `GATEWAY_API_KEYS_REQUIRED=true`.
 * When not enforced, resolves immediately (open-gateway mode, which remains
 * the default so existing integrations keep working).
 */
export async function enforceApiKey(
  request: NextRequest,
  requiredScope: ApiKeyScope,
  meta?: { setApiKey?(auth: ApiKeyAuthResult): void }
): Promise<ApiKeyGateResult> {
  const auth = await authenticateApiKey(extractApiKeySecret(request));
  if (auth) {
    meta?.setApiKey?.(auth);
  }

  if (process.env.GATEWAY_API_KEYS_REQUIRED === 'true') {
    if (!auth) {
      return {
        ok: false,
        response: NextResponse.json(
          { message: 'Missing or invalid API key (Authorization: Bearer fgk_… or x-api-key)' },
          { status: 401 }
        ),
      };
    }
    if (!auth.scopes.includes(requiredScope)) {
      return {
        ok: false,
        response: NextResponse.json(
          { message: `API key is missing the "${requiredScope}" scope` },
          { status: 403 }
        ),
      };
    }
    auth.touchUsed().catch(() => undefined);
  }

  return { ok: true, auth };
}

/* ==================================================================== */
/* Outbound merchant webhook deliveries                                 */
/* ==================================================================== */

/**
 * Fire the payment's stored notification_url for a status change. Best
 * effort and awaited with a short timeout: gateway route handlers call this
 * *after* the status write, so the response latency includes one delivery
 * attempt (visible in request logs). Failures are recorded in
 * `webhook_deliveries`; retry from the admin dashboard is capped at 5
 * attempts total.
 */
export async function notifyPaymentStatusChange(
  paymentId: string | null | undefined,
  eventType: string,
  previousStatus: string
): Promise<void> {
  if (!paymentId) return;
  try {
    await deliverPaymentNotification(paymentId, eventType, previousStatus, { timeoutMs: 4000 });
  } catch (err) {
    // Deliveries never break the transaction flow.
    console.error(`[gateway:delivery] ${eventType} failed:`, (err as Error).message);
  }
}

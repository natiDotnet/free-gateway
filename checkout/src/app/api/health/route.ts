import { NextRequest, NextResponse } from 'next/server';
import { db, DATABASE_PROVIDER } from '@org/db';
import { withGatewayLog } from '@/lib/gateway';

/**
 * GET /api/health
 *
 * Liveness/readiness probe for the checkout gateway. Reports only what the
 * backend can genuinely measure: database connectivity (with a timed
 * `SELECT 1`) and process uptime. No synthetic status is ever invented —
 * if the database is unreachable the probe reports it truthfully.
 */
export async function GET(request: NextRequest) {
  return withGatewayLog(
    request,
    'health',
    async () => {
      const startedAt = Date.now();
      let databaseOk = true;
      let latencyMs = 0;
      try {
        await db.$queryRaw`SELECT 1`;
        latencyMs = Date.now() - startedAt;
      } catch (err) {
        console.error('[health] database unreachable:', (err as Error).message);
        databaseOk = false;
      }

      const body = {
        status: databaseOk ? ('ok' as const) : ('degraded' as const),
        time: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
        checks: {
          database: { ok: databaseOk, latencyMs, provider: DATABASE_PROVIDER },
        },
      };

      return NextResponse.json(body, {
        status: databaseOk ? 200 : 503,
        headers: { 'cache-control': 'no-store' },
      });
    },
    // Health checks are high-frequency; recording every probe would drown
    // the request log. Skip persistence but keep the correlation header.
    { skipLog: true }
  );
}

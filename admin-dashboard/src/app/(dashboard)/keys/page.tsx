import Link from 'next/link';
import { listApiKeys, type ApiKey } from '@org/db';
import { requirePagePermission } from '@/lib/session';
import ApiKeyManager from './_key-manager';

export const dynamic = 'force-dynamic';

export default async function ApiKeysPage() {
  await requirePagePermission('keys.manage');
  const keys: ApiKey[] = await listApiKeys();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 tracking-tight">API keys</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-secondary">
            Merchant credentials for the gateway API. Secrets are hashed
            (SHA-256) at rest, shown once at issuance, and can be rotated or
            revoked at any time. Every change is audit logged.
          </p>
        </div>
        <Link
          href="/health"
          className="text-sm text-gray-secondary underline-offset-2 hover:text-secondary hover:underline"
        >
          Gateway enforcement status →
        </Link>
      </header>

      <ApiKeyManager
        keys={keys.map((key) => ({ ...key }))}
      />

      <section className="card p-6">
        <h2 className="text-sm font-semibold">Merchant integration</h2>
        <p className="mt-1 text-sm text-gray-secondary">
          With <code className="rounded bg-gray-background-alt px-1.5 py-0.5 font-mono text-xs">GATEWAY_API_KEYS_REQUIRED=true</code>{' '}
          set, calls to <code className="rounded bg-gray-background-alt px-1.5 py-0.5 font-mono text-xs">POST /api/payments/init</code> must
          present the secret:
        </p>
        <pre className="overflow-x-auto rounded-lg bg-secondary p-3 text-xs text-white">{
`# Authorization: Bearer <secret>
curl -X POST https://<gateway-host>/api/payments/init \\
  -H "Authorization: Bearer fgk_…secret…" \\
  -H "Content-Type: application/json" \\
  -d '{"amount":500,"currency":"USD","merchant_reference":"ORD-99887"}'
# … or the same value in  x-api-key: fgk_…secret…`
}</pre>
        <p className="mt-2 text-xs text-gray-secondary">
          When the flag is off (default) the gateway stays open and keys are only
          tracked for identification in request logs.
        </p>
      </section>
    </div>
  );
}
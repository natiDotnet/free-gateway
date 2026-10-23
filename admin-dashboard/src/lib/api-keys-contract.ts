/**
 * Client-safe contract for gateway API-key scopes.
 *
 * Mirrors API_KEY_SCOPES in @org/db (Node-only). Keep in sync when the
 * backend adds enforced scopes.
 */
export const API_KEYS_SUPPORTED_SCOPES: ReadonlyArray<{ id: string; description: string }> = [
  {
    id: 'payments.init',
    description:
      'May initialize payments via POST /api/payments/init (checked when GATEWAY_API_KEYS_REQUIRED=true).',
  },
];

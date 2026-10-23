import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  can,
  ciContains,
  DATABASE_PROVIDER,
  paymentDayKey,
  permissionsForRole,
  type AdminRole,
} from './prisma.ts';

const ALL_PERMISSIONS = [
  'payments.list',
  'payments.detail',
  'payments.verify',
  'payments.cancel',
  'users.manage',
  'audit.view',
  'keys.manage',
  'logs.view',
  'webhooks.manage',
  'reports.export',
];

/**
 * Pure contract tests for the shared DB-layer helpers. No database access —
 * these exercise logic that every provider (sqlite, postgresql,mysql) and
 * every role depends on.
 */

describe('ciContains', () => {
  it('matches the requested substring', () => {
    assert.equal(ciContains('Ali').contains, 'Ali');
  });

  it(`adds mode:"insensitive" only for postgresql (active provider: ${DATABASE_PROVIDER})`, () => {
    const filter = ciContains('ali');
    if (DATABASE_PROVIDER === 'postgresql') {
      assert.equal(filter.mode, 'insensitive');
    } else {
      // sqlite/mysql compare ASCII case-insensitively natively; the filter
      // must NOT carry a mode key that the client type may reject.
      assert.equal(filter.mode, undefined);
    }
  });
});

describe('role permission matrix', () => {
  it('admin holds every permission, including keys.manage', () => {
    assert.deepEqual([...permissionsForRole('admin')].sort(), [...ALL_PERMISSIONS].sort());
    assert.equal(can('admin', 'keys.manage'), true);
    assert.equal(can('admin', 'users.manage'), true);
  });

  it('operator can operate but cannot manage keys or staff', () => {
    const role: AdminRole = 'operator';
    assert.equal(can(role, 'payments.verify'), true);
    assert.equal(can(role, 'payments.cancel'), true);
    assert.equal(can(role, 'logs.view'), true);
    assert.equal(can(role, 'webhooks.manage'), true);
    assert.equal(can(role, 'reports.export'), true);
    assert.equal(permissionsForRole(role).includes('keys.manage'), false);
    assert.equal(permissionsForRole(role).includes('users.manage'), false);
  });

  it('viewer is strictly read-only', () => {
    for (const permission of permissionsForRole('viewer')) {
      assert.match(permission, /^payments\.(list|detail)$/);
    }
    assert.equal(permissionsForRole('viewer').includes('payments.cancel'), false);
    assert.equal(permissionsForRole('viewer').includes('reports.export'), false);
  });
});

describe('paymentDayKey', () => {
  it('buckets timestamps by UTC day, not local day', () => {
    // 23 Oct 22:00 UTC is the same UTC day; in +03:00 local it is already
    // the 24th — the key must stay stable across server time zones.
    assert.equal(paymentDayKey('2026-10-23T21:59:59.999Z'), '2026-10-23');
    assert.equal(paymentDayKey('2026-10-23T22:00:00.000Z'), '2026-10-23');
    assert.equal(paymentDayKey('2026-10-24T00:00:00.000Z'), '2026-10-24');
  });

  it('returns "" for unparsable dates', () => {
    assert.equal(paymentDayKey('nonsense'), '');
  });
});

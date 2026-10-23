import { NextRequest, NextResponse } from 'next/server';
import {
  can,
  paymentsForExport,
  recordAudit,
  PAYMENT_STATUSES,
  type AdminUser,
  type PaymentFilters,
  type PaymentStatus,
} from '@org/db';
import { getCurrentAdmin } from '@/lib/session';
import { csvCell } from '@/lib/csv';

export const dynamic = 'force-dynamic';

const CSV_STATUSES = new Set<string>(PAYMENT_STATUSES as readonly string[]);

function parsedQuery(request: NextRequest): { filters: PaymentFilters; label: string } {
  const params = request.nextUrl.searchParams;
  const statusParam = params.get('status') ?? '';
  const provider = params.get('provider') ?? '';
  const currency = params.get('currency') ?? '';
  const q = params.get('q') ?? '';
  const fromDay = /^\d{4}-\d{2}-\d{2}$/.test(params.get('from') ?? '')
    ? params.get('from')!
    : undefined;
  const toDay = /^\d{4}-\d{2}-\d{2}$/.test(params.get('to') ?? '')
    ? params.get('to')!
    : undefined;

  const filters: PaymentFilters = {
    q: q.trim() || undefined,
    status: CSV_STATUSES.has(statusParam) ? (statusParam as PaymentStatus) : undefined,
    provider: provider || undefined,
    currency: currency || undefined,
    fromDay,
    toDay,
  };
  const label = [
    statusParam && `status=${statusParam}`,
    provider && `provider=${provider}`,
    currency && `currency=${currency}`,
    fromDay && `from=${fromDay}`,
    toDay && `to=${toDay}`,
    q && `q=${q.trim()}`,
  ]
    .filter(Boolean)
    .join(', ');
  return { filters, label: label || 'no filters' };
}

/**
 * GET /api/admin/payments/export — CSV export of the filtered payment list.
 * Allowed for operator/admin (`reports.export`). Every export is recorded in
 * the audit trail (`report.export`) with the applied filters, per the
 * data-access policy. No payment credentials are included — only records
 * already shown in the dashboard.
 */
export async function GET(request: NextRequest) {
  const admin: AdminUser | null = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }
  if (!can(admin.role, 'reports.export')) {
    return NextResponse.json(
      { message: 'Insufficient permissions (requires operator or admin)' },
      { status: 403 }
    );
  }

  const { filters, label } = parsedQuery(request);
  const rows = await paymentsForExport(filters);

  const header = [
    'merchant_reference',
    'provider_reference',
    'customer_name',
    'customer_email',
    'customer_phone',
    'amount',
    'currency',
    'status',
    'provider',
    'created_at',
    'updated_at',
  ];
  const lines = [header.join(',')];
  for (const payment of rows) {
    lines.push(
      [
        payment.merchantReference,
        payment.providerReference,
        payment.customerName,
        payment.customerEmail,
        payment.customerPhone,
        payment.amount,
        payment.currency,
        payment.status,
        payment.provider,
        payment.createdAt,
        payment.updatedAt,
      ]
        .map(csvCell)
        .join(',')
    );
  }

  await recordAudit({
    action: 'report.export',
    actor: admin,
    target: 'payments',
    detail: { filters: label, rows: rows.length },
  });

  return new NextResponse(lines.join('\n'), {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="payments-export-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}

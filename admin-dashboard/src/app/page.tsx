import { listPayments, type Payment } from '@org/db';

// Render per-request since data comes from the shared database.
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  let payments: Payment[] = [];
  let error: string | null = null;

  try {
    payments = listPayments();
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load payments';
    console.error(error);
  }

  return (
    <div className="container">
      <header>
        <h1>Admin Dashboard — Payments</h1>
        <p>
          View transactions processed by the gateway and verify them
          server-side before fulfilling orders.
        </p>
        {error && <p className="error">{error}</p>}
      </header>

      <div className="card">
        <h2>Transactions</h2>
        {payments.length === 0 ? (
          <p>No transactions yet. Initialize a payment from the checkout app.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Amount</th>
                <th>Status</th>
                <th className="numeric">Provider ref</th>
                <th className="numeric">Created</th>
                <th className="numeric">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>
                    <code>{p.merchantReference}</code>
                  </td>
                  <td>{p.amount} {p.currency}</td>
                  <td>
                    <span className={`badge badge-${p.status}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="numeric">
                    {p.providerReference ?? <span className="hint">—</span>}
                  </td>
                  <td>{new Date(p.createdAt).toLocaleString()}</td>
                  <td className="numeric">
                    <form
                      action={`/api/payments/${encodeURIComponent(
                        p.merchantReference
                      )}/verify`}
                      method="POST"
                      style={{ display: 'inline' }}
                    >
                      <button
                        className="button"
                        style={{
                          padding: '0.4rem 0.8rem',
                          fontSize: '0.875rem',
                          background:
                            p.status === 'pending'
                              ? 'rgba(16,132,211,1)'
                              : 'rgba(107,114,128,1)',
                        }}
                        disabled={p.status !== 'pending'}
                      >
                        {p.status === 'pending' ? 'Verify' : 'Verified'}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <section className="card">
        <h2>About</h2>
        <ul>
          <li>
            This dashboard reads transactions from the shared database via{' '}
            <code>@org/db</code>.
          </li>
          <li>
            Clicking <strong>Verify</strong> re-confirms the status
            server-side and records an audit event before any value is
            delivered.
          </li>
          <li>
            Webhooks from providers (Chapa, Telebirr, …) POST to{' '}
            <code>{'/api/webhooks/{provider}'}</code> on the checkout app and
            update the same database.
          </li>
        </ul>
      </section>
    </div>
  );
}

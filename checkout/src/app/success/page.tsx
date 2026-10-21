export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string }>;
}) {
  const { reference } = await searchParams;

  return (
    <div className="container">
      <div className="card">
        <h1>Payment Successful ✅</h1>
        {reference ? (
          <p>
            Thank you. Your payment <strong>{reference}</strong> was verified
            server-side before value was delivered.
          </p>
        ) : (
          <p>
            Payment completed. Click below to verify the latest status
            server-side.
          </p>
        )}
        {reference && (
          <a
            href={`/api/payments/${encodeURIComponent(reference)}/verify`}
            className="button"
          >
            Verify server-side
          </a>
        )}
      </div>
    </div>
  );
}

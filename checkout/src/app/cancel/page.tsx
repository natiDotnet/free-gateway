export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string }>;
}) {
  const { reference } = await searchParams;
  return (
    <div className="container">
      <div className="card">
        <h1>Payment Cancelled or Failed ❌</h1>
        <p>
          The payment was not completed successfully. No value was delivered.
          {reference ? (
            <span>
              Reference: <strong>{reference}</strong>.
            </span>
          ) : null}
        </p>
        <p>
          You can retry — reuse the same logical order reference to avoid
          duplicate orders.
        </p>
      </div>
    </div>
  );
}

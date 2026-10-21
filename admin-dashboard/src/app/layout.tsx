import './global.css';

export const metadata = {
  title: 'FreeGateway Admin',
  description: 'Administer payments, providers, and audit trails',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}

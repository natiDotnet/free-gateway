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
      <body className="font-primary bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}

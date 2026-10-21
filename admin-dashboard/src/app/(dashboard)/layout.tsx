import { requireAdmin } from '@/lib/session';
import { ROLE_LABELS } from '@org/db';
import DashboardSidebar from './_sidebar';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();

  return (
    <div className="flex min-h-screen">
      <DashboardSidebar
        user={{
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          roleLabel: ROLE_LABELS[admin.role],
        }}
      />
      <main className="min-w-0 flex-1 px-5 pb-16 pt-14 md:px-10 lg:pt-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

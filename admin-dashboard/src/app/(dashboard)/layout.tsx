import { requireAdmin } from '@/lib/session';
import { ROLE_LABELS } from '@org/db';
import DashboardSidebar from './_sidebar';
import DashboardTopbar from './_topbar';

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
      <div className="flex min-w-0 flex-1 flex-col lg:pl-0">
        <DashboardTopbar />
        <main className="min-w-0 flex-1 px-5 pb-16 pt-7 md:px-6">
          <div className="w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
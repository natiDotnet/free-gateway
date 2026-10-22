import { listAdminUsers } from '@org/db';
import { requirePagePermission } from '@/lib/session';
import UserManagement from '../_user-management';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const admin = await requirePagePermission('users.manage');
  const users = await listAdminUsers();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Users &amp; roles</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Staff who can operate this console. Roles map to permissions:{' '}
          <strong>Administrator</strong> manages everything (payments, users,
          audit), <strong>Operator</strong> can verify and cancel payments,
          and <strong>Viewer</strong> is read-only.
        </p>
      </header>

      <UserManagement currentUserId={admin.id} users={users} />
    </div>
  );
}

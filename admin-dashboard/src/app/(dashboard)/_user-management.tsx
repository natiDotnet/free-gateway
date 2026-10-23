'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { roleBadge, ROLE_LABELS_MIRROR } from '@/lib/ui';

interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

interface Props {
  currentUserId: string;
  users: AdminUserRow[];
}

const th =
  'bg-gray-background-alt border-b border-gray-border px-3 py-3 text-left text-xs font-semibold text-gray-primary border-l border-gray-border first:border-l-0';
const td = 'border-b border-gray-border px-3 py-3 align-middle';
const input =
  'field';
export default function UserManagement({ currentUserId, users }: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('operator');
  const [password, setPassword] = useState('');

  async function apiCall(
    method: 'POST' | 'PATCH',
    path: string,
    payload: Record<string, unknown>,
    successMessage: string
  ) {
    setError(null);
    setOkMessage(null);
    try {
      const response = await fetch(path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-requested-with': 'fetch',
        },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message ?? `Request failed (${response.status})`);
        return null;
      }
      setOkMessage(successMessage);
      router.refresh();
      return body;
    } catch {
      setError('Network error — try again.');
      return null;
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const created = await apiCall(
      'POST',
      '/api/admin/users',
      { email, name, role, password },
      `User ${email} created with role ${ROLE_LABELS_MIRROR[role] ?? role}.`
    );
    if (created) {
      setEmail('');
      setName('');
      setPassword('');
      setShowCreate(false);
    }
  }

  async function toggleActive(user: AdminUserRow) {
    if (user.id === currentUserId) return;
    setBusyId(user.id);
    await apiCall(
      'PATCH',
      `/api/admin/users/${user.id}`,
      { isActive: !user.isActive },
      user.isActive
        ? `${user.email} deactivated and signed out.`
        : `${user.email} reactivated.`
    );
    setBusyId(null);
  }

  async function changeRole(user: AdminUserRow, newRole: string) {
    if (newRole === user.role) return;
    setBusyId(user.id);
    await apiCall(
      'PATCH',
      `/api/admin/users/${user.id}`,
      { role: newRole },
      `${user.email} is now ${ROLE_LABELS_MIRROR[newRole] ?? newRole}.`
    );
    setBusyId(null);
  }

  async function resetPassword(user: AdminUserRow) {
    const newPassword = window.prompt(
      `New password for ${user.email} (min 10 characters):`
    );
    if (!newPassword) return;
    setBusyId(user.id);
    const done = await apiCall(
      'PATCH',
      `/api/admin/users/${user.id}`,
      { newPassword },
      `Password reset for ${user.email}. Their other sessions were signed out.`
    );
    if (done) setBusyId(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded-lg border border-badge-failed bg-badge-failed px-4 py-2.5 text-sm text-badge-failed-foreground">
          {error}
        </div>
      )}
      {okMessage && (
        <div className="rounded-lg border border-badge-success bg-badge-success px-4 py-2.5 text-sm text-badge-success-foreground">
          {okMessage}
        </div>
      )}

      <section className="card p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Staff ({users.length})</h2>
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="btn btn-primary"
          >
            {showCreate ? 'Close' : 'Add user'}
          </button>
        </div>

        {showCreate && (
          <form
            onSubmit={handleCreate}
            className="mb-5 grid items-end gap-3 rounded-xl border border-gray-border bg-gray-background-alt/60 p-4 sm:grid-cols-2 lg:grid-cols-5"
          >
            <label className="flex flex-col gap-1 lg:col-span-2">
              <span className="text-xs font-semibold text-gray-primary">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@freegateway.local"
                className={input}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-primary">Full name</span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Abel Kebede"
                className={input}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-primary">Role</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className={input}
              >
                <option value="admin">Administrator</option>
                <option value="operator">Operator</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-primary">
                Initial password (min 10)
              </span>
              <input
                type="text"
                required
                minLength={10}
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={input}
              />
            </label>
            <div className="lg:col-span-5">
              <button
                type="submit"
                className="btn btn-primary"
              >
                Create user
              </button>
            </div>
          </form>
        )}

        {users.length === 0 ? (
          <p className="text-sm text-gray-secondary">No users.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={th}>User</th>
                  <th className={th}>Role</th>
                  <th className={th}>Status</th>
                  <th className={th}>Last login</th>
                  <th className={`${th} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className={user.isActive ? '' : 'opacity-60'}>
                    <td className={td}>
                      <strong className="font-medium">
                        {user.name}
                        {user.id === currentUserId && (
                          <span className="text-xs text-gray-secondary"> (you)</span>
                        )}
                      </strong>
                      <div>
                        <code className="rounded bg-gray-background-alt px-1.5 py-0.5 font-mono text-xs">
                          {user.email}
                        </code>
                      </div>
                    </td>
                    <td className={td}>
                      {user.id === currentUserId ? (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${roleBadge(user.role)}`}
                        >
                          {ROLE_LABELS_MIRROR[user.role] ?? user.role}
                        </span>
                      ) : (
                        <select
                          value={user.role}
                          onChange={(e) => changeRole(user, e.target.value)}
                          disabled={busyId === user.id}
                          aria-label={`Role for ${user.email}`}
                          className="field-sm select"
                        >
                          <option value="admin">Administrator</option>
                          <option value="operator">Operator</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      )}
                    </td>
                    <td className={td}>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                          user.isActive
                            ? 'bg-badge-success text-badge-success-foreground'
                            : 'bg-badge-failed text-badge-failed-foreground'
                        }`}
                      >
                        {user.isActive ? 'active' : 'disabled'}
                      </span>
                    </td>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>
                      {user.lastLoginAt ? (
                        new Date(user.lastLoginAt).toLocaleString()
                      ) : (
                        <span className="text-gray-secondary">never</span>
                      )}
                    </td>
                    <td className={`${td} text-right`}>
                      {user.id === currentUserId ? (
                        <span className="text-xs text-gray-secondary">—</span>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => resetPassword(user)}
                            disabled={busyId === user.id}
                            className={`btn btn-primary btn-xs`}
                          >
                            Reset password
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleActive(user)}
                            disabled={busyId === user.id}
                            className={`btn-xs ${
                              user.isActive
                                ? 'btn btn-danger'
                                : 'btn btn-primary'
                            }`}
                          >
                            {user.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-gray-secondary">
        You cannot change your own role, deactivate yourself, or manage users
        from a non-administrator account — the server enforces this too.
      </p>
    </div>
  );
}
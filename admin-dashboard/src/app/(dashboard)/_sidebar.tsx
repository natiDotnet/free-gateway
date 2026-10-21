'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ROLE_PERMISSIONS } from '@/lib/ui';

/**
 * Sidebar navigation. This is a client component, so it cannot import
 * `@org/db` (better-sqlite3) — the permission matrix is mirrored in
 * src/lib/ui.ts and kept in sync with packages/db/src/index.ts.
 */
interface NavItem {
  href: string;
  label: string;
  description: string;
  permission: string;
  icon: React.ReactNode;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const icon = (path: string) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-[18px] w-[18px]"
  >
    <path d={path} />
  </svg>
);

const SECTIONS: NavSection[] = [
  {
    title: 'Settlement',
    items: [
      {
        href: '/payments',
        label: 'Payments',
        description: 'Transactions',
        permission: 'payments.list',
        icon: icon(
          'M2 6.5A2.5 2.5 0 0 1 4.5 4h15A2.5 2.5 0 0 1 22 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 17.5v-11Zm1 2.5h18M6 15h4'
        ),
      },
    ],
  },
  {
    title: 'Governance',
    items: [
      {
        href: '/audit',
        label: 'Audit trail',
        description: 'Who did what',
        permission: 'audit.view',
        icon: icon('M4 4h16v6H4V4Zm0 10h16v6H4v-6ZM8 7h.01M8 17h.01'),
      },
    ],
  },
  {
    title: 'Administration',
    items: [
      {
        href: '/users',
        label: 'Users & roles',
        description: 'Staff access',
        permission: 'users.manage',
        icon: icon(
          'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'
        ),
      },
    ],
  },
  {
    title: 'Account',
    items: [
      {
        href: '/account',
        label: 'My account',
        description: 'Profile & password',
        permission: 'payments.list',
        icon: icon(
          'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm-7 10a7 7 0 0 1 14 0'
        ),
      },
    ],
  },
];

interface SidebarUser {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
}

const ROLE_CHIP: Record<string, string> = {
  admin: 'bg-purple-400/20 text-purple-200 ring-purple-400/30',
  operator: 'bg-sky-400/20 text-sky-200 ring-sky-400/30',
  viewer: 'bg-slate-400/20 text-slate-200 ring-slate-400/30',
};

export default function DashboardSidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const allowed = new Set(ROLE_PERMISSIONS[user.role] ?? []);

  async function handleLogout() {
    if (leaving) return;
    setLeaving(true);
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'x-requested-with': 'fetch' },
    }).catch(() => undefined);
    router.replace('/login');
    router.refresh();
  }

  return (
    <>
      {/* Mobile hamburger */}
      <button
        type="button"
        aria-label="Open navigation"
        onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm lg:hidden"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="h-5 w-5"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-gradient-to-b from-slate-900 to-slate-800 text-slate-200 transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-sm font-black text-emerald-300">
            FG
          </span>
          <div className="min-w-0">
            <strong className="block text-[15px] font-semibold tracking-tight">
              FreeGateway
            </strong>
            <span className="block text-[11px] text-slate-400">
              Admin console
            </span>
          </div>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="ml-auto hidden h-8 w-8 items-center justify-center rounded-lg text-xl leading-none text-slate-400 hover:text-white lg:hidden"
          >
            ×
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {SECTIONS.map((section) => {
            const items = section.items.filter((item) =>
              allowed.has(item.permission)
            );
            if (items.length === 0) return null;
            return (
              <div key={section.title} className="mb-6">
                <span className="block px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  {section.title}
                </span>
                {items.map((item) => {
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`mb-0.5 flex items-center gap-3 rounded-xl border-l-[3px] border-transparent px-3 py-2 text-slate-300 transition hover:bg-white/10 hover:text-white ${
                        active
                          ? 'bg-emerald-500/15 text-white'
                          : ''
                      } ${active ? 'border-emerald-400' : ''}`}
                    >
                      <span
                        className={
                          active ? 'text-emerald-300' : 'text-slate-400'
                        }
                      >
                        {item.icon}
                      </span>
                      <span className="flex flex-col leading-tight">
                        <strong className="text-sm font-medium">
                          {item.label}
                        </strong>
                        <em className="text-[11px] not-italic text-slate-500">
                          {item.description}
                        </em>
                      </span>
                    </a>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-sm font-bold text-emerald-200">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex flex-col">
              <strong className="truncate text-sm font-medium">
                {user.name}
              </strong>
              <span className="truncate text-[11px] text-slate-400">
                {user.email}
              </span>
              <span
                className={`mt-1 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${
                  ROLE_CHIP[user.role] ?? ROLE_CHIP.viewer
                }`}
              >
                {user.roleLabel}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={leaving}
            className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-slate-200 transition hover:border-transparent hover:bg-rose-500/20 hover:text-rose-200 disabled:opacity-55"
          >
            {leaving ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </aside>
    </>
  );
}

'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ROLE_PERMISSIONS } from '@/lib/ui';

/**
 * Sidebar navigation. This is a client component, so it cannot import the
 * server-only Prisma client — permissions are mirrored in src/lib/ui.ts.
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
    title: 'Operations',
    items: [
      {
        href: '/',
        label: 'Overview',
        description: 'Gateway activity',
        permission: 'payments.list',
        icon: icon('M3 3v18h18M7 14l4-4 4 4 6-7'),
      },
      {
        href: '/payments',
        label: 'Payments',
        description: 'Transactions',
        permission: 'payments.list',
        icon: icon(
          'M2 6.5A2.5 2.5 0 0 1 4.5 4h15A2.5 2.5 0 0 1 22 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 17.5v-11Zm1 2.5h18M6 15h4'
        ),
      },
      {
        href: '/webhooks',
        label: 'Webhooks',
        description: 'Deliveries & events',
        permission: 'payments.list',
        icon: icon('M3 11.5a8 8 0 0 1 16 0v5h-3m-13 0H9v5H3v-5Zm6 5a4 4 0 0 0 8 0'),
      },
    ],
  },
  {
    title: 'Insights',
    items: [
      {
        href: '/analytics',
        label: 'Analytics',
        description: 'Payment reports',
        permission: 'payments.list',
        icon: icon('M4 19V5m0 14h16M8 15v-4m4 4V7m4 8v-6m4 6V4'),
      },
      {
        href: '/logs',
        label: 'Request logs',
        description: 'API traffic',
        permission: 'logs.view',
        icon: icon('M4 6h16M4 10h16M4 14h10M4 18h7'),
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
        href: '/keys',
        label: 'API keys',
        description: 'Merchant credentials',
        permission: 'keys.manage',
        icon: icon(
          'M15 7a4 4 0 1 0-3.9 5H11l-1 3-3 .5V19h3l7-7.5A4 4 0 0 0 15 7Zm2 2h.01'
        ),
      },
      {
        href: '/users',
        label: 'Users & roles',
        description: 'Staff access',
        permission: 'users.manage',
        icon: icon(
          'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'
        ),
      },
      {
        href: '/health',
        label: 'System health',
        description: 'Probes & config',
        permission: 'logs.view',
        icon: icon(
          'M3 12h4l2-5 4 10 2-5h6M12 3v2m0 14v2'
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
  admin: 'bg-badge-auth-needed text-badge-auth-needed-foreground',
  operator: 'bg-badge-partial-refund text-badge-partial-refund-foreground',
  viewer: 'bg-badge-cancelled text-badge-cancelled-foreground',
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
        className="fixed left-4 top-4 z-50 inline-flex h-10 w-10 items-center justify-center card text-gray-primary  lg:hidden"
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
          className="fixed inset-0 z-30 bg-secondary/60 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[284px] flex-col border-r border-gray-border bg-white text-gray-primary transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 border-b border-gray-border px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold tracking-tight text-secondary">
            FG
          </span>
          <div className="min-w-0">
            <strong className="block text-[15px] font-semibold tracking-tight text-secondary">
              FreeGateway
            </strong>
            <span className="block text-[11px] text-gray-secondary">
              Admin console
            </span>
          </div>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="ml-auto hidden h-8 w-8 items-center justify-center rounded-lg text-xl leading-none text-gray-secondary hover:text-secondary lg:hidden"
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
                <span className="block px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-secondary">
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
                      className={`mb-0.5 flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-nav-hover ${
                        active ? 'bg-nav-hover text-secondary' : ''
                      }`}
                    >
                      <span
                        className={
                          active ? 'text-primary' : 'text-gray-secondary'
                        }
                      >
                        {item.icon}
                      </span>
                      <span className="flex flex-col leading-tight">
                        <strong className="text-sm font-medium">
                          {item.label}
                        </strong>
                        <em className="text-[11px] not-italic text-gray-secondary">
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

        <div className="border-t border-gray-border p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex flex-col">
              <strong className="truncate text-sm font-medium text-secondary">
                {user.name}
              </strong>
              <span className="truncate text-[11px] text-gray-secondary">
                {user.email}
              </span>
              <span
                className={`mt-1 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
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
            className="w-full btn btn-secondary"
          >
            {leaving ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </aside>
    </>
  );
}
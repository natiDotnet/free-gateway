import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  can,
  getAdminUserBySessionToken,
  type AdminPermission,
  type AdminUser,
} from '@org/db';

export const SESSION_COOKIE = 'fg_admin_session';

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

/** Resolve the signed-in admin for the current request (server
 *  components + route handlers). Null when there is no valid session. */
export async function getCurrentAdmin(): Promise<AdminUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getAdminUserBySessionToken(token);
}

/** Server-component guard: redirects to /login when unauthenticated. */
export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  return admin;
}

/** Server-component guard: redirect when the role lacks permission. */
export async function requirePagePermission(
  permission: AdminPermission
): Promise<AdminUser> {
  const admin = await requireAdmin();
  if (!can(admin.role, permission)) redirect('/payments');
  return admin;
}

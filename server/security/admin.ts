import type { User } from '../../shared/schema.js';
import type { IStorage } from '../storage/index.js';

export async function ensureAdminRole<T extends Pick<User, 'role' | 'id' | 'email'>>(
  user: T | undefined | null,
  storage: IStorage
): Promise<T | undefined | null> {
  if (!user) {
    return null;
  }

  const SUPER_ADMIN_EMAIL = 'austin@c4saas.com';
  
  if (user.email === SUPER_ADMIN_EMAIL && user.role !== 'super_admin') {
    return { ...user, role: 'super_admin' as const };
  }

  const allUsers = await storage.listUsers();
  const hasPrivilegedUser = allUsers.some(
    (existingUser) => existingUser.role === 'admin' || existingUser.role === 'super_admin'
  );
  const hasSuperAdmin = allUsers.some((existingUser) => existingUser.role === 'super_admin');

  if (!hasSuperAdmin && allUsers.length === 1 && allUsers[0].id === user.id && user.role !== 'super_admin') {
    return { ...user, role: 'super_admin' as const };
  }

  if (!hasPrivilegedUser && allUsers.length === 1 && allUsers[0].id === user.id && user.role !== 'admin') {
    return { ...user, role: 'admin' as const };
  }

  return user;
}

export function isAdminUser(user: Pick<User, 'role'> | undefined | null): boolean {
  return Boolean(user && (user.role === 'admin' || user.role === 'super_admin'));
}

export function isSuperAdminUser(user: Pick<User, 'role'> | undefined | null): boolean {
  return Boolean(user && user.role === 'super_admin');
}

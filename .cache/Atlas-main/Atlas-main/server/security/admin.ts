import type { User } from '@shared/schema';
import type { IStorage } from '../storage';

export async function ensureAdminRole<T extends Pick<User, 'role' | 'id'>>(
  user: T | undefined | null,
  storage: IStorage
): Promise<T | undefined | null> {
  if (!user) {
    return null;
  }

  const allUsers = await storage.listUsers();
  const hasSuperAdmin = allUsers.some((existingUser) => existingUser.role === 'super_admin');

  const isSoleUser = allUsers.length === 1 && allUsers[0]?.id === user.id;

  if (!hasSuperAdmin && isSoleUser && user.role !== 'super_admin') {
    return { ...user, role: 'super_admin' as const };
  }

  return user;
}

export function isAdminUser(user: Pick<User, 'role'> | undefined | null): boolean {
  return Boolean(user && (user.role === 'admin' || user.role === 'super_admin'));
}

export function isSuperAdminUser(user: Pick<User, 'role'> | undefined | null): boolean {
  return Boolean(user && user.role === 'super_admin');
}

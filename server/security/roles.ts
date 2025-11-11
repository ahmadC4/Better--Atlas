import type { RequestHandler } from 'express';
import type { UserRole } from '../../shared/schema.js';
import type { IStorage } from '../storage/index.js';
import { ensureAdminRole } from './admin.js';

let cachedStorage: IStorage | null = null;

async function resolveStorage(): Promise<IStorage> {
  if (cachedStorage) {
    return cachedStorage as IStorage;
  }
  const module = await import('../storage/index.js');
  cachedStorage = (module as any).storage;
  return cachedStorage as IStorage;
}

export function requireRole(
  allowedRoles: UserRole[],
  storageInstance?: IStorage,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const resolvedStorage = storageInstance ?? (await resolveStorage());
      if (typeof req.isAuthenticated === 'function' && !req.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const requestUser = (req as any).user ?? null;
      const sessionUserId = requestUser?.id ?? req.session?.userId;

      if (!sessionUserId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const user = requestUser ?? (await resolvedStorage.getUser(sessionUserId));
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      const normalized = (await ensureAdminRole(user, resolvedStorage)) ?? user;
      if (normalized.role !== user.role) {
        await resolvedStorage.updateUser(normalized.id, { role: normalized.role });
      }

      if (!allowedRoles.includes(normalized.role as UserRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      (req as any).user = normalized;
      return next();
    } catch (error) {
      console.error('Role check failed:', error);
      return res.status(500).json({ error: 'Failed to verify permissions' });
    }
  };
}

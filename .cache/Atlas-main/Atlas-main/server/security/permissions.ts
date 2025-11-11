import { RequestHandler } from 'express';
import { IStorage } from '../storage';
import { storage as defaultStorage } from '../storage';
import { ROLE_PERMISSIONS, Permission } from '@shared/constants';

export function requirePermission(
  permission: Permission,
  storageInstance?: IStorage,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const resolvedStorage = storageInstance ?? defaultStorage;
      
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

      const userPermissions = ROLE_PERMISSIONS[user.role] || [];
      
      if (!userPermissions.includes(permission)) {
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: permission,
          role: user.role
        });
      }

      (req as any).user = user;
      return next();
    } catch (error) {
      console.error('Permission check failed:', error);
      return res.status(500).json({ error: 'Failed to verify permissions' });
    }
  };
}

export function requireAnyPermission(
  permissions: Permission[],
  storageInstance?: IStorage,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const resolvedStorage = storageInstance ?? defaultStorage;
      
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

      const userPermissions = ROLE_PERMISSIONS[user.role] || [];
      const hasPermission = permissions.some(p => userPermissions.includes(p));
      
      if (!hasPermission) {
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          requiredAny: permissions,
          role: user.role
        });
      }

      (req as any).user = user;
      return next();
    } catch (error) {
      console.error('Permission check failed:', error);
      return res.status(500).json({ error: 'Failed to verify permissions' });
    }
  };
}

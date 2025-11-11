import { useAuth } from './useAuth';
import { ROLE_PERMISSIONS, Permission } from '@shared/constants';

export function usePermissions() {
  const { user } = useAuth();

  const hasPermission = (permission: Permission): boolean => {
    if (!user?.role) return false;
    const userPermissions = ROLE_PERMISSIONS[user.role] || [];
    return userPermissions.includes(permission);
  };

  const hasAnyPermission = (permissions: Permission[]): boolean => {
    return permissions.some(permission => hasPermission(permission));
  };

  const hasAllPermissions = (permissions: Permission[]): boolean => {
    return permissions.every(permission => hasPermission(permission));
  };

  const canEdit = (viewPermission: Permission): boolean => {
    const editPermission = viewPermission.replace(':view', ':edit') as Permission;
    return hasPermission(editPermission);
  };

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canEdit,
  };
}

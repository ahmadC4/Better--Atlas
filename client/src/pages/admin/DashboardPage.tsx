import { useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { 
  Settings, 
  Package, 
  Bot, 
  Key, 
  Users as UsersIcon,
  FileText,
  Loader2,
  ArrowRight
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/use-permissions';
import { ADMIN_NAV_GROUPS, PERMISSIONS } from '@shared/constants';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface AdminUsersResponse {
  users: Array<{ id: string; role: string; status: string }>;
}

export default function DashboardPage() {
  const { user, isAdmin, isLoading: isAuthLoading } = useAuth();
  const { hasPermission } = usePermissions();
  const [, setLocation] = useLocation();

  const usersQuery = useQuery<AdminUsersResponse>({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/users');
      return response.json();
    },
    enabled: isAdmin && hasPermission(PERMISSIONS.USER_MANAGEMENT_VIEW),
  });

  useEffect(() => {
    if (!isAuthLoading && !isAdmin) {
      setLocation('/');
    }
  }, [isAdmin, isAuthLoading, setLocation]);

  if (isAuthLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const visibleGroups = ADMIN_NAV_GROUPS.filter(group => 
    hasPermission(group.requiredPermission)
  ).map(group => ({
    ...group,
    items: group.items.filter(item => hasPermission(item.requiredPermission))
  })).filter(group => group.items.length > 0);

  const firstAvailablePath = visibleGroups[0]?.items[0]?.path;

  const userStats = usersQuery.data?.users;
  const totalUsers = userStats?.length ?? 0;
  const activeUsers = userStats ? userStats.filter(u => u.status === 'active').length : 0;
  const adminUsers = userStats
    ? userStats.filter(u => u.role === 'admin' || u.role === 'super_admin').length
    : 0;

  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    Settings,
    Package,
    Bot,
    Key,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {user.name || user.email}. Manage your platform settings and configurations.
        </p>
      </div>

      {/* Quick Stats */}
      {hasPermission(PERMISSIONS.USER_MANAGEMENT_VIEW) && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <UsersIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalUsers}</div>
              <p className="text-xs text-muted-foreground">
                {activeUsers} active
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Administrators</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{adminUsers}</div>
              <p className="text-xs text-muted-foreground">
                Admin & Super Admin
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Your Role</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold capitalize">{user.role?.replace('_', ' ')}</div>
              <p className="text-xs text-muted-foreground">
                {user.role === 'super_admin' ? 'Full access' : user.role === 'admin' ? 'Limited access' : 'View only'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick Access Cards */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Quick Access</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visibleGroups.map((group) => {
            const Icon = iconMap[group.icon];
            return (
              <Card key={group.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {Icon && <Icon className="h-5 w-5" />}
                    {group.label}
                  </CardTitle>
                  <CardDescription>
                    {group.items.length} {group.items.length === 1 ? 'section' : 'sections'} available
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {group.items.slice(0, 3).map((item) => (
                      <Link key={item.id} href={item.path}>
                        <Button
                          variant="ghost"
                          className="w-full justify-start"
                          data-testid={`link-quick-${item.id}`}
                        >
                          <ArrowRight className="mr-2 h-4 w-4" />
                          {item.label}
                        </Button>
                      </Link>
                    ))}
                    {group.items.length > 3 && (
                      <p className="text-xs text-muted-foreground pl-2">
                        +{group.items.length - 3} more...
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Getting Started for new admins */}
      {user.role === 'admin' && (
        <Card className="border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle>Admin Access Notice</CardTitle>
            <CardDescription className="text-amber-800 dark:text-amber-200">
              As an Admin, you can manage most platform settings. However, System Prompts and Tool Policies are view-only and require Super Admin privileges to edit.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {firstAvailablePath && visibleGroups.length > 0 && (
        <div className="flex justify-center pt-4">
          <Link href={firstAvailablePath}>
            <Button size="lg" data-testid="button-get-started">
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

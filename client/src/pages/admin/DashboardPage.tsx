import { useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import {
  Users as UsersIcon,
  Settings,
  Package,
  Bot,
  Key,
  FileText,
  Building2,
  CreditCard,
  Brain,
  LifeBuoy,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@shared/constants';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { AdminQuickLinkCard } from '@/components/admin';
import {
  getDashboardRoutes,
  getRouteDashboardCard,
  type AdminIconName,
} from '@shared/adminRoutes';

const iconComponents: Partial<Record<AdminIconName, React.ComponentType<{ className?: string }>>> = {
  Settings,
  Package,
  Bot,
  Key,
  Users: UsersIcon,
  FileText,
  Building2,
  CreditCard,
  Brain,
  LifeBuoy,
};

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

  const systemRoutes = useMemo(() => getDashboardRoutes('system'), []);
  const systemCards = systemRoutes
    .map((route) => ({ route, card: getRouteDashboardCard(route, 'system') }))
    .filter((x) => x.card !== undefined) as Array<{
      route: ReturnType<typeof getDashboardRoutes>[number];
      card: NonNullable<ReturnType<typeof getRouteDashboardCard>>;
    }>;

  const iconFor = (name?: AdminIconName) => (name ? iconComponents[name] : undefined);

  const userStats = usersQuery.data?.users ?? [];
  const totalUsers = userStats.length;
  const activeUsers = userStats.filter((u) => u.status === 'active').length;
  const adminUsers = userStats.filter((u) => u.role === 'admin' || u.role === 'super_admin').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {user.name || user.email}.</p>
      </div>

      {/* Quick stats */}
      {hasPermission(PERMISSIONS.USER_MANAGEMENT_VIEW) && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <UsersIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalUsers}</div>
              <p className="text-xs text-muted-foreground">{activeUsers} active</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Administrators</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{adminUsers}</div>
              <p className="text-xs text-muted-foreground">Admin & Super Admin</p>
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

      {/* System quick links */}
      <section className="space-y-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">System</h2>
          <p className="text-sm text-muted-foreground">Manage platform-wide policies, models, plans, and features.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {systemCards.map(({ route, card }) => (
            <AdminQuickLinkCard
              key={route.id}
              title={card.title}
              description={card.description}
              actionLabel={card.actionLabel}
              routeId={route.id as any}
              icon={iconFor(card.icon) ?? Settings}
              endpoints={route.apis.map((e) => ({ method: e.method, path: e.path }))}
              actionTestId={`quicklink-${route.id}`}
            />
          ))}
        </div>
      </section>

      {/* Manage users CTA (uses existing endpoint) */}
      {hasPermission(PERMISSIONS.USER_MANAGEMENT_VIEW) && (
        <div className="flex justify-end">
          <Button onClick={() => setLocation('/admin/users')}>Manage users</Button>
        </div>
      )}
    </div>
  );
}


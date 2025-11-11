import { useEffect } from 'react';
import { Loader2, Building2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useAdminLayout } from '@/components/AdminLayout';
import { getAdminRouteById } from '@shared/adminRoutes';

export default function OrganizationsPage() {
  const { isAdmin, isLoading: isAuthLoading } = useAuth();
  const { setHeader, resetHeader } = useAdminLayout();
  const route = getAdminRouteById('organizations');

  useEffect(() => {
    setHeader({
      title: route.label,
      description: 'Review workspaces and teams (Enterprise only).',
    });
    return () => resetHeader();
  }, [resetHeader, setHeader, route.label]);

  if (isAuthLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Organizations & Teams
          </CardTitle>
          <CardDescription>Enterprise-only feature. This view will list organizations, teams, and membership.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No data yet. Configure enterprise workspaces to see organizations here.</p>
        </CardContent>
      </Card>
    </div>
  );
}


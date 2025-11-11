import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@shared/constants';
import AdminToolPoliciesCard from '@/components/admin/AdminToolPoliciesCard';
import { useAdminLayout } from '@/components/AdminLayout';
import { getAdminRouteById } from '@shared/adminRoutes';

export default function ToolPoliciesPage() {
  const { setHeader, resetHeader } = useAdminLayout();
  const routeMeta = getAdminRouteById('tool-policies');
  useEffect(() => {
    setHeader({ title: routeMeta.pageHeader?.title ?? routeMeta.label, description: routeMeta.pageHeader?.description });
    return () => resetHeader();
  }, [setHeader, resetHeader]);
  const { isAdmin, isLoading: isAuthLoading } = useAuth();
  const { canEdit } = usePermissions();
  const [, setLocation] = useLocation();

  const canEditToolPolicies = canEdit(PERMISSIONS.TOOL_POLICIES_VIEW);
  const isViewOnly = !canEditToolPolicies;

  useEffect(() => {
    if (!isAuthLoading && !isAdmin) {
      setLocation('/');
    }
  }, [isAdmin, isAuthLoading, setLocation]);

  if (isAuthLoading) {
    return (
      <div className="flex h-screen items-center justify-center" data-testid="loading-tool-policies">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <Card data-testid="card-tool-policies">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <CardTitle>Tool Policies & Safety Notes</CardTitle>
                <CardDescription>
                  Enable or disable tools per provider and share safety reminders with the models.
                </CardDescription>
              </div>
              {isViewOnly && (
                <Badge variant="secondary" className="shrink-0" data-testid="badge-view-only">
                  View Only
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <AdminToolPoliciesCard isViewOnly={isViewOnly} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

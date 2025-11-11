import { useEffect } from 'react';
import { Loader2, LifeBuoy } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useAdminLayout } from '@/components/AdminLayout';
import { getAdminRouteById } from '@shared/adminRoutes';

export default function TicketsPage() {
  const { isAdmin, isLoading: isAuthLoading } = useAuth();
  const { setHeader, resetHeader } = useAdminLayout();
  const route = getAdminRouteById('tickets');

  useEffect(() => {
    setHeader({
      title: route.label,
      description: 'Track and triage support tickets (stub UI).',
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
            <LifeBuoy className="h-5 w-5" /> Support Tickets
          </CardTitle>
          <CardDescription>This is a placeholder view. Wire to your support system to enable.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No tickets to show.</p>
        </CardContent>
      </Card>
    </div>
  );
}


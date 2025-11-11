import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import AdminCouponsCard from '@/components/admin/AdminCouponsCard';

export default function AccessCodesPage() {
  const { isAdmin, isLoading: isAuthLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isAuthLoading && !isAdmin) {
      setLocation('/');
    }
  }, [isAdmin, isAuthLoading, setLocation]);

  if (isAuthLoading) {
    return (
      <div className="flex h-screen items-center justify-center" data-testid="loading-access-codes">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <Card data-testid="card-access-codes">
          <CardHeader>
            <CardTitle>Pro access codes</CardTitle>
            <CardDescription>
              Generate manual upgrade codes for teams and track their usage.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AdminCouponsCard />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Button } from '@/components/ui/button';

const N8N_BASE_URL = (import.meta.env.VITE_N8N_BASE_URL || 'https://zap.c4saas.com/').trim();

export default function N8NPage() {
  const { isLoading, isAuthenticated } = useAuth();

  const targetUrl = useMemo(() => {
    if (!N8N_BASE_URL) return '';
    try {
      const url = new URL(N8N_BASE_URL);
      return url.toString();
    } catch {
      return N8N_BASE_URL;
    }
  }, []);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
          <h1 className="mb-2 text-lg font-semibold">Login required</h1>
          <p className="text-sm text-muted-foreground">
            Please log in to Atlas to access N8N.
          </p>
        </div>
      </div>
    );
  }

  if (!targetUrl) {
    return (
      <div className="flex h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
          <h1 className="mb-2 text-lg font-semibold">N8N not configured</h1>
          <p className="text-sm text-muted-foreground">
            Set <code className="font-mono text-xs">VITE_N8N_BASE_URL</code> in your environment to open N8N.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center px-4">
      <div className="max-w-md rounded-xl border bg-card p-6 text-center shadow-sm space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Open N8N Workspace</h1>
          <p className="text-sm text-muted-foreground break-words">{targetUrl}</p>
        </div>
        <Button asChild className="gap-2">
          <a href={targetUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" />
            Open in new tab
          </a>
        </Button>
        <p className="text-xs text-muted-foreground">
          Note: N8N uses frame protection, so it must open in a separate tab.
        </p>
      </div>
    </div>
  );
}

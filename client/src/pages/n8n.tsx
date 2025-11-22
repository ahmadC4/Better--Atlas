import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/LoadingScreen';

const N8N_BASE_URL = import.meta.env.VITE_N8N_BASE_URL || 'https://zap.c4saas.com/';

export default function N8NPage() {
  const { isLoading, isAuthenticated } = useAuth();

  const iframeSrc = useMemo(() => {
    const base = N8N_BASE_URL.trim();
    if (!base) return '';
    try {
      const url = new URL(base);
      return url.toString();
    } catch {
      return base;
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
            Please log in to Atlas to access the embedded N8N workspace.
          </p>
        </div>
      </div>
    );
  }

  if (!iframeSrc) {
    return (
      <div className="flex h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
          <h1 className="mb-2 text-lg font-semibold">N8N not configured</h1>
          <p className="text-sm text-muted-foreground">
            Set <code className="font-mono text-xs">VITE_N8N_BASE_URL</code> in your environment to embed your N8N
            instance here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b bg-card/80 px-4 py-2 text-sm">
        <div className="font-medium">N8N Workspace</div>
        <div className="text-xs text-muted-foreground">
          Embedded view of your N8N instance ({iframeSrc})
        </div>
      </header>
      <main className="flex-1">
        <iframe
          src={iframeSrc}
          title="N8N"
          className="h-full w-full border-0"
          allow="clipboard-read; clipboard-write; fullscreen"
        />
      </main>
    </div>
  );
}

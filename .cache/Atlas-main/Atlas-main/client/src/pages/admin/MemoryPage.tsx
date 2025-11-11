import { useCallback, useEffect, useMemo } from 'react';
import { useAdminSettings } from '@/hooks/use-admin-settings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';
import { useAdminLayout } from '@/components/AdminLayout';
import { AdminSettingsErrorState } from '@/components/admin';
import { getAdminRouteById } from '@shared/adminRoutes';

export default function MemoryPage() {
  const { draft, setDraft, isLoading, isSaving, handleSave, isError, refetch } = useAdminSettings();
  const { setHeader, resetHeader } = useAdminLayout();
  const route = getAdminRouteById('memory');
  const headerTitle = route.pageHeader?.title ?? route.label;
  const headerDescription = route.pageHeader?.description;

  const handleToggleEnabled = useCallback((checked: boolean) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      next.memory.enabled = checked;
      return next;
    });
  }, [setDraft]);

  const handleMaxMemoriesChange = useCallback((value: string) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      const parsed = value === '' ? null : parseInt(value, 10);
      next.memory.maxMemoriesPerUser = isNaN(parsed as number) ? null : parsed;
      return next;
    });
  }, [setDraft]);

  const handleRetentionDaysChange = useCallback((value: string) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      const parsed = value === '' ? null : parseInt(value, 10);
      next.memory.retentionDays = isNaN(parsed as number) ? null : parsed;
      return next;
    });
  }, [setDraft]);

  const hasLoadedDraft = Boolean(draft);

  const headerActions = useMemo(() => {
    if (!hasLoadedDraft) {
      return null;
    }

    return (
      <Button
        onClick={() => { void handleSave('memory'); }}
        disabled={isSaving}
        className="gap-2 whitespace-nowrap sm:w-auto"
        data-testid="button-save-memory"
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        Save changes
      </Button>
    );
  }, [hasLoadedDraft, handleSave, isSaving]);

  useEffect(() => {
    setHeader({
      title: headerTitle,
      description: headerDescription,
      ...(headerActions ? { actions: headerActions } : {}),
    });
    return () => resetHeader();
  }, [setHeader, resetHeader, headerActions, headerTitle, headerDescription]);

  if (isError) {
    return (
      <AdminSettingsErrorState
        title={`We couldn't load ${headerTitle} settings.`}
        description="Please check your connection and try again."
        onRetry={refetch}
        testId="admin-settings-error-state-memory"
      />
    );
  }

  if (isLoading || !draft) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const memorySettings = draft.memory;

  return (
    <div className="flex-1 overflow-auto px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <Card data-testid="card-memory-settings">
          <CardHeader>
            <CardTitle>Memory settings</CardTitle>
            <CardDescription>
              Control how the AI remembers user preferences and context across conversations.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
              <div className="space-y-1">
                <Label htmlFor="memory-enabled" className="text-sm font-medium">Enable long-term memory</Label>
                <p className="text-xs text-muted-foreground">
                  Allow AI to remember user preferences, facts, and context across sessions.
                </p>
              </div>
              <Switch
                id="memory-enabled"
                checked={memorySettings.enabled}
                onCheckedChange={handleToggleEnabled}
                data-testid="switch-memory-enabled"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="memory-max">Max memories per user</Label>
              <Input
                id="memory-max"
                type="number"
                min={0}
                placeholder="Leave blank for unlimited"
                value={memorySettings.maxMemoriesPerUser ?? ''}
                onChange={(event) => handleMaxMemoriesChange(event.target.value)}
                data-testid="input-memory-max"
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of memory items to store per user. Blank = unlimited.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="memory-retention">Retention window (days)</Label>
              <Input
                id="memory-retention"
                type="number"
                min={1}
                placeholder="Leave blank for permanent"
                value={memorySettings.retentionDays ?? ''}
                onChange={(event) => handleRetentionDaysChange(event.target.value)}
                data-testid="input-memory-retention"
              />
              <p className="text-xs text-muted-foreground">
                Number of days to retain memories before auto-deletion. Blank = keep forever.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

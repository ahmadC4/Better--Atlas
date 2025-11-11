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

export default function KnowledgeBasePage() {
  const { draft, setDraft, isLoading, isSaving, handleSave, isError, refetch } = useAdminSettings();
  const { setHeader, resetHeader } = useAdminLayout();
  const route = getAdminRouteById('knowledge-base');
  const headerTitle = route.pageHeader?.title ?? route.label;
  const headerDescription = route.pageHeader?.description;

  const handleToggleEnabled = useCallback((checked: boolean) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      next.knowledgeBase.enabled = checked;
      return next;
    });
  }, [setDraft]);

  const handleMaxItemsChange = useCallback((value: string) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      const parsed = value === '' ? null : parseInt(value, 10);
      next.knowledgeBase.maxItems = isNaN(parsed as number) ? null : parsed;
      return next;
    });
  }, [setDraft]);

  const handleMaxStorageChange = useCallback((value: string) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      const parsed = value === '' ? null : parseInt(value, 10);
      next.knowledgeBase.maxStorageMb = isNaN(parsed as number) ? null : parsed;
      return next;
    });
  }, [setDraft]);

  const handleToggleUploads = useCallback((checked: boolean) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      next.knowledgeBase.allowUploads = checked;
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
        onClick={() => { void handleSave('knowledgeBase'); }}
        disabled={isSaving}
        className="gap-2 whitespace-nowrap sm:w-auto"
        data-testid="button-save-knowledge-base"
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
        testId="admin-settings-error-state-knowledge-base"
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

  const kbSettings = draft.knowledgeBase;

  return (
    <div className="flex-1 overflow-auto px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <Card data-testid="card-knowledge-base-settings">
          <CardHeader>
            <CardTitle>Knowledge base settings</CardTitle>
            <CardDescription>
              Control whether users can create and manage knowledge base items.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
              <div className="space-y-1">
                <Label htmlFor="kb-enabled" className="text-sm font-medium">Enable knowledge base</Label>
                <p className="text-xs text-muted-foreground">
                  Allow users to upload documents, add URLs, and manage knowledge items.
                </p>
              </div>
              <Switch
                id="kb-enabled"
                checked={kbSettings.enabled}
                onCheckedChange={handleToggleEnabled}
                data-testid="switch-kb-enabled"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="kb-max-items">Max items per user</Label>
              <Input
                id="kb-max-items"
                type="number"
                min={0}
                placeholder="Leave blank for unlimited"
                value={kbSettings.maxItems ?? ''}
                onChange={(event) => handleMaxItemsChange(event.target.value)}
                data-testid="input-kb-max-items"
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of knowledge base items each user can create. Blank = unlimited.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="kb-max-storage">Storage per user (MB)</Label>
              <Input
                id="kb-max-storage"
                type="number"
                min={0}
                placeholder="Leave blank for unlimited"
                value={kbSettings.maxStorageMb ?? ''}
                onChange={(event) => handleMaxStorageChange(event.target.value)}
                data-testid="input-kb-max-storage"
              />
              <p className="text-xs text-muted-foreground">
                Maximum total storage in megabytes for all knowledge items per user. Blank = unlimited.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
              <div className="space-y-1">
                <Label htmlFor="kb-allow-uploads" className="text-sm font-medium">Allow file uploads</Label>
                <p className="text-xs text-muted-foreground">
                  Enable users to upload documents and files to their knowledge base.
                </p>
              </div>
              <Switch
                id="kb-allow-uploads"
                checked={kbSettings.allowUploads}
                onCheckedChange={handleToggleUploads}
                data-testid="switch-kb-allow-uploads"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

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

export default function TemplatesProjectsPage() {
  const { draft, setDraft, isLoading, isSaving, handleSave, isError, refetch } = useAdminSettings();
  const { setHeader, resetHeader } = useAdminLayout();
  const route = getAdminRouteById('templates-projects');
  const headerTitle = route.pageHeader?.title ?? route.label;
  const headerDescription = route.pageHeader?.description;

  const handleToggleTemplatesEnabled = useCallback((checked: boolean) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      next.templates.enabled = checked;
      return next;
    });
  }, [setDraft]);

  const handleMaxTemplatesChange = useCallback((value: string) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      const parsed = value === '' ? null : parseInt(value, 10);
      next.templates.maxTemplatesPerUser = isNaN(parsed as number) ? null : parsed;
      return next;
    });
  }, [setDraft]);

  const handleToggleProjectsEnabled = useCallback((checked: boolean) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      next.projects.enabled = checked;
      return next;
    });
  }, [setDraft]);

  const handleMaxProjectsChange = useCallback((value: string) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      const parsed = value === '' ? null : parseInt(value, 10);
      next.projects.maxProjectsPerUser = isNaN(parsed as number) ? null : parsed;
      return next;
    });
  }, [setDraft]);

  const handleMaxMembersChange = useCallback((value: string) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      const parsed = value === '' ? null : parseInt(value, 10);
      next.projects.maxMembersPerProject = isNaN(parsed as number) ? null : parsed;
      return next;
    });
  }, [setDraft]);

  const handleSaveAll = useCallback(async () => {
    if (!draft) return;
    await handleSave();
  }, [draft, handleSave]);

  const hasLoadedDraft = Boolean(draft);

  const headerActions = useMemo(() => {
    if (!hasLoadedDraft) {
      return null;
    }

    return (
      <Button
        onClick={() => { void handleSaveAll(); }}
        disabled={isSaving}
        className="gap-2 whitespace-nowrap sm:w-auto"
        data-testid="button-save-templates-projects"
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        Save changes
      </Button>
    );
  }, [hasLoadedDraft, handleSaveAll, isSaving]);

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
        testId="admin-settings-error-state-templates-projects"
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

  const templatesSettings = draft.templates;
  const projectsSettings = draft.projects;

  return (
    <div className="flex-1 overflow-auto px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <Card data-testid="card-templates-settings">
          <CardHeader>
            <CardTitle>Templates</CardTitle>
            <CardDescription>
              Control access to reusable templates for users.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
              <div className="space-y-1">
                <Label htmlFor="templates-enabled" className="text-sm font-medium">Enable templates</Label>
                <p className="text-xs text-muted-foreground">
                  Allow users to access and use predefined templates.
                </p>
              </div>
              <Switch
                id="templates-enabled"
                checked={templatesSettings.enabled}
                onCheckedChange={handleToggleTemplatesEnabled}
                data-testid="switch-templates-enabled"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="templates-max">Templates per user limit</Label>
              <Input
                id="templates-max"
                type="number"
                min={0}
                placeholder="Leave blank for unlimited"
                value={templatesSettings.maxTemplatesPerUser ?? ''}
                onChange={(event) => handleMaxTemplatesChange(event.target.value)}
                data-testid="input-templates-max"
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of templates each user can access or create. Blank = unlimited.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-projects-settings">
          <CardHeader>
            <CardTitle>Projects</CardTitle>
            <CardDescription>
              Configure collaborative project spaces and team limits.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
              <div className="space-y-1">
                <Label htmlFor="projects-enabled" className="text-sm font-medium">Enable projects</Label>
                <p className="text-xs text-muted-foreground">
                  Allow users to create and collaborate on team projects.
                </p>
              </div>
              <Switch
                id="projects-enabled"
                checked={projectsSettings.enabled}
                onCheckedChange={handleToggleProjectsEnabled}
                data-testid="switch-projects-enabled"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="projects-max">Projects per user limit</Label>
              <Input
                id="projects-max"
                type="number"
                min={0}
                placeholder="Leave blank for unlimited"
                value={projectsSettings.maxProjectsPerUser ?? ''}
                onChange={(event) => handleMaxProjectsChange(event.target.value)}
                data-testid="input-projects-max"
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of projects each user can create. Blank = unlimited.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="projects-members-max">Members per project limit</Label>
              <Input
                id="projects-members-max"
                type="number"
                min={1}
                placeholder="Leave blank for unlimited"
                value={projectsSettings.maxMembersPerProject ?? ''}
                onChange={(event) => handleMaxMembersChange(event.target.value)}
                data-testid="input-projects-members-max"
              />
              <p className="text-xs text-muted-foreground">
                Maximum team size for each project. Blank = unlimited collaborators.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

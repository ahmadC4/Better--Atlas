import { useCallback } from 'react';
import { useAdminSettings } from '@/hooks/use-admin-settings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';

export default function MemoryPage() {
  const { draft, setDraft, isLoading, isSaving, handleSave } = useAdminSettings();

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
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold">Memory & Personalization</h1>
              <p className="text-muted-foreground mt-2">
                Configure long-term memory and personalization settings for AI assistants.
              </p>
            </div>
            <Button
              onClick={() => handleSave('memory')}
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
          </div>
        </div>

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

import { useCallback } from 'react';
import { useAdminSettings } from '@/hooks/use-admin-settings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';

export default function AgentsPage() {
  const { draft, setDraft, isLoading, isSaving, handleSave } = useAdminSettings();

  const handleToggleEnabled = useCallback((checked: boolean) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      next.aiAgents.enabled = checked;
      return next;
    });
  }, [setDraft]);

  const handleMaxAgentsChange = useCallback((value: string) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      const parsed = value === '' ? null : parseInt(value, 10);
      next.aiAgents.maxAgentsPerUser = isNaN(parsed as number) ? null : parsed;
      return next;
    });
  }, [setDraft]);

  const handleToggleAutonomous = useCallback((checked: boolean) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      next.aiAgents.allowAutonomousExecution = checked;
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

  const agentsSettings = draft.aiAgents;

  return (
    <div className="flex-1 overflow-auto px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold">AI Agents</h1>
              <p className="text-muted-foreground mt-2">
                Configure custom AI agents and autonomous execution settings.
              </p>
            </div>
            <Button
              onClick={() => handleSave('aiAgents')}
              disabled={isSaving}
              className="gap-2 whitespace-nowrap sm:w-auto"
              data-testid="button-save-agents"
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

        <Card data-testid="card-agents-settings">
          <CardHeader>
            <CardTitle>AI agents configuration</CardTitle>
            <CardDescription>
              Control custom agent creation and autonomous execution capabilities.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
              <div className="space-y-1">
                <Label htmlFor="agents-enabled" className="text-sm font-medium">Enable custom agents</Label>
                <p className="text-xs text-muted-foreground">
                  Allow users to create and configure their own AI agents.
                </p>
              </div>
              <Switch
                id="agents-enabled"
                checked={agentsSettings.enabled}
                onCheckedChange={handleToggleEnabled}
                data-testid="switch-agents-enabled"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="agents-max">Max agents per user</Label>
              <Input
                id="agents-max"
                type="number"
                min={0}
                placeholder="Leave blank for unlimited"
                value={agentsSettings.maxAgentsPerUser ?? ''}
                onChange={(event) => handleMaxAgentsChange(event.target.value)}
                data-testid="input-agents-max"
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of custom agents each user can create. Blank = unlimited.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
              <div className="space-y-1">
                <Label htmlFor="agents-autonomous" className="text-sm font-medium">Allow autonomous execution</Label>
                <p className="text-xs text-muted-foreground">
                  Enable agents to execute tasks and make decisions without explicit user approval.
                </p>
              </div>
              <Switch
                id="agents-autonomous"
                checked={agentsSettings.allowAutonomousExecution}
                onCheckedChange={handleToggleAutonomous}
                data-testid="switch-agents-autonomous"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

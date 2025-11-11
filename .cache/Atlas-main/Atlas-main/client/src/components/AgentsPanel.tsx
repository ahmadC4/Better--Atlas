import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plug, Trash2, Workflow, Link as LinkIcon, ExternalLink } from 'lucide-react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { N8nAgent } from '@shared/schema';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDeleteN8nAgent } from '@/hooks/use-delete-n8n-agent';

interface AgentsPanelProps {
  className?: string;
}

export function AgentsPanel({ className }: AgentsPanelProps) {
  const [, setLocation] = useLocation();
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);

  const agentsQuery = useQuery<N8nAgent[]>({
    queryKey: ['/api/integrations/n8n/agents'],
  });

  const deleteAgentMutation = useDeleteN8nAgent();

  const agents = agentsQuery.data ?? [];
  const agentsError = agentsQuery.error as Error | null;
  const isLoadingAgents = agentsQuery.isLoading || agentsQuery.isFetching;

  const handleDeleteAgent = (agentId: string) => {
    setDeletingAgentId(agentId);
    deleteAgentMutation.mutate(agentId, {
      onSettled: () => setDeletingAgentId(null),
    });
  };

  const handleOpenIntegrations = () => {
    const params = new URLSearchParams({ settings: 'integrations', provider: 'n8n' });
    setLocation(`/?${params.toString()}`);
  };

  return (
    <div className={cn('space-y-4 w-full', className)}>
      <Card className="w-full border-border/60 bg-card/80 backdrop-blur-sm">
        <CardHeader className="space-y-2 p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plug className="h-5 w-5 text-primary" />
            Manage N8N connection
          </CardTitle>
          <CardDescription>
            Connect your N8N workspace and manage API keys from <span className="font-medium">Settings → Integrations</span>.
            Agents added there will appear below.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-4 pt-0 sm:flex-row sm:items-center sm:justify-between sm:p-6 sm:pt-0">
          <p className="text-sm text-muted-foreground">
            Looking to add new workflows? Head to the integrations tab to link your workspace and import agents.
          </p>
          <Button type="button" variant="outline" size="sm" className="gap-2 self-start sm:self-auto" onClick={handleOpenIntegrations}>
            <ExternalLink className="h-4 w-4" /> Open integrations
          </Button>
        </CardContent>
      </Card>

      <Card className="w-full border-border/60 bg-card/80 backdrop-blur-sm">
        <CardHeader className="space-y-2 p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Workflow className="h-5 w-5 text-primary" />
            Connected agents
          </CardTitle>
          <CardDescription>
            These N8N-powered agents are available to your workspace. Remove agents here or manage them from the integrations tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
          {agentsError && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {agentsError.message || 'We could not load your N8N agents.'}
            </div>
          )}

          {isLoadingAgents ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading agents...
            </div>
          ) : agents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No webhook connected. Paste your n8n webhook URL to test this agent.
            </div>
          ) : (
            <ScrollArea className="max-h-80">
              <div className="space-y-3 pr-2">
                {agents.map(agent => {
                  const isDeleting = deleteAgentMutation.isPending && deletingAgentId === agent.id;

                  return (
                    <div key={agent.id} className="rounded-xl border border-border/60 bg-background/70 p-4 shadow-sm">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">{agent.name}</p>
                            <Badge variant={agent.status === 'active' ? 'default' : 'outline'} className="text-[10px]">
                              {agent.status === 'active' ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                          {agent.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{agent.description}</p>
                          )}
                          <div className="space-y-1 text-xs text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground">Workflow ID:</span>
                              <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{agent.workflowId}</code>
                            </div>
                            {agent.webhookUrl && (
                              <div className="flex items-center gap-2">
                                <LinkIcon className="h-3 w-3" />
                                <a
                                  href={agent.webhookUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="truncate text-primary hover:underline"
                                >
                                  {agent.webhookUrl}
                                </a>
                              </div>
                            )}
                          </div>
                          {agent.metadata && (
                            <pre className="max-h-40 overflow-auto rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                              {JSON.stringify(agent.metadata, null, 2)}
                            </pre>
                          )}
                        </div>
                        <div className="flex flex-row gap-2 md:flex-col md:items-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="gap-2 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteAgent(agent.id)}
                            disabled={isDeleting}
                          >
                            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

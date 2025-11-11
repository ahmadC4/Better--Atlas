import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Plug,
  Trash2,
  Workflow,
  Link as LinkIcon,
  ExternalLink,
  Sparkles,
  ChevronDown,
  RefreshCcw,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type { N8nAgent } from '@shared/schema';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatDistanceToNow } from 'date-fns';

interface AgentsPanelProps {
  className?: string;
}

export interface N8nAgentRun {
  id: string;
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  finishedAt?: string | null;
  startedAt?: string | null;
  response?: unknown;
}

export function getRunTimestamp(run: N8nAgentRun): Date | null {
  const timestamp =
    run.finishedAt ?? run.updatedAt ?? run.createdAt ?? run.startedAt ?? null;

  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getRunResponseSnippet(run: N8nAgentRun, maxLength = 160): string {
  if (run.response === undefined || run.response === null) {
    return 'No response captured yet.';
  }

  const raw =
    typeof run.response === 'string'
      ? run.response
      : JSON.stringify(run.response, null, 2);

  if (raw.length <= maxLength) {
    return raw;
  }

  return `${raw.slice(0, maxLength - 1)}…`;
}

export function AgentsPanel({ className }: AgentsPanelProps) {
  const [, setLocation] = useLocation();
  const { toast: pushToast } = useToast();
  const queryClient = useQueryClient();
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);

  const agentsQuery = useQuery<N8nAgent[]>({
    queryKey: ['/api/integrations/n8n/agents'],
  });

  const deleteAgentMutation = useMutation({
    mutationFn: async (agentId: string) => {
      await apiRequest('DELETE', `/api/integrations/n8n/agents/${agentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/n8n/agents'] });
      pushToast({ title: 'Agent removed', description: 'The N8N agent is no longer available in Atlas.' });
    },
    onError: (error: any) => {
      pushToast({
        title: 'Failed to remove agent',
        description: error?.message ?? 'We could not delete the agent record.',
        variant: 'destructive',
      });
    },
  });

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
              No N8N agents yet. Connect your workspace from Settings → Integrations to sync workflows.
            </div>
          ) : (
            <ScrollArea className="max-h-80">
              <div className="space-y-3 pr-2">
                {agents.map(agent => {
                  const isDeleting = deleteAgentMutation.isPending && deletingAgentId === agent.id;

                  return (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      isDeleting={isDeleting}
                      onDelete={() => handleDeleteAgent(agent.id)}
                    />
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

interface AgentCardProps {
  agent: N8nAgent;
  isDeleting: boolean;
  onDelete: () => void;
}

function AgentCard({ agent, isDeleting, onDelete }: AgentCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [runsOpen, setRunsOpen] = useState(false);
  const pendingToastRef = useRef<ReturnType<typeof toast> | null>(null);

  const runsQuery = useQuery<N8nAgentRun[]>({
    queryKey: ['/api/integrations/n8n/agents', agent.id, 'runs'],
    enabled: runsOpen,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/integrations/n8n/agents/${agent.id}/runs`);
      try {
        return (await res.json()) as N8nAgentRun[];
      } catch (error) {
        console.error('Failed to parse agent runs response', error);
        return [];
      }
    },
  });

  const testAgentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/integrations/n8n/agents/${agent.id}/test`);
      try {
        return await res.json();
      } catch {
        return null;
      }
    },
    onMutate: () => {
      pendingToastRef.current = toast({
        title: 'Testing agent…',
        description: `Triggering the “${agent.name}” workflow.`,
      });
    },
    onSuccess: () => {
      pendingToastRef.current?.update({
        title: 'Test run started',
        description: 'We triggered the agent workflow. Check recent runs for updates.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/n8n/agents', agent.id, 'runs'] });
      pendingToastRef.current = null;
    },
    onError: (error: any) => {
      const description = error?.message ?? 'We could not trigger the test run.';
      if (pendingToastRef.current) {
        pendingToastRef.current.update({
          title: 'Failed to test agent',
          description,
          variant: 'destructive',
        });
        pendingToastRef.current = null;
      } else {
        toast({
          title: 'Failed to test agent',
          description,
          variant: 'destructive',
        });
      }
    },
  });

  const runs = runsQuery.data ?? [];
  const runsError = runsQuery.error as Error | null;
  const isLoadingRuns = runsQuery.isLoading || runsQuery.isFetching;

  const statusVariant: 'default' | 'outline' = agent.status === 'active' ? 'default' : 'outline';

    return (
      <div className="rounded-xl border border-border/60 bg-background/70 p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{agent.name}</p>
              <Badge variant={statusVariant} className="text-[10px]">
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

          <Collapsible open={runsOpen} onOpenChange={setRunsOpen} className="space-y-3 pt-2">
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto gap-2 px-0 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', runsOpen ? 'rotate-180' : '-rotate-90')}
                />
                View recent runs
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent activity</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => runsQuery.refetch()}
                  disabled={isLoadingRuns}
                  aria-label="Refresh runs"
                >
                  {isLoadingRuns ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                </Button>
              </div>
              {runsError && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
                  {runsError.message || 'We could not load recent runs for this agent.'}
                </div>
              )}
              {!runsError && (
                <div className="space-y-2">
                  {isLoadingRuns ? (
                    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading runs...
                    </div>
                  ) : runs.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
                      No runs yet. Trigger a test or wait for the next scheduled execution.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {runs.map(run => {
                        const timestamp = getRunTimestamp(run);
                        const relative = timestamp
                          ? formatDistanceToNow(timestamp, { addSuffix: true })
                          : 'Unknown time';
                        const snippet = getRunResponseSnippet(run);
                        const runStatus = run.status?.toLowerCase?.() ?? 'unknown';
                        const statusVariantForRun: 'default' | 'destructive' | 'outline' =
                          runStatus === 'success'
                            ? 'default'
                            : runStatus === 'failed' || runStatus === 'error'
                              ? 'destructive'
                              : 'outline';

                        return (
                          <div
                            key={run.id}
                            className="rounded-lg border border-border/60 bg-background/70 p-3 shadow-sm"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <Badge variant={statusVariantForRun} className="text-[10px] uppercase tracking-wide">
                                {run.status ?? 'Unknown'}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {timestamp ? `${relative} · ${timestamp.toLocaleString()}` : 'Timestamp unavailable'}
                              </span>
                            </div>
                            <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{snippet}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>

        <div className="flex flex-row gap-2 md:flex-col md:items-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-2"
            onClick={() => testAgentMutation.mutate()}
            disabled={testAgentMutation.isPending}
          >
            {testAgentMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Test agent
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-2 text-destructive hover:text-destructive"
            onClick={onDelete}
            disabled={isDeleting}
          >
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Remove
          </Button>
        </div>
      </div>
    </div>
  );
}

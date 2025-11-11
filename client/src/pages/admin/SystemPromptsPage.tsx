import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { AlertCircle, Save, Loader2, ListChecks, Pencil } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/queryClient';
import { DEFAULT_SYSTEM_PROMPT, PERMISSIONS } from '@shared/constants';
import { usePermissions } from '@/hooks/use-permissions';
import type { AdminSystemPrompt, AdminSystemPromptListResponse, AdminSystemPromptMutationResponse } from './types';
import { useAdminLayout } from '@/components/AdminLayout';
import { getAdminRouteById } from '@shared/adminRoutes';

export default function SystemPromptsPage() {
  const { setHeader, resetHeader } = useAdminLayout();
  const routeMeta = getAdminRouteById('system-prompts');
  useEffect(() => {
    setHeader({ title: routeMeta.pageHeader?.title ?? routeMeta.label, description: routeMeta.pageHeader?.description });
    return () => resetHeader();
  }, [setHeader, resetHeader]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin, user, isLoading: isAuthLoading } = useAuth();
  const { canEdit } = usePermissions();
  const [, setLocation] = useLocation();
  
  const canEditSystemPrompts = canEdit(PERMISSIONS.SYSTEM_PROMPTS_VIEW);
  const isViewOnly = !canEditSystemPrompts;

  const systemPromptsQuery = useQuery<AdminSystemPromptListResponse>({
    queryKey: ['admin-system-prompts'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/system-prompts');
      return response.json() as Promise<AdminSystemPromptListResponse>;
    },
    enabled: isAdmin,
  });

  const [systemPromptDraft, setSystemPromptDraft] = useState({
    label: '',
    notes: '',
    content: '',
  });
  const [activateOnSave, setActivateOnSave] = useState(true);
  const [hasEditedSystemPrompt, setHasEditedSystemPrompt] = useState(false);
  const [selectedSystemPromptId, setSelectedSystemPromptId] = useState<string | null>(null);
  const [activatingPromptId, setActivatingPromptId] = useState<string | null>(null);

  const systemPrompts = systemPromptsQuery.data?.systemPrompts ?? [];
  const activeSystemPromptId = systemPromptsQuery.data?.activeSystemPromptId ?? null;
  const activeSystemPrompt = systemPrompts.find((prompt) => prompt.id === activeSystemPromptId) ?? null;
  const nextSystemPromptVersion = systemPrompts.length > 0
    ? Math.max(...systemPrompts.map((prompt) => prompt.version)) + 1
    : 1;

  const parseQueryError = (error: unknown) => {
    const fallback = {
      title: 'Failed to load system prompts',
      description: 'Atlas AI needs its database tables. Run `npm run db:push` to apply Drizzle migrations, then try again.',
    };

    if (!(error instanceof Error)) {
      return fallback;
    }

    const message = error.message ?? '';
    const colonIndex = message.indexOf(':');
    const possibleBody = colonIndex >= 0 ? message.slice(colonIndex + 1).trim() : message;

    try {
      const parsed = JSON.parse(possibleBody);
      if (parsed && typeof parsed === 'object') {
        return {
          title: typeof (parsed as any).error === 'string' ? (parsed as any).error : fallback.title,
          description: typeof (parsed as any).detail === 'string' ? (parsed as any).detail : fallback.description,
        };
      }
    } catch {
      // ignore JSON parse errors; fall back to raw message
    }

    if (possibleBody) {
      return {
        title: fallback.title,
        description: possibleBody,
      };
    }

    return fallback;
  };

  useEffect(() => {
    if (!isAuthLoading && !isAdmin) {
      setLocation('/');
    }
  }, [isAdmin, isAuthLoading, setLocation]);

  useEffect(() => {
    if (!systemPromptsQuery.data) {
      return;
    }
    const { systemPrompts, activeSystemPromptId } = systemPromptsQuery.data;
    
    if (systemPrompts.length === 0) {
      if (!hasEditedSystemPrompt) {
        setSystemPromptDraft((prev) => ({
          ...prev,
          content: prev.content || DEFAULT_SYSTEM_PROMPT,
        }));
      }
      return;
    }

    const active = systemPrompts.find((prompt) => prompt.id === activeSystemPromptId) ?? systemPrompts[0];

    if (!hasEditedSystemPrompt) {
      setSystemPromptDraft((prev) => ({
        ...prev,
        content: active.content,
      }));
    }

    if (!selectedSystemPromptId || !systemPrompts.some((prompt) => prompt.id === selectedSystemPromptId)) {
      setSelectedSystemPromptId(active.id);
    }
  }, [systemPromptsQuery.data, hasEditedSystemPrompt, selectedSystemPromptId]);

  const systemPromptCreateMutation = useMutation({
    mutationFn: async ({ activate }: { activate: boolean }) => {
      const response = await apiRequest('POST', '/api/admin/system-prompts', {
        label: systemPromptDraft.label.trim() ? systemPromptDraft.label.trim() : null,
        notes: systemPromptDraft.notes.trim() ? systemPromptDraft.notes.trim() : null,
        content: systemPromptDraft.content,
        activate,
      });
      return response.json() as Promise<AdminSystemPromptMutationResponse>;
    },
    onSuccess: (result, variables) => {
      queryClient.setQueryData<AdminSystemPromptListResponse | undefined>(['admin-system-prompts'], {
        systemPrompts: result.systemPrompts,
        activeSystemPromptId: result.activeSystemPromptId,
      });
      toast({
        title: variables.activate ? 'System prompt activated' : 'System prompt saved',
        description: variables.activate
          ? `Version ${result.systemPrompt.version} is now live for all new chats.`
          : `Version ${result.systemPrompt.version} is ready for review.`,
      });
      setSystemPromptDraft((prev) => ({
        ...prev,
        label: '',
        notes: '',
        content: result.systemPrompt.content,
      }));
      setHasEditedSystemPrompt(false);
      setSelectedSystemPromptId(result.systemPrompt.id);
    },
    onError: (error) => {
      toast({
        title: 'Failed to save system prompt',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-system-prompts'] });
    },
  });

  const systemPromptActivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('PATCH', `/api/admin/system-prompts/${id}`, { activate: true });
      return response.json() as Promise<AdminSystemPromptMutationResponse>;
    },
    onMutate: (id) => {
      setActivatingPromptId(id);
    },
    onSuccess: (result) => {
      queryClient.setQueryData<AdminSystemPromptListResponse | undefined>(['admin-system-prompts'], {
        systemPrompts: result.systemPrompts,
        activeSystemPromptId: result.activeSystemPromptId,
      });
      toast({
        title: 'System prompt activated',
        description: `Version ${result.systemPrompt.version} is now live for all new chats.`,
      });
      setSystemPromptDraft((prev) => ({
        ...prev,
        content: result.systemPrompt.content,
      }));
      setHasEditedSystemPrompt(false);
      setSelectedSystemPromptId(result.systemPrompt.id);
    },
    onError: (error) => {
      toast({
        title: 'Failed to activate system prompt',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setActivatingPromptId(null);
      queryClient.invalidateQueries({ queryKey: ['admin-system-prompts'] });
    },
  });

  const isSavingSystemPrompt = systemPromptCreateMutation.isPending;
  const isActivatingSystemPrompt = systemPromptActivateMutation.isPending;

  if (systemPromptsQuery.isError) {
    const { title, description } = parseQueryError(systemPromptsQuery.error);
    return (
      <div className="flex h-full flex-1 items-center justify-center px-4 py-6 sm:px-6">
        <Card className="w-full max-w-xl" data-testid="card-system-prompts-error">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => systemPromptsQuery.refetch()}
              disabled={systemPromptsQuery.isRefetching}
            >
              {systemPromptsQuery.isRefetching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Retrying...
                </>
              ) : (
                'Retry'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (systemPromptsQuery.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center" data-testid="loading-system-prompts">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <Card data-testid="card-system-prompts">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ListChecks className="h-4 w-4 text-primary" />
                  System prompt manager
                </CardTitle>
                <CardDescription>
                  Manage prompt versions, track active configuration, and deploy updates across the platform.
                </CardDescription>
              </div>
              {isViewOnly && (
                <Badge variant="secondary" className="shrink-0" data-testid="badge-view-only">
                  View Only
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {isViewOnly && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950" data-testid="message-view-only">
                <p className="text-sm text-amber-900 dark:text-amber-100">
                  You have view-only access to system prompts. Only Super Admins can edit and activate prompts.
                </p>
              </div>
            )}
            
            {activeSystemPrompt && (
              <div className="rounded-lg border bg-muted/40 p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Active system prompt</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {activeSystemPrompt.label ? activeSystemPrompt.label : `Version ${activeSystemPrompt.version}`}
                      </span>
                      <Badge>Active</Badge>
                      <span className="text-xs text-muted-foreground">
                        v{activeSystemPrompt.version} • Activated {activeSystemPrompt.activatedAt ? new Date(activeSystemPrompt.activatedAt).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                    {activeSystemPrompt.notes && (
                      <p className="text-xs text-muted-foreground">{activeSystemPrompt.notes}</p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    onClick={() => {
                      setSystemPromptDraft({
                        label: activeSystemPrompt.label ?? '',
                        notes: activeSystemPrompt.notes ?? '',
                        content: activeSystemPrompt.content,
                      });
                      setSelectedSystemPromptId(activeSystemPrompt.id);
                      setHasEditedSystemPrompt(false);
                    }}
                    disabled={isViewOnly}
                    data-testid="button-load-active-prompt"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                </div>
              </div>
            )}

            <Separator />

            <div className="space-y-4">
              <div className="space-y-3">
                <Label htmlFor="system-prompt-label">Version label (optional)</Label>
                <Input
                  id="system-prompt-label"
                  type="text"
                  placeholder="e.g., 'Enhanced reasoning for v2.4'"
                  value={systemPromptDraft.label}
                  onChange={(event) => {
                    setSystemPromptDraft((current) => ({ ...current, label: event.target.value }));
                    setHasEditedSystemPrompt(true);
                  }}
                  disabled={isViewOnly}
                  data-testid="input-system-prompt-label"
                />
                <p className="text-xs text-muted-foreground">Assign a human-friendly label to this version.</p>
              </div>

              <div className="space-y-3">
                <Label htmlFor="system-prompt-notes">Change notes (optional)</Label>
                <Textarea
                  id="system-prompt-notes"
                  placeholder="What changed in this version?"
                  value={systemPromptDraft.notes}
                  onChange={(event) => {
                    setSystemPromptDraft((current) => ({ ...current, notes: event.target.value }));
                    setHasEditedSystemPrompt(true);
                  }}
                  className="min-h-[64px]"
                  disabled={isViewOnly}
                  data-testid="input-system-prompt-notes"
                />
                <p className="text-xs text-muted-foreground">Document changes for team visibility.</p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="system-prompt-content">System prompt content</Label>
                  <Badge variant="outline">Version {nextSystemPromptVersion}</Badge>
                </div>
                <Textarea
                  id="system-prompt-content"
                  value={systemPromptDraft.content}
                  onChange={(event) => {
                    setSystemPromptDraft((current) => ({ ...current, content: event.target.value }));
                    setHasEditedSystemPrompt(true);
                  }}
                  className="min-h-[240px] font-mono text-xs"
                  disabled={isViewOnly}
                  data-testid="input-system-prompt-content"
                />
                <p className="text-xs text-muted-foreground">The active prompt is automatically loaded when the page opens.</p>
              </div>

              {!isViewOnly && (
                <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">Activate immediately</p>
                    <p className="text-xs text-muted-foreground">Make this version live upon save</p>
                  </div>
                  <Switch
                    checked={activateOnSave}
                    onCheckedChange={setActivateOnSave}
                    data-testid="switch-activate-on-save"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  onClick={() => systemPromptCreateMutation.mutate({ activate: activateOnSave })}
                  disabled={isSavingSystemPrompt || !hasEditedSystemPrompt || isViewOnly}
                  className="gap-2"
                  data-testid="button-save-system-prompt"
                >
                  {isSavingSystemPrompt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {activateOnSave ? 'Save & activate' : 'Save as draft'}
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h3 className="text-sm font-medium">Prompt history</h3>
              {systemPrompts.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No system prompts created yet. Define your first version above.
                </p>
              ) : (
                <ScrollArea className="h-[300px] pr-3">
                  <div className="space-y-2">
                    {systemPrompts.map((prompt) => {
                      const isPending = activatingPromptId === prompt.id && isActivatingSystemPrompt;
                      return (
                        <div
                          key={prompt.id}
                          className={`rounded-lg border p-3 ${prompt.isActive ? 'border-primary/60 bg-primary/10' : 'border-border'}`}
                          data-testid={`prompt-version-${prompt.version}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium leading-none">
                                  {prompt.label ? prompt.label : `Version ${prompt.version}`}
                                </span>
                                {prompt.isActive && <Badge>Active</Badge>}
                                <span className="text-xs text-muted-foreground">v{prompt.version}</span>
                              </div>
                              {prompt.notes && <p className="text-xs text-muted-foreground">{prompt.notes}</p>}
                              <p className="text-xs text-muted-foreground">
                                Created {prompt.createdAt ? new Date(prompt.createdAt).toLocaleString() : '—'}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSystemPromptDraft({
                                    label: prompt.label ?? '',
                                    notes: prompt.notes ?? '',
                                    content: prompt.content,
                                  });
                                  setSelectedSystemPromptId(prompt.id);
                                  setHasEditedSystemPrompt(false);
                                }}
                                disabled={isViewOnly}
                                data-testid={`button-edit-prompt-${prompt.version}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {!prompt.isActive && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => systemPromptActivateMutation.mutate(prompt.id)}
                                  disabled={isActivatingSystemPrompt || isViewOnly}
                                  className="gap-2"
                                  data-testid={`button-activate-prompt-${prompt.version}`}
                                >
                                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                  Activate
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

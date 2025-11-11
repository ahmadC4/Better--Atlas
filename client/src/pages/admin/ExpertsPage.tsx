import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Shield, Loader2, Save, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/queryClient';
import type { AdminExpert, AdminExpertsResponse } from './types';
import { useAdminLayout } from '@/components/AdminLayout';
import { getAdminRouteById } from '@shared/adminRoutes';

export default function ExpertsPage() {
  const { setHeader, resetHeader } = useAdminLayout();
  const routeMeta = getAdminRouteById('expert-library');
  useEffect(() => {
    setHeader({ title: routeMeta.pageHeader?.title ?? routeMeta.label, description: routeMeta.pageHeader?.description });
    return () => resetHeader();
  }, [setHeader, resetHeader]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin, isLoading: isAuthLoading } = useAuth();
  const [, setLocation] = useLocation();

  const expertsQuery = useQuery<AdminExpertsResponse>({
    queryKey: ['admin-experts'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/experts');
      return response.json();
    },
    enabled: isAdmin,
  });

  const [expertForm, setExpertForm] = useState({
    name: '',
    description: '',
    promptContent: '',
    isActive: true,
  });
  const [editingExpertId, setEditingExpertId] = useState<string | null>(null);
  const [deletingExpertId, setDeletingExpertId] = useState<string | null>(null);

  const experts = expertsQuery.data?.experts ?? [];

  useEffect(() => {
    if (!isAuthLoading && !isAdmin) {
      setLocation('/');
    }
  }, [isAdmin, isAuthLoading, setLocation]);

  const expertCreateMutation = useMutation({
    mutationFn: async (payload: { name: string; description: string; promptContent: string; isActive: boolean }) => {
      const response = await apiRequest('POST', '/api/admin/experts', payload);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error ?? 'Failed to create expert');
      }
      return response.json() as Promise<{ expert: AdminExpert }>;
    },
    onSuccess: (result) => {
      queryClient.setQueryData<AdminExpertsResponse | undefined>(['admin-experts'], (current) => {
        if (!current) {
          return { experts: [result.expert] };
        }
        return { experts: [result.expert, ...current.experts] };
      });
      setExpertForm({ name: '', description: '', promptContent: '', isActive: true });
      toast({
        title: 'Expert created',
        description: `${result.expert.name} is now available to users.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to create expert',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-experts'] });
    },
  });

  const expertUpdateMutation = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<{ name: string; description: string | null; promptContent: string; isActive: boolean }>;
    }) => {
      const response = await apiRequest('PATCH', `/api/admin/experts/${id}`, updates);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error ?? 'Failed to update expert');
      }
      return response.json() as Promise<{ expert: AdminExpert }>;
    },
    onSuccess: (result) => {
      queryClient.setQueryData<AdminExpertsResponse | undefined>(['admin-experts'], (current) => {
        if (!current) {
          return { experts: [result.expert] };
        }
        return {
          experts: current.experts.map((expert) => (expert.id === result.expert.id ? result.expert : expert)),
        };
      });
      setExpertForm({ name: '', description: '', promptContent: '', isActive: true });
      setEditingExpertId(null);
      toast({
        title: 'Expert updated',
        description: `${result.expert.name} has been updated successfully.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to update expert',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-experts'] });
    },
  });

  const expertDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/admin/experts/${id}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error ?? 'Failed to delete expert');
      }
      return response.json() as Promise<{ success: boolean }>;
    },
    onMutate: (id) => {
      setDeletingExpertId(id);
    },
    onSuccess: (_result, id) => {
      queryClient.setQueryData<AdminExpertsResponse | undefined>(['admin-experts'], (current) => {
        if (!current) {
          return { experts: [] };
        }
        return {
          experts: current.experts.filter((expert) => expert.id !== id),
        };
      });
      toast({
        title: 'Expert removed',
        description: 'Expert deleted successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to delete expert',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setDeletingExpertId(null);
      queryClient.invalidateQueries({ queryKey: ['admin-experts'] });
    },
  });

  if (expertsQuery.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center" data-testid="loading-experts">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <Card data-testid="card-experts">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-4 w-4 text-primary" />
              Expert Library
            </CardTitle>
            <CardDescription>Create AI experts with custom prompts that users can select.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="expert-name">Expert name</Label>
                  <Input
                    id="expert-name"
                    type="text"
                    placeholder="e.g., Code Reviewer, Creative Writer"
                    value={expertForm.name}
                    onChange={(e) => setExpertForm((current) => ({ ...current, name: e.target.value }))}
                    data-testid="input-expert-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expert-description">Description (optional)</Label>
                  <Input
                    id="expert-description"
                    type="text"
                    placeholder="Brief description of the expert's role"
                    value={expertForm.description}
                    onChange={(e) => setExpertForm((current) => ({ ...current, description: e.target.value }))}
                    data-testid="input-expert-description"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="expert-prompt">Expert prompt</Label>
                <Textarea
                  id="expert-prompt"
                  placeholder="Define the expert's personality, expertise, and response style..."
                  value={expertForm.promptContent}
                  onChange={(e) => setExpertForm((current) => ({ ...current, promptContent: e.target.value }))}
                  rows={6}
                  className="resize-none font-mono text-xs"
                  data-testid="input-expert-prompt"
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">Active</p>
                  <p className="text-xs text-muted-foreground">Make expert available to users</p>
                </div>
                <Switch
                  checked={expertForm.isActive}
                  onCheckedChange={(checked) => setExpertForm((current) => ({ ...current, isActive: checked }))}
                  data-testid="switch-expert-active"
                />
              </div>
              <div className="flex justify-end gap-2">
                {editingExpertId && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setExpertForm({ name: '', description: '', promptContent: '', isActive: true });
                      setEditingExpertId(null);
                    }}
                    data-testid="button-cancel-expert"
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={() => {
                    if (!expertForm.name.trim()) {
                      toast({
                        title: 'Expert name required',
                        description: 'Give your expert a clear name.',
                        variant: 'destructive',
                      });
                      return;
                    }
                    if (!expertForm.promptContent.trim()) {
                      toast({
                        title: 'Expert prompt required',
                        description: 'Define the expert prompt before saving.',
                        variant: 'destructive',
                      });
                      return;
                    }
                    
                    if (editingExpertId) {
                      expertUpdateMutation.mutate({
                        id: editingExpertId,
                        updates: {
                          name: expertForm.name.trim(),
                          description: expertForm.description.trim() || null,
                          promptContent: expertForm.promptContent.trim(),
                          isActive: expertForm.isActive,
                        },
                      });
                    } else {
                      expertCreateMutation.mutate({
                        name: expertForm.name.trim(),
                        description: expertForm.description.trim() || '',
                        promptContent: expertForm.promptContent.trim(),
                        isActive: expertForm.isActive,
                      });
                    }
                  }}
                  disabled={expertCreateMutation.isPending || expertUpdateMutation.isPending}
                  className="gap-2"
                  data-testid={editingExpertId ? "button-update-expert" : "button-create-expert"}
                >
                  {(expertCreateMutation.isPending || expertUpdateMutation.isPending) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {editingExpertId ? 'Update expert' : 'Create expert'}
                </Button>
              </div>
            </div>

            <Separator />

            {expertsQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : experts.length > 0 ? (
              <div className="space-y-3">
                {experts.map((expert) => {
                  const isDeleting = deletingExpertId === expert.id && expertDeleteMutation.isPending;
                  return (
                    <div key={expert.id} className="space-y-3 rounded-lg border bg-card p-3" data-testid={`expert-${expert.id}`}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1 flex-1">
                          <p className="text-sm font-medium leading-none">{expert.name}</p>
                          {expert.description && (
                            <p className="text-xs text-muted-foreground">{expert.description}</p>
                          )}
                          <p className="text-xs text-muted-foreground font-mono line-clamp-2">
                            {expert.promptContent}
                          </p>
                        </div>
                        <Badge variant={expert.isActive ? 'default' : 'secondary'}>
                          {expert.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="gap-1"
                          onClick={() => {
                            setExpertForm({
                              name: expert.name,
                              description: expert.description || '',
                              promptContent: expert.promptContent,
                              isActive: expert.isActive,
                            });
                            setEditingExpertId(expert.id);
                          }}
                          data-testid={`button-edit-expert-${expert.id}`}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-destructive hover:text-destructive"
                          disabled={isDeleting}
                          onClick={() => expertDeleteMutation.mutate(expert.id)}
                          data-testid={`button-delete-expert-${expert.id}`}
                        >
                          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No experts created yet. Create your first expert above.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

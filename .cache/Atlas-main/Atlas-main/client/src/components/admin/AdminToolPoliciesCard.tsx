import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  TOOL_POLICY_PROVIDERS,
  toolPolicyCreateSchema,
  toolPolicyResponseSchema,
  type ToolPolicyProvider,
} from '@shared/schema';

const toolPoliciesResponseSchema = z.object({
  toolPolicies: z.array(toolPolicyResponseSchema),
});

const toolPolicyFormSchema = toolPolicyCreateSchema.extend({
  safetyNote: z
    .string()
    .max(1000, 'Safety note must be 1000 characters or less')
    .optional(),
});

type ToolPolicyResponse = z.infer<typeof toolPolicyResponseSchema>;

type ToolPolicyFormValues = z.infer<typeof toolPolicyFormSchema>;

const providerLabels: Record<ToolPolicyProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  groq: 'Groq',
  perplexity: 'Perplexity',
};

const defaultFormValues: ToolPolicyFormValues = {
  provider: 'openai',
  toolName: '',
  isEnabled: true,
  safetyNote: '',
};

const toolPoliciesQueryKey = ['admin-tool-policies'] as const;

const getErrorDescription = (error: unknown, fallback: string): string => {
  if (error instanceof Error) {
    const [, ...rest] = error.message.split(': ');
    if (rest.length > 0) {
      return rest.join(': ').trim();
    }
    return error.message;
  }
  return fallback;
};

const sanitizeFormValues = (values: ToolPolicyFormValues) => ({
  provider: values.provider,
  toolName: values.toolName.trim(),
  isEnabled: values.isEnabled,
  safetyNote: values.safetyNote?.trim() ? values.safetyNote.trim() : null,
});

interface AdminToolPoliciesCardProps {
  isViewOnly?: boolean;
}

const AdminToolPoliciesCard = ({ isViewOnly = false }: AdminToolPoliciesCardProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<ToolPolicyResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ToolPolicyResponse | null>(null);

  const createForm = useForm<ToolPolicyFormValues>({
    resolver: zodResolver(toolPolicyFormSchema),
    defaultValues: defaultFormValues,
  });

  const editForm = useForm<ToolPolicyFormValues>({
    resolver: zodResolver(toolPolicyFormSchema),
    defaultValues: defaultFormValues,
  });

  useEffect(() => {
    if (editingPolicy) {
      editForm.reset({
        provider: editingPolicy.provider as ToolPolicyProvider,
        toolName: editingPolicy.toolName,
        isEnabled: editingPolicy.isEnabled,
        safetyNote: editingPolicy.safetyNote ?? '',
      });
    }
  }, [editingPolicy, editForm]);

  const toolPoliciesQuery = useQuery({
    queryKey: toolPoliciesQueryKey,
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/tool-policies');
      const data = await response.json();
      return toolPoliciesResponseSchema.parse(data);
    },
  });

  const toolPolicies = useMemo(
    () => toolPoliciesQuery.data?.toolPolicies ?? [],
    [toolPoliciesQuery.data],
  );

  const sortedPolicies = useMemo(
    () =>
      toolPolicies
        .slice()
        .sort(
          (a, b) =>
            a.provider.localeCompare(b.provider) || a.toolName.localeCompare(b.toolName),
        ),
    [toolPolicies],
  );

  const invalidatePolicies = () =>
    queryClient.invalidateQueries({ queryKey: toolPoliciesQueryKey });

  const createPolicyMutation = useMutation({
    mutationFn: async (values: ToolPolicyFormValues) => {
      const payload = sanitizeFormValues(values);
      const response = await apiRequest('POST', '/api/admin/tool-policies', payload);
      return response.json() as Promise<{ toolPolicy: ToolPolicyResponse }>;
    },
    onSuccess: () => {
      invalidatePolicies();
      setCreateOpen(false);
      createForm.reset(defaultFormValues);
      toast({
        title: 'Tool policy created',
        description: 'The provider configuration has been saved.',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Failed to create tool policy',
        description: getErrorDescription(error, 'Unable to create tool policy'),
        variant: 'destructive',
      });
    },
  });

  const updatePolicyMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: ToolPolicyFormValues }) => {
      const payload = sanitizeFormValues(values);
      const response = await apiRequest('PATCH', `/api/admin/tool-policies/${id}`, payload);
      return response.json() as Promise<{ toolPolicy: ToolPolicyResponse }>;
    },
    onSuccess: () => {
      invalidatePolicies();
      setEditingPolicy(null);
      toast({ title: 'Tool policy updated', description: 'Changes saved successfully.' });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Failed to update tool policy',
        description: getErrorDescription(error, 'Unable to update tool policy'),
        variant: 'destructive',
      });
    },
  });

  const deletePolicyMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/admin/tool-policies/${id}`);
    },
    onSuccess: () => {
      invalidatePolicies();
      setDeleteTarget(null);
      toast({ title: 'Tool policy removed', description: 'The policy is no longer active.' });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Failed to delete tool policy',
        description: getErrorDescription(error, 'Unable to delete tool policy'),
        variant: 'destructive',
      });
    },
  });

  const handleCreateSubmit = createForm.handleSubmit((values) => {
    createPolicyMutation.mutate(values);
  });

  const handleUpdateSubmit = editForm.handleSubmit((values) => {
    if (!editingPolicy) {
      return;
    }
    updatePolicyMutation.mutate({ id: editingPolicy.id, values });
  });

  const isLoading = toolPoliciesQuery.isLoading;
  const isEmpty = !isLoading && sortedPolicies.length === 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Tool policies</CardTitle>
          <CardDescription>
            Control which tools are available for each provider and share safety guidance with models.
          </CardDescription>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm" disabled={isViewOnly} data-testid="button-add-tool-policy">
          Add tool policy
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isViewOnly && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950" data-testid="message-view-only">
            <p className="text-sm text-amber-900 dark:text-amber-100">
              You have view-only access to tool policies. Only Super Admins can create, edit, and delete policies.
            </p>
          </div>
        )}
        
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading tool policies…</p>
        ) : isEmpty ? (
          <p className="text-sm text-muted-foreground">No tool policies configured yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Tool</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Safety note</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPolicies.map((policy) => (
                <TableRow key={policy.id}>
                  <TableCell className="font-medium">{providerLabels[policy.provider as ToolPolicyProvider] ?? policy.provider}</TableCell>
                  <TableCell>{policy.toolName}</TableCell>
                  <TableCell>
                    <Badge variant={policy.isEnabled ? 'default' : 'secondary'}>
                      {policy.isEnabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md whitespace-pre-line text-sm text-muted-foreground">
                    {policy.safetyNote ? policy.safetyNote : '—'}
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingPolicy(policy)}
                      disabled={updatePolicyMutation.isPending || deletePolicyMutation.isPending || isViewOnly}
                      data-testid={`button-edit-policy-${policy.id}`}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setDeleteTarget(policy)}
                      disabled={deletePolicyMutation.isPending || updatePolicyMutation.isPending || isViewOnly}
                      data-testid={`button-delete-policy-${policy.id}`}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={(open) => {
        setCreateOpen(open);
        if (!open) {
          createForm.reset(defaultFormValues);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create tool policy</DialogTitle>
            <DialogDescription>
              Choose the provider and tool you want to manage and optionally include a safety reminder.
            </DialogDescription>
          </DialogHeader>
          <Form {...createForm}>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <FormField
                control={createForm.control}
                name="provider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provider</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select provider" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TOOL_POLICY_PROVIDERS.map((provider) => (
                          <SelectItem key={provider} value={provider}>
                            {providerLabels[provider]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="toolName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tool identifier</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. web_search" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="isEnabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between space-x-2 rounded-md border p-3">
                    <div className="space-y-1">
                      <FormLabel>Tool enabled</FormLabel>
                      <DialogDescription>
                        Toggle to allow or block this tool for the selected provider.
                      </DialogDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="safetyNote"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Safety note</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Optional guidance shared with the model (1000 characters max)"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                  disabled={createPolicyMutation.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createPolicyMutation.isPending}>
                  {createPolicyMutation.isPending ? 'Saving…' : 'Save policy'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingPolicy)} onOpenChange={(open) => {
        if (!open) {
          setEditingPolicy(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit tool policy</DialogTitle>
            <DialogDescription>
              Update availability and safety notes for this tool.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={handleUpdateSubmit} className="space-y-4">
              <FormField
                control={editForm.control}
                name="provider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provider</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select provider" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TOOL_POLICY_PROVIDERS.map((provider) => (
                          <SelectItem key={provider} value={provider}>
                            {providerLabels[provider]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="toolName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tool identifier</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="isEnabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between space-x-2 rounded-md border p-3">
                    <div className="space-y-1">
                      <FormLabel>Tool enabled</FormLabel>
                      <DialogDescription>
                        Toggle to allow or block this tool for the selected provider.
                      </DialogDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="safetyNote"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Safety note</FormLabel>
                    <FormControl>
                      <Textarea rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingPolicy(null)}
                  disabled={updatePolicyMutation.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updatePolicyMutation.isPending}>
                  {updatePolicyMutation.isPending ? 'Saving…' : 'Save changes'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => {
        if (!open) {
          setDeleteTarget(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tool policy</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the policy for
              {' '}
              <strong>
                {deleteTarget
                  ? `${providerLabels[deleteTarget.provider as ToolPolicyProvider] ?? deleteTarget.provider} → ${deleteTarget.toolName}`
                  : ''}
              </strong>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePolicyMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) {
                  deletePolicyMutation.mutate(deleteTarget.id);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletePolicyMutation.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default AdminToolPoliciesCard;

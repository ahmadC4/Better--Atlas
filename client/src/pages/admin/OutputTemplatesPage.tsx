import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Plus, Loader2, Save, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/queryClient';
import type { AdminOutputTemplate, AdminOutputTemplatesResponse } from './types';
import { getOutputTemplateCategoryLabel, getOutputTemplateFormatLabel } from './utils';

export default function OutputTemplatesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin, isLoading: isAuthLoading } = useAuth();
  const [, setLocation] = useLocation();

  const outputTemplatesQuery = useQuery<AdminOutputTemplatesResponse>({
    queryKey: ['admin-output-templates'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/output-templates');
      return response.json();
    },
    enabled: isAdmin,
  });

  const [outputTemplateForm, setOutputTemplateForm] = useState<{
    id?: string;
    name: string;
    category: string;
    format: string;
    description: string;
    instructions: string;
    sections: Array<{ key: string; title: string; description: string }>;
    isActive: boolean;
  } | null>(null);
  const [outputTemplateFormMode, setOutputTemplateFormMode] = useState<'create' | 'edit' | null>(null);
  const [pendingOutputTemplateId, setPendingOutputTemplateId] = useState<string | null>(null);
  const [deletingOutputTemplateId, setDeletingOutputTemplateId] = useState<string | null>(null);

  const outputTemplates = outputTemplatesQuery.data?.templates ?? [];

  const defaultOutputTemplateForm = {
    name: '',
    category: 'how_to',
    format: 'markdown',
    description: '',
    instructions: '',
    sections: [{ key: '', title: '', description: '' }],
    isActive: true,
  };

  const mapOutputTemplateToForm = (template: AdminOutputTemplate) => ({
    id: template.id,
    name: template.name,
    category: template.category,
    format: template.format,
    description: template.description ?? '',
    instructions: template.instructions ?? '',
    sections: template.requiredSections.map((section) => ({
      key: section.key,
      title: section.title,
      description: section.description ?? '',
    })),
    isActive: template.isActive,
  });

  const handleOpenCreateOutputTemplate = () => {
    setOutputTemplateForm(structuredClone(defaultOutputTemplateForm));
    setOutputTemplateFormMode('create');
  };

  const handleEditOutputTemplate = (template: AdminOutputTemplate) => {
    setOutputTemplateForm(mapOutputTemplateToForm(template));
    setOutputTemplateFormMode('edit');
  };

  const handleCancelOutputTemplateForm = () => {
    setOutputTemplateForm(null);
    setOutputTemplateFormMode(null);
    setPendingOutputTemplateId(null);
  };

  const updateOutputTemplateSection = (index: number, field: 'key' | 'title' | 'description', value: string) => {
    setOutputTemplateForm((current) => {
      if (!current) return current;
      const sections = current.sections.map((section, idx) =>
        idx === index ? { ...section, [field]: value } : section,
      );
      return { ...current, sections };
    });
  };

  const addOutputTemplateSection = () => {
    setOutputTemplateForm((current) => {
      if (!current) return current;
      return {
        ...current,
        sections: [...current.sections, { key: '', title: '', description: '' }],
      };
    });
  };

  const removeOutputTemplateSection = (index: number) => {
    setOutputTemplateForm((current) => {
      if (!current) return current;
      if (current.sections.length <= 1) {
        return current;
      }
      return {
        ...current,
        sections: current.sections.filter((_, idx) => idx !== index),
      };
    });
  };

  const handleSubmitOutputTemplateForm = () => {
    if (!outputTemplateForm) {
      return;
    }
    const trimmed = {
      ...outputTemplateForm,
      sections: outputTemplateForm.sections.map((section) => ({
        key: section.key.trim(),
        title: section.title.trim(),
        description: section.description,
      })),
    };

    const hasEmptyFields = trimmed.name.trim() === ''
      || trimmed.sections.some((section) => !section.key || !section.title);

    if (hasEmptyFields) {
      toast({
        title: 'Missing details',
        description: 'Name, section keys, and titles are required.',
        variant: 'destructive',
      });
      return;
    }

    if (outputTemplateFormMode === 'edit' && trimmed.id) {
      outputTemplateUpdateMutation.mutate({ id: trimmed.id, updates: trimmed });
    } else if (outputTemplateFormMode === 'create') {
      outputTemplateCreateMutation.mutate(trimmed);
    }
  };

  useEffect(() => {
    if (!isAuthLoading && !isAdmin) {
      setLocation('/');
    }
  }, [isAdmin, isAuthLoading, setLocation]);

  const outputTemplateCreateMutation = useMutation({
    mutationFn: async (form: NonNullable<typeof outputTemplateForm>) => {
      const response = await apiRequest('POST', '/api/admin/output-templates', {
        name: form.name.trim(),
        category: form.category,
        format: form.format,
        description: form.description.trim() || null,
        instructions: form.instructions.trim() || null,
        requiredSections: form.sections.map((section) => ({
          key: section.key.trim(),
          title: section.title.trim(),
          description: section.description.trim() ? section.description.trim() : null,
        })),
        isActive: form.isActive,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error ?? 'Failed to create output template');
      }
      return response.json() as Promise<{ template: AdminOutputTemplate }>;
    },
    onSuccess: (result) => {
      queryClient.setQueryData<AdminOutputTemplatesResponse | undefined>(['admin-output-templates'], (current) => {
        if (!current) {
          return { templates: [result.template] };
        }
        return { templates: [result.template, ...current.templates] };
      });
      toast({
        title: 'Output template created',
        description: `${result.template.name} is now available.`,
      });
      handleCancelOutputTemplateForm();
    },
    onError: (error) => {
      toast({
        title: 'Failed to create output template',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-output-templates'] });
    },
  });

  const outputTemplateUpdateMutation = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<NonNullable<typeof outputTemplateForm>>;
    }) => {
      const body: Record<string, unknown> = {};
      if (updates.name !== undefined) {
        body.name = updates.name.trim();
      }
      if (updates.category !== undefined) {
        body.category = updates.category;
      }
      if (updates.format !== undefined) {
        body.format = updates.format;
      }
      if (updates.description !== undefined) {
        body.description = updates.description.trim() || null;
      }
      if (updates.instructions !== undefined) {
        body.instructions = updates.instructions.trim() || null;
      }
      if (updates.sections !== undefined) {
        body.requiredSections = updates.sections.map((section) => ({
          key: section.key.trim(),
          title: section.title.trim(),
          description: section.description.trim() ? section.description.trim() : null,
        }));
      }
      if (updates.isActive !== undefined) {
        body.isActive = updates.isActive;
      }

      const response = await apiRequest('PATCH', `/api/admin/output-templates/${id}`, body);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error ?? 'Failed to update output template');
      }
      return response.json() as Promise<{ template: AdminOutputTemplate }>;
    },
    onMutate: ({ id }) => {
      setPendingOutputTemplateId(id);
    },
    onSuccess: (result) => {
      queryClient.setQueryData<AdminOutputTemplatesResponse | undefined>(['admin-output-templates'], (current) => {
        if (!current) {
          return { templates: [result.template] };
        }
        return {
          templates: current.templates.map((template) =>
            template.id === result.template.id ? result.template : template,
          ),
        };
      });
      toast({
        title: 'Output template updated',
        description: `${result.template.name} settings saved.`,
      });
      if (outputTemplateFormMode === 'edit' && outputTemplateForm?.id === result.template.id) {
        handleCancelOutputTemplateForm();
      }
    },
    onError: (error) => {
      toast({
        title: 'Failed to update output template',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setPendingOutputTemplateId(null);
      queryClient.invalidateQueries({ queryKey: ['admin-output-templates'] });
    },
  });

  const outputTemplateDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/admin/output-templates/${id}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error ?? 'Failed to delete output template');
      }
      return response.json() as Promise<{ success: boolean }>;
    },
    onMutate: (id) => {
      setDeletingOutputTemplateId(id);
    },
    onSuccess: (_result, id) => {
      queryClient.setQueryData<AdminOutputTemplatesResponse | undefined>(['admin-output-templates'], (current) => {
        if (!current) {
          return { templates: [] };
        }
        return {
          templates: current.templates.filter((template) => template.id !== id),
        };
      });
      toast({
        title: 'Output template removed',
        description: 'Template deleted successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to delete output template',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setDeletingOutputTemplateId(null);
      queryClient.invalidateQueries({ queryKey: ['admin-output-templates'] });
    },
  });

  if (outputTemplatesQuery.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center" data-testid="loading-output-templates">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <Card data-testid="card-output-templates">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Output templates</CardTitle>
                <CardDescription>Define structured formats for the AI to follow when generating responses.</CardDescription>
              </div>
              {!outputTemplateForm && (
                <Button
                  type="button"
                  onClick={handleOpenCreateOutputTemplate}
                  className="gap-2"
                  data-testid="button-create-output-template"
                >
                  <Plus className="h-4 w-4" />
                  New template
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {outputTemplateForm && (
              <div className="space-y-4 rounded-lg border border-dashed p-4">
                <h3 className="text-sm font-medium">
                  {outputTemplateFormMode === 'edit' ? 'Edit output template' : 'Create new output template'}
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="output-template-name">Template name</Label>
                    <Input
                      id="output-template-name"
                      value={outputTemplateForm.name}
                      onChange={(e) => setOutputTemplateForm((current) => current && { ...current, name: e.target.value })}
                      placeholder="Executive briefing"
                      data-testid="input-output-template-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="output-template-category">Category</Label>
                    <Select
                      value={outputTemplateForm.category}
                      onValueChange={(value) => setOutputTemplateForm((current) => current && { ...current, category: value })}
                    >
                      <SelectTrigger id="output-template-category" data-testid="select-output-template-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="how_to">How-To</SelectItem>
                        <SelectItem value="executive_brief">Executive Brief</SelectItem>
                        <SelectItem value="json_report">JSON</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="output-template-format">Output format</Label>
                    <Select
                      value={outputTemplateForm.format}
                      onValueChange={(value) => setOutputTemplateForm((current) => current && { ...current, format: value })}
                    >
                      <SelectTrigger id="output-template-format" data-testid="select-output-template-format">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="markdown">Markdown</SelectItem>
                        <SelectItem value="json">JSON</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <div className="flex w-full items-center justify-between rounded-lg border bg-muted/40 p-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium leading-none">Active</p>
                        <p className="text-xs text-muted-foreground">Make available to users</p>
                      </div>
                      <Switch
                        checked={outputTemplateForm.isActive}
                        onCheckedChange={(checked) =>
                          setOutputTemplateForm((current) => current && { ...current, isActive: checked })
                        }
                        data-testid="switch-output-template-active"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="output-template-description">Description (optional)</Label>
                  <Input
                    id="output-template-description"
                    value={outputTemplateForm.description}
                    onChange={(e) => setOutputTemplateForm((current) => current && { ...current, description: e.target.value })}
                    placeholder="Brief overview of when to use this template"
                    data-testid="input-output-template-description"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="output-template-instructions">Instructions for AI (optional)</Label>
                  <Textarea
                    id="output-template-instructions"
                    value={outputTemplateForm.instructions}
                    onChange={(e) => setOutputTemplateForm((current) => current && { ...current, instructions: e.target.value })}
                    placeholder="Additional guidelines for the AI when using this template"
                    className="min-h-[80px]"
                    data-testid="input-output-template-instructions"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Required sections</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addOutputTemplateSection}
                      disabled={outputTemplateCreateMutation.isPending || outputTemplateUpdateMutation.isPending}
                      className="gap-1"
                      data-testid="button-add-section"
                    >
                      <Plus className="h-4 w-4" />
                      Add section
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {outputTemplateForm.sections.map((section, index) => {
                      const isOnlySection = outputTemplateForm.sections.length === 1;
                      const isBusy = outputTemplateCreateMutation.isPending || outputTemplateUpdateMutation.isPending;
                      return (
                        <div key={index} className="space-y-3 rounded-lg border bg-background p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-xs font-semibold uppercase text-muted-foreground">Section {index + 1}</p>
                              <p className="text-[11px] text-muted-foreground/80">Provide a unique key and human-friendly title.</p>
                            </div>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => removeOutputTemplateSection(index)}
                              disabled={isOnlySection || isBusy}
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              aria-label="Remove section"
                              data-testid={`button-remove-section-${index}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label>Section key</Label>
                              <Input
                                value={section.key}
                                onChange={(event) => updateOutputTemplateSection(index, 'key', event.target.value)}
                                placeholder="summary"
                                disabled={isBusy}
                                data-testid={`input-section-key-${index}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Section title</Label>
                              <Input
                                value={section.title}
                                onChange={(event) => updateOutputTemplateSection(index, 'title', event.target.value)}
                                placeholder="Executive summary"
                                disabled={isBusy}
                                data-testid={`input-section-title-${index}`}
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label>Helper text</Label>
                            <Textarea
                              value={section.description}
                              onChange={(event) => updateOutputTemplateSection(index, 'description', event.target.value)}
                              placeholder="What should the assistant capture here?"
                              className="min-h-[64px]"
                              disabled={isBusy}
                              data-testid={`input-section-description-${index}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleCancelOutputTemplateForm}
                    disabled={outputTemplateCreateMutation.isPending || outputTemplateUpdateMutation.isPending}
                    data-testid="button-cancel-output-template"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSubmitOutputTemplateForm}
                    disabled={
                      outputTemplateCreateMutation.isPending
                      || (outputTemplateFormMode === 'edit'
                        && outputTemplateUpdateMutation.isPending
                        && pendingOutputTemplateId === outputTemplateForm.id)
                    }
                    className="gap-2"
                    data-testid="button-save-output-template"
                  >
                    {outputTemplateFormMode === 'edit'
                      ? pendingOutputTemplateId === outputTemplateForm.id && outputTemplateUpdateMutation.isPending
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Pencil className="h-4 w-4" />
                      : outputTemplateCreateMutation.isPending
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Save className="h-4 w-4" />}
                    {outputTemplateFormMode === 'edit' ? 'Save changes' : 'Create template'}
                  </Button>
                </div>
              </div>
            )}

            <Separator />

            {outputTemplatesQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : outputTemplates.length > 0 ? (
              <div className="space-y-3">
                {outputTemplates.map((template) => {
                  const isUpdating = pendingOutputTemplateId === template.id && outputTemplateUpdateMutation.isPending;
                  const isDeleting = deletingOutputTemplateId === template.id && outputTemplateDeleteMutation.isPending;
                  return (
                    <div key={template.id} className="space-y-3 rounded-lg border bg-card p-3" data-testid={`template-${template.id}`}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-medium leading-none">{template.name}</p>
                          {template.description && (
                            <p className="text-xs text-muted-foreground">{template.description}</p>
                          )}
                          {template.instructions && (
                            <p className="text-xs text-muted-foreground/80">Instructions: {template.instructions}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{getOutputTemplateCategoryLabel(template.category)}</Badge>
                          <Badge variant="outline">{getOutputTemplateFormatLabel(template.format)}</Badge>
                          <Badge variant={template.isActive ? 'default' : 'secondary'}>
                            {template.isActive ? 'Active' : 'Paused'}
                          </Badge>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold uppercase text-muted-foreground">Required sections</p>
                        <ul className="ml-4 list-disc space-y-1 text-xs">
                          {template.requiredSections.map((section) => (
                            <li key={section.key} className="text-muted-foreground">
                              <span className="font-medium text-foreground">{section.title}</span>
                              <span className="text-muted-foreground/70"> ({section.key})</span>
                              {section.description ? (
                                <span className="text-muted-foreground/80"> — {section.description}</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={template.isActive}
                            onCheckedChange={(checked) =>
                              outputTemplateUpdateMutation.mutate({
                                id: template.id,
                                updates: { isActive: checked },
                              })
                            }
                            disabled={isUpdating || isDeleting}
                            data-testid={`switch-template-active-${template.id}`}
                          />
                          <p className="text-xs text-muted-foreground">{template.isActive ? 'Template active' : 'Template paused'}</p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            onClick={() => handleEditOutputTemplate(template)}
                            disabled={isDeleting || isUpdating}
                            data-testid={`button-edit-template-${template.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-destructive hover:text-destructive"
                            disabled={isDeleting}
                            onClick={() => outputTemplateDeleteMutation.mutate(template.id)}
                            data-testid={`button-delete-template-${template.id}`}
                          >
                            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No output templates configured yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

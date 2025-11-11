import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Edit, Trash2, AlertTriangle, Settings, DollarSign, Shield, Database } from 'lucide-react';
import type { Plan } from '@/shared/schema';

type PlanBooleanKey =
  | 'allowExperts'
  | 'allowTemplates'
  | 'allowModels'
  | 'allowKbSystem'
  | 'allowKbOrg'
  | 'allowKbTeam'
  | 'allowKbUser'
  | 'allowMemory'
  | 'allowAgents'
  | 'allowApiAccess'
  | 'showExpertsUpsell'
  | 'showTemplatesUpsell'
  | 'showApiUpsell'
  | 'isActive';

type PlanNumericKey = 'dailyMessageLimit' | 'maxFileSizeMb' | 'storageQuotaGb';

interface PlanFormState {
  name: string;
  slug: string;
  description: string;
  tier: Plan['tier'];
  allowExperts: boolean;
  allowTemplates: boolean;
  allowModels: boolean;
  allowKbSystem: boolean;
  allowKbOrg: boolean;
  allowKbTeam: boolean;
  allowKbUser: boolean;
  allowMemory: boolean;
  allowAgents: boolean;
  allowApiAccess: boolean;
  showExpertsUpsell: boolean;
  showTemplatesUpsell: boolean;
  showApiUpsell: boolean;
  dailyMessageLimit: number | null;
  maxFileSizeMb: number | null;
  storageQuotaGb: number | null;
  modelsAllowed: string[];
  expertsAllowed: string[];
  templatesAllowed: string[];
  priceMonthlyUsd: number | null;
  priceAnnualUsd: number | null;
  isActive: boolean;
}

const DEFAULT_PLAN_FORM_STATE: PlanFormState = {
  name: '',
  slug: '',
  description: '',
  tier: 'custom',
  allowExperts: false,
  allowTemplates: false,
  allowModels: true,
  allowKbSystem: false,
  allowKbOrg: false,
  allowKbTeam: false,
  allowKbUser: true,
  allowMemory: true,
  allowAgents: false,
  allowApiAccess: false,
  showExpertsUpsell: true,
  showTemplatesUpsell: true,
  showApiUpsell: true,
  dailyMessageLimit: null,
  maxFileSizeMb: 10,
  storageQuotaGb: 1,
  modelsAllowed: [],
  expertsAllowed: [],
  templatesAllowed: [],
  priceMonthlyUsd: null,
  priceAnnualUsd: null,
  isActive: true,
};

const PLAN_TIER_OPTIONS = [
  { value: 'free', label: 'Free' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
  { value: 'custom', label: 'Custom' },
] as const;

const PLAN_TIER_VALUES = PLAN_TIER_OPTIONS.map((option) => option.value);

const normalizePlanTierInput = (value: string): Plan['tier'] => {
  const normalized = value.trim().toLowerCase();
  return (PLAN_TIER_VALUES as readonly string[]).includes(normalized)
    ? (normalized as Plan['tier'])
    : 'custom';
};

const FEATURE_FLAGS: Array<{ key: Extract<PlanBooleanKey, `allow${string}`>; label: string }> = [
  { key: 'allowExperts', label: 'Allow Experts' },
  { key: 'allowTemplates', label: 'Allow Templates' },
  { key: 'allowModels', label: 'Allow Models' },
  { key: 'allowKbSystem', label: 'Allow System Knowledge Base' },
  { key: 'allowKbOrg', label: 'Allow Organization Knowledge Base' },
  { key: 'allowKbTeam', label: 'Allow Team Knowledge Base' },
  { key: 'allowKbUser', label: 'Allow User Knowledge Base' },
  { key: 'allowMemory', label: 'Allow Memory' },
  { key: 'allowAgents', label: 'Allow Agents' },
  { key: 'allowApiAccess', label: 'Allow API Access' },
];

const UPSELL_FLAGS: Array<{ key: Extract<PlanBooleanKey, `show${string}`>; label: string }> = [
  { key: 'showExpertsUpsell', label: 'Show Experts Upsell' },
  { key: 'showTemplatesUpsell', label: 'Show Templates Upsell' },
  { key: 'showApiUpsell', label: 'Show API Upsell' },
];

function getInitialFormState(plan?: Plan | null): PlanFormState {
  if (!plan) {
    return { ...DEFAULT_PLAN_FORM_STATE };
  }

  return {
    ...DEFAULT_PLAN_FORM_STATE,
    ...plan,
    slug: plan.slug ?? '',
    tier: normalizePlanTierInput(plan.tier ?? 'custom'),
    description: plan.description ?? '',
    dailyMessageLimit: plan.dailyMessageLimit ?? null,
    maxFileSizeMb: plan.maxFileSizeMb ?? null,
    storageQuotaGb: plan.storageQuotaGb ?? null,
    modelsAllowed: plan.modelsAllowed ?? [],
    expertsAllowed: plan.expertsAllowed ?? [],
    templatesAllowed: plan.templatesAllowed ?? [],
    priceMonthlyUsd: plan.priceMonthlyUsd ?? null,
    priceAnnualUsd: plan.priceAnnualUsd ?? null,
  };
}

function formatUsd(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'Not set';
  }
  return `$${(value / 100).toFixed(2)}`;
}

export function PlansManagementPage() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [deleteConfirmPlan, setDeleteConfirmPlan] = useState<Plan | null>(null);

  // Fetch plans
  const { data: plans, isLoading, error } = useQuery({
    queryKey: ['/api/admin/plans'],
  });

  // Create plan mutation
  const createPlanMutation = useMutation({
    mutationFn: (data: Partial<Plan>) => apiRequest('POST', '/api/admin/plans', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/plans'] });
      setIsCreateOpen(false);
      toast({ title: 'Plan created successfully' });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to create plan',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    },
  });

  // Update plan mutation
  const updatePlanMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Plan> }) =>
      apiRequest('PATCH', `/api/admin/plans/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/plans'] });
      setEditingPlan(null);
      toast({ title: 'Plan updated successfully' });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to update plan',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    },
  });

  // Delete plan mutation
  const deletePlanMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/admin/plans/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/plans'] });
      setDeleteConfirmPlan(null);
      toast({ title: 'Plan deleted successfully' });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to delete plan',
        description: error.message || 'Plan may be in use by users',
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Failed to load plans. Please try again later.</AlertDescription>
      </Alert>
    );
  }

  const planFormKey = editingPlan ? `edit-${editingPlan.id}` : isCreateOpen ? 'create-open' : 'create-closed';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Plans Management</h1>
          <p className="text-muted-foreground">Create and manage subscription plans with feature flags and limits</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-plan">
          <Plus className="mr-2 h-4 w-4" />
          Create Plan
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {plans?.map((plan: Plan) => (
          <Card key={plan.id} data-testid={`card-plan-${plan.id}`}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{plan.name}</span>
                {plan.isActive && <Badge variant="secondary">Active</Badge>}
              </CardTitle>
              {plan.description && (
                <CardDescription>{plan.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Monthly Price:</span>
                  <span>{formatUsd(plan.priceMonthlyUsd)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Annual Price:</span>
                  <span>{formatUsd(plan.priceAnnualUsd)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Daily Message Limit:</span>
                  <span>{plan.dailyMessageLimit ?? 'Unlimited'}</span>
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingPlan(plan)}
                  data-testid={`button-edit-${plan.id}`}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteConfirmPlan(plan)}
                  data-testid={`button-delete-${plan.id}`}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create/Edit Plan Dialog */}
      <Dialog open={isCreateOpen || !!editingPlan} onOpenChange={(open) => {
        if (!open) {
          setIsCreateOpen(false);
          setEditingPlan(null);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPlan ? 'Edit Plan' : 'Create New Plan'}</DialogTitle>
            <DialogDescription>
              Configure plan features, limits, and pricing
            </DialogDescription>
          </DialogHeader>
          <PlanForm
            key={planFormKey}
            plan={editingPlan}
            onSubmit={(data) => {
              if (editingPlan) {
                updatePlanMutation.mutate({ id: editingPlan.id, data });
              } else {
                createPlanMutation.mutate(data);
              }
            }}
            isSubmitting={createPlanMutation.isPending || updatePlanMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmPlan} onOpenChange={(open) => !open && setDeleteConfirmPlan(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Plan</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the "{deleteConfirmPlan?.name}" plan? This action cannot be undone.
              Plans with active users cannot be deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteConfirmPlan(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmPlan && deletePlanMutation.mutate(deleteConfirmPlan.id)}
              disabled={deletePlanMutation.isPending}
            >
              {deletePlanMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Delete Plan
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface PlanFormProps {
  plan?: Plan | null;
  onSubmit: (data: Partial<Plan>) => void;
  isSubmitting: boolean;
}

const normalizePlanSlugInput = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

function PlanForm({ plan, onSubmit, isSubmitting }: PlanFormProps) {
  const [formData, setFormData] = useState<PlanFormState>(() => getInitialFormState(plan));

  useEffect(() => {
    setFormData(getInitialFormState(plan));
  }, [plan?.id, plan]);

  useEffect(() => {
    setFormData((prev) => {
      if (prev.slug) {
        return prev;
      }
      const normalized = normalizePlanSlugInput(prev.name);
      if (!normalized) {
        return prev;
      }
      return { ...prev, slug: normalized };
    });
  }, [formData.name]);

  const updateBoolean = (key: PlanBooleanKey, value: boolean) => {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const updateNumeric = (key: PlanNumericKey, value: number | null) => {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const normalizePriceInput = (value: string) => {
    if (value === '') {
      return null;
    }
    const parsed = Number.parseFloat(value);
    if (Number.isNaN(parsed)) {
      return null;
    }
    return Math.max(0, Math.round(parsed * 100));
  };

  const parseIntegerOrNull = (value: string) => {
    if (value === '') {
      return null;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const payload: Partial<Plan> = {
      name: formData.name.trim(),
      slug: normalizePlanSlugInput(formData.slug),
      description: formData.description.trim() || null,
      tier: normalizePlanTierInput(formData.tier),
      allowExperts: formData.allowExperts,
      allowTemplates: formData.allowTemplates,
      allowModels: formData.allowModels,
      allowKbSystem: formData.allowKbSystem,
      allowKbOrg: formData.allowKbOrg,
      allowKbTeam: formData.allowKbTeam,
      allowKbUser: formData.allowKbUser,
      allowMemory: formData.allowMemory,
      allowAgents: formData.allowAgents,
      allowApiAccess: formData.allowApiAccess,
      showExpertsUpsell: formData.showExpertsUpsell,
      showTemplatesUpsell: formData.showTemplatesUpsell,
      showApiUpsell: formData.showApiUpsell,
      dailyMessageLimit: formData.dailyMessageLimit,
      maxFileSizeMb: formData.maxFileSizeMb,
      storageQuotaGb: formData.storageQuotaGb,
      modelsAllowed: formData.modelsAllowed,
      expertsAllowed: formData.expertsAllowed,
      templatesAllowed: formData.templatesAllowed,
      priceMonthlyUsd: formData.priceMonthlyUsd,
      priceAnnualUsd: formData.priceAnnualUsd,
      isActive: formData.isActive,
    };

    onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="general">
            <Settings className="mr-2 h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="features">
            <Shield className="mr-2 h-4 w-4" />
            Features
          </TabsTrigger>
          <TabsTrigger value="limits">
            <Database className="mr-2 h-4 w-4" />
            Limits
          </TabsTrigger>
          <TabsTrigger value="pricing">
            <DollarSign className="mr-2 h-4 w-4" />
            Pricing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="name">Plan Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Pro"
                required
              />
            </div>
            <div>
              <Label htmlFor="slug">Plan Slug</Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => setFormData((prev) => ({ ...prev, slug: normalizePlanSlugInput(e.target.value) }))}
                placeholder="e.g., atlas-pro"
                required
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Used in analytics, billing, and feature gates. Only lowercase letters, numbers, and dashes.
              </p>
            </div>
            <div>
              <Label htmlFor="tier">Plan Tier</Label>
              <Select
                value={formData.tier}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, tier: normalizePlanTierInput(value) }))
                }
              >
                <SelectTrigger id="tier">
                  <SelectValue placeholder="Select a tier" />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_TIER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Determines default feature gates and usage limits for this plan.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="isActive"
              checked={formData.isActive}
              onCheckedChange={(checked) => updateBoolean('isActive', checked)}
            />
            <Label htmlFor="isActive">Plan is Active</Label>
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Brief description of the plan"
            />
          </div>
        </TabsContent>

        <TabsContent value="features" className="space-y-4">
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Feature Flags</h3>
            {FEATURE_FLAGS.map(({ key, label }) => (
              <div key={key} className="flex items-center space-x-2">
                <Switch
                  id={key}
                  checked={Boolean(formData[key])}
                  onCheckedChange={(checked) => updateBoolean(key, checked)}
                />
                <Label htmlFor={key}>{label}</Label>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium">Upsell Flags</h3>
            {UPSELL_FLAGS.map(({ key, label }) => (
              <div key={key} className="flex items-center space-x-2">
                <Switch
                  id={key}
                  checked={Boolean(formData[key])}
                  onCheckedChange={(checked) => updateBoolean(key, checked)}
                />
                <Label htmlFor={key}>{label}</Label>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="limits" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="dailyMessageLimit">Daily Message Limit</Label>
              <Input
                id="dailyMessageLimit"
                type="number"
                min={0}
                value={formData.dailyMessageLimit ?? ''}
                onChange={(e) => updateNumeric('dailyMessageLimit', parseIntegerOrNull(e.target.value))}
                placeholder="Leave empty for unlimited"
              />
            </div>
            <div>
              <Label htmlFor="maxFileSizeMb">Max File Size (MB)</Label>
              <Input
                id="maxFileSizeMb"
                type="number"
                min={0}
                value={formData.maxFileSizeMb ?? ''}
                onChange={(e) => updateNumeric('maxFileSizeMb', parseIntegerOrNull(e.target.value))}
                placeholder="Default 10"
              />
            </div>
            <div>
              <Label htmlFor="storageQuotaGb">Storage Quota (GB)</Label>
              <Input
                id="storageQuotaGb"
                type="number"
                min={0}
                value={formData.storageQuotaGb ?? ''}
                onChange={(e) => updateNumeric('storageQuotaGb', parseIntegerOrNull(e.target.value))}
                placeholder="Default 1"
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="pricing" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="priceMonthlyUsd">Monthly Price (USD)</Label>
              <Input
                id="priceMonthlyUsd"
                type="number"
                step="0.01"
                min={0}
                value={
                  formData.priceMonthlyUsd !== null && formData.priceMonthlyUsd !== undefined
                    ? (formData.priceMonthlyUsd / 100).toString()
                    : ''
                }
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    priceMonthlyUsd: normalizePriceInput(e.target.value),
                  }))
                }
                placeholder="0.00"
              />
            </div>
            <div>
              <Label htmlFor="priceAnnualUsd">Annual Price (USD)</Label>
              <Input
                id="priceAnnualUsd"
                type="number"
                step="0.01"
                min={0}
                value={
                  formData.priceAnnualUsd !== null && formData.priceAnnualUsd !== undefined
                    ? (formData.priceAnnualUsd / 100).toString()
                    : ''
                }
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    priceAnnualUsd: normalizePriceInput(e.target.value),
                  }))
                }
                placeholder="0.00"
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end space-x-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>{plan ? 'Update' : 'Create'} Plan</>
          )}
        </Button>
      </div>
    </form>
  );
}
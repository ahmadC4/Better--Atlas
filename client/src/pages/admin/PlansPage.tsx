import { useMemo, useCallback, useEffect } from 'react';
import { useAdminSettings } from '@/hooks/use-admin-settings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save } from 'lucide-react';
import { AI_MODELS, FEATURE_TOGGLES, getChatCapableModels, type UserPlan } from '@shared/schema';
import type { AIModel, FeatureToggle, ModelCapability } from '@shared/schema';
import { useAdminLayout } from '@/components/AdminLayout';
import { AdminSettingsErrorState } from '@/components/admin';
import { getAdminRouteById } from '@shared/adminRoutes';

export default function PlansPage() {
  const { draft, setDraft, isLoading, isSaving, handleSave, isError, refetch } = useAdminSettings();
  const { setHeader, resetHeader } = useAdminLayout();
  const route = getAdminRouteById('plans');
  const headerTitle = route.pageHeader?.title ?? route.label;
  const headerDescription = route.pageHeader?.description;

  const chatModels = useMemo(() => {
    return getChatCapableModels().slice().sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const providerDisplayOrder = ['OpenAI', 'Anthropic', 'Groq', 'Perplexity'] as const;

  const PLAN_TIERS: UserPlan[] = useMemo(() => ['free', 'pro', 'enterprise'], []);
  const PLAN_METADATA: Record<UserPlan, { badgeVariant: 'default' | 'secondary' | 'outline'; badgeLabel: string; description: string; title: string }> = useMemo(() => ({
    free: {
      badgeVariant: 'outline',
      badgeLabel: 'Starter',
      description: 'Configure feature and usage limits for free customers.',
      title: 'Free plan',
    },
    pro: {
      badgeVariant: 'default',
      badgeLabel: 'Premium',
      description: 'Configure feature and usage limits for paid self-serve customers.',
      title: 'Pro plan',
    },
    enterprise: {
      badgeVariant: 'secondary',
      badgeLabel: 'Enterprise',
      description: 'Configure feature and usage limits for enterprise agreements.',
      title: 'Enterprise plan',
    },
  }), []);

  const chatModelsByProvider = useMemo(() => {
    return chatModels.reduce<Record<string, AIModel[]>>((groups, model) => {
      const key = model.provider;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(model);
      groups[key].sort((a, b) => a.name.localeCompare(b.name));
      return groups;
    }, {});
  }, [chatModels]);

  const orderedProviders = useMemo(() => {
    const dynamicProviders = Object.keys(chatModelsByProvider);
    const extras = dynamicProviders.filter((provider) => !providerDisplayOrder.includes(provider as typeof providerDisplayOrder[number]));
    return [...providerDisplayOrder, ...extras];
  }, [chatModelsByProvider]);

  const featureOrder = useMemo(() => FEATURE_TOGGLES.map((feature) => feature.id), []);

  const capabilityLabels: Partial<Record<string, string>> = {
    search: 'Search',
    code: 'Code',
    thinking: 'Reasoning',
    vision: 'Vision',
  };
  const highlightCapabilities = ['search', 'code', 'thinking'] as const;

  const sortModelIds = useCallback((ids: Set<string>) => {
    const knownOrder = chatModels.map((model) => model.id);
    const sorted = knownOrder.filter((id) => ids.has(id));
    const extras = Array.from(ids).filter((id) => !knownOrder.includes(id));
    return [...sorted, ...extras];
  }, [chatModels]);

  const sortFeatureIds = useCallback((ids: Set<string>) => {
    const sorted = featureOrder.filter((id) => ids.has(id));
    const extras = Array.from(ids).filter((id) => !featureOrder.includes(id));
    return [...sorted, ...extras];
  }, [featureOrder]);

  const handleMessageLimitChange = useCallback((tier: UserPlan, value: string) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      const parsed = value === '' ? null : parseInt(value, 10);
      next.planTiers[tier].messageLimitPerDay = isNaN(parsed as number) ? null : parsed;
      return next;
    });
  }, [setDraft]);

  const handleFileUploadLimitChange = useCallback((tier: UserPlan, value: string) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      const parsed = value === '' ? null : parseInt(value, 10);
      next.planTiers[tier].fileUploadLimitMb = isNaN(parsed as number) ? null : parsed;
      return next;
    });
  }, [setDraft]);

  const togglePlanModel = useCallback((tier: UserPlan, modelId: string) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      const ids = new Set(next.planTiers[tier].allowedModels);
      if (ids.has(modelId)) {
        ids.delete(modelId);
      } else {
        ids.add(modelId);
      }
      next.planTiers[tier].allowedModels = sortModelIds(ids);
      return next;
    });
  }, [sortModelIds, setDraft]);

  const togglePlanFeature = useCallback((tier: UserPlan, featureId: string, checked?: boolean) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      const ids = new Set(next.planTiers[tier].features);
      const shouldEnable = typeof checked === 'boolean' ? checked : !ids.has(featureId);
      if (shouldEnable) {
        ids.add(featureId);
      } else {
        ids.delete(featureId);
      }
      next.planTiers[tier].features = sortFeatureIds(ids);
      return next;
    });
  }, [sortFeatureIds, setDraft]);

  const handleChatHistoryToggle = useCallback((tier: UserPlan, checked: boolean) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      next.planTiers[tier].chatHistoryEnabled = checked;
      return next;
    });
  }, [setDraft]);

  const legacyModelSet = useMemo(() => new Set(draft?.legacyModels ?? []), [draft?.legacyModels]);

  const toggleLegacyModel = useCallback((modelId: string) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      const ids = new Set(next.legacyModels ?? []);
      if (ids.has(modelId)) {
        ids.delete(modelId);
      } else {
        ids.add(modelId);
      }
      next.legacyModels = sortModelIds(ids);
      return next;
    });
  }, [sortModelIds, setDraft]);

  const hasLoadedDraft = Boolean(draft);

  const headerActions = useMemo(() => {
    if (!hasLoadedDraft) {
      return null;
    }

    return (
      <Button
        onClick={() => { void handleSave('planTiers'); }}
        disabled={isSaving}
        className="gap-2 whitespace-nowrap sm:w-auto"
        data-testid="button-save-plans"
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        Save changes
      </Button>
    );
  }, [hasLoadedDraft, handleSave, isSaving]);

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
        testId="admin-settings-error-state-plans"
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

  return (
    <div className="flex-1 overflow-auto px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="grid w-full gap-4 md:grid-cols-2">
          {PLAN_TIERS.map((tier) => {
            const planSettings = draft.planTiers[tier];
            const allowedModels = new Set(planSettings.allowedModels);
            const enabledFeaturesSet = new Set(planSettings.features);
            const legacyFeatures = planSettings.features.filter((id) => !featureOrder.includes(id));
            const allowedModelDetails = chatModels.filter((model) => allowedModels.has(model.id));
            const planMetadata = PLAN_METADATA[tier];

            return (
              <Card key={tier} data-testid={`card-plan-${tier}`} className="min-w-0">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2">
                    <span>{planMetadata.title}</span>
                    <Badge variant={planMetadata.badgeVariant}>{planMetadata.badgeLabel}</Badge>
                  </CardTitle>
                  <CardDescription>{planMetadata.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Daily message allowance</label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="Leave blank for unlimited"
                      value={planSettings.messageLimitPerDay ?? ''}
                      onChange={(event) => handleMessageLimitChange(tier, event.target.value)}
                      data-testid={`input-plan-${tier}-message-limit`}
                    />
                    <p className="text-xs text-muted-foreground">Blank = unlimited messages per day.</p>
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Max file upload size (MB)</label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="Unlimited"
                      value={planSettings.fileUploadLimitMb ?? ''}
                      onChange={(event) => handleFileUploadLimitChange(tier, event.target.value)}
                      data-testid={`input-plan-${tier}-file-limit`}
                    />
                    <p className="text-xs text-muted-foreground">Blank = use the default plan limit.</p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Allowed chat models</label>
                      <span className="text-xs text-muted-foreground">Click to toggle availability</span>
                    </div>
                    <div className="space-y-3">
                      {orderedProviders.map((provider) => {
                        const models = chatModelsByProvider[provider];
                        if (!models || models.length === 0) return null;

                        return (
                          <div key={provider} className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{provider}</p>
                            <div className="flex flex-wrap gap-2">
                              {models.map((model) => {
                                const isEnabled = allowedModels.has(model.id);
                                const capabilitySummary = highlightCapabilities
                                  .filter((cap) => model.capabilities.includes(cap))
                                  .map((cap) => capabilityLabels[cap] ?? cap)
                                  .join(' • ');

                                return (
                                  <Button
                                    key={model.id}
                                    type="button"
                                    variant={isEnabled ? 'default' : 'outline'}
                                    size="sm"
                                    className="h-auto rounded-full px-3 py-1.5 text-xs font-medium"
                                    onClick={() => togglePlanModel(tier, model.id)}
                                    data-testid={`toggle-plan-${tier}-model-${model.id}`}
                                  >
                                    <div className="flex flex-col items-start gap-0">
                                      <span>{model.name}</span>
                                      {capabilitySummary && (
                                        <span className="text-[10px] font-normal text-muted-foreground">{capabilitySummary}</span>
                                      )}
                                    </div>
                                  </Button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                      {allowedModelDetails.length === 0 && (
                        <p className="text-xs text-muted-foreground">No models enabled. Users on this plan will be unable to chat.</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Feature access</label>
                      <span className="text-xs text-muted-foreground">Toggle available features for this plan</span>
                    </div>
                    {FEATURE_TOGGLES.map((feature: FeatureToggle) => {
                      const supportsFeature = feature.supportedModels.length === 0 || feature.supportedModels.some((id) => allowedModels.has(id));
                      const isEnabled = enabledFeaturesSet.has(feature.id);
                      const isSupportedButDisabled = supportsFeature && !isEnabled;

                      return (
                        <div key={feature.id} className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                          <div className="space-y-1">
                            <p className="text-sm font-medium leading-none">{feature.name}</p>
                            <p className="text-xs text-muted-foreground">{feature.description}</p>
                            {isSupportedButDisabled && (
                              <p className="text-[11px] text-amber-600 dark:text-amber-300">Supported by enabled models but disabled for this plan.</p>
                            )}
                          </div>
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={(checked) => togglePlanFeature(tier, feature.id, checked)}
                            disabled={!supportsFeature && !isEnabled}
                            data-testid={`switch-plan-${tier}-feature-${feature.id}`}
                          />
                        </div>
                      );
                    })}
                    {FEATURE_TOGGLES.length === 0 && (
                      <p className="text-xs text-muted-foreground">No feature flags configured yet.</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none">Chat history</p>
                      <p className="text-xs text-muted-foreground">Allow users on the {tier} plan to revisit previous chats.</p>
                    </div>
                    <Switch
                      checked={planSettings.chatHistoryEnabled}
                      onCheckedChange={(checked) => handleChatHistoryToggle(tier, checked)}
                      data-testid={`switch-plan-${tier}-chat-history`}
                    />
                  </div>
                  {legacyFeatures.length > 0 && (
                    <div className="space-y-1 rounded-md border border-dashed border-muted-foreground/40 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Legacy feature notes</p>
                      <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                        {legacyFeatures.map((feature) => (
                          <li key={feature}>{feature}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </section>

        <section>
          <Card data-testid="card-legacy-models">
            <CardHeader>
              <CardTitle>Legacy model catalog</CardTitle>
              <CardDescription>Move chat models into the legacy submenu for user workspaces.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {orderedProviders.map((provider) => {
                const models = chatModelsByProvider[provider];
                if (!models || models.length === 0) return null;

                return (
                  <div key={provider} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{provider}</p>
                      <span className="text-xs text-muted-foreground">
                        {models.filter((model) => legacyModelSet.has(model.id)).length} of {models.length} in legacy
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {models.map((model) => {
                        const isLegacy = legacyModelSet.has(model.id);
                        const capabilitySummary = highlightCapabilities
                          .filter((cap) => model.capabilities.includes(cap))
                          .map((cap) => capabilityLabels[cap] ?? cap)
                          .join(' • ');

                        return (
                          <Button
                            key={model.id}
                            type="button"
                            variant={isLegacy ? 'default' : 'outline'}
                            size="sm"
                            className="h-auto rounded-full px-3 py-1.5 text-xs font-medium"
                            onClick={() => toggleLegacyModel(model.id)}
                            data-testid={`toggle-legacy-model-${model.id}`}
                          >
                            <div className="flex flex-col items-start gap-0">
                              <span>{model.name}</span>
                              {capabilitySummary && (
                                <span className="text-[10px] font-normal text-muted-foreground">{capabilitySummary}</span>
                              )}
                            </div>
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}


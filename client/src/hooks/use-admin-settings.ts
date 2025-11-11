import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { defaultPlatformSettings, type PlatformSettingsData } from '@shared/schema';

const PLAN_TIER_KEYS = ['free', 'pro', 'enterprise'] as const;

function applySettingsDefaults(settings: PlatformSettingsData): PlatformSettingsData {
  const source = structuredClone(settings) as PlatformSettingsData;

  const mergedPlanTiers = PLAN_TIER_KEYS.reduce((acc, tier) => {
    const base = structuredClone(defaultPlatformSettings.planTiers[tier]);
    const overrides = source.planTiers?.[tier];
    acc[tier] = overrides ? { ...base, ...overrides } : base;
    return acc;
  }, {} as PlatformSettingsData['planTiers']);

  const providerKeys = new Set([
    ...Object.keys(defaultPlatformSettings.apiProviders),
    ...Object.keys(source.apiProviders ?? {}),
  ]);
  const mergedApiProviders = {} as PlatformSettingsData['apiProviders'];
  for (const provider of providerKeys) {
    const base = defaultPlatformSettings.apiProviders[provider];
    const overrides = source.apiProviders?.[provider];

    if (base) {
      mergedApiProviders[provider] = { ...structuredClone(base), ...(overrides ?? {}) };
    } else if (overrides) {
      mergedApiProviders[provider] = structuredClone(overrides);
    }
  }

  const allowlistKeys = new Set([
    ...Object.keys(defaultPlatformSettings.planAllowlists),
    ...Object.keys(source.planAllowlists ?? {}),
  ]);
  const mergedPlanAllowlists = {} as PlatformSettingsData['planAllowlists'];
  for (const tier of allowlistKeys) {
    const base = defaultPlatformSettings.planAllowlists[tier] ?? { knowledgeBaseHosts: [] };
    const overrides = source.planAllowlists?.[tier];
    mergedPlanAllowlists[tier] = {
      knowledgeBaseHosts: Array.isArray(overrides?.knowledgeBaseHosts)
        ? [...overrides.knowledgeBaseHosts]
        : [...base.knowledgeBaseHosts],
    };
  }

  return {
    ...structuredClone(defaultPlatformSettings),
    ...source,
    planTiers: mergedPlanTiers,
    knowledgeBase: {
      ...structuredClone(defaultPlatformSettings.knowledgeBase),
      ...(source.knowledgeBase ?? {}),
    },
    memory: {
      ...structuredClone(defaultPlatformSettings.memory),
      ...(source.memory ?? {}),
    },
    aiAgents: {
      ...structuredClone(defaultPlatformSettings.aiAgents),
      ...(source.aiAgents ?? {}),
    },
    templates: {
      ...structuredClone(defaultPlatformSettings.templates),
      ...(source.templates ?? {}),
    },
    projects: {
      ...structuredClone(defaultPlatformSettings.projects),
      ...(source.projects ?? {}),
    },
    teams: {
      ...structuredClone(defaultPlatformSettings.teams),
      ...(source.teams ?? {}),
    },
    apiProviders: mergedApiProviders,
    legacyModels: source.legacyModels ? [...source.legacyModels] : [...defaultPlatformSettings.legacyModels],
    planAllowlists: mergedPlanAllowlists,
  };
}

export function useAdminSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();

  const { data, isLoading, isError } = useQuery<{ settings: PlatformSettingsData }>({
    queryKey: ['admin-settings'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/settings');
      return response.json();
    },
    enabled: isAdmin,
  });

  const [draft, setDraft] = useState<PlatformSettingsData | null>(null);

  const normalizedSettings = useMemo(
    () => (data?.settings ? applySettingsDefaults(data.settings) : null),
    [data?.settings],
  );

  useEffect(() => {
    if (normalizedSettings && !draft) {
      setDraft(normalizedSettings);
    }
  }, [draft, normalizedSettings]);

  const saveMutation = useMutation({
    mutationFn: async (updates: Partial<PlatformSettingsData>) => {
      const response = await apiRequest('PUT', '/api/admin/settings', updates);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save settings');
      }
      return response.json();
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      setDraft(applySettingsDefaults(response.settings));
      toast({
        title: 'Settings saved',
        description: 'Your changes have been applied successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Save failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSave = async (section?: keyof PlatformSettingsData) => {
    if (!draft) return;

    const updates = section
      ? { [section]: structuredClone(draft[section]) }
      : structuredClone(draft);
    await saveMutation.mutateAsync(updates);
  };

  const resetDraft = () => {
    if (normalizedSettings) {
      setDraft(normalizedSettings);
    }
  };

  return {
    settings: normalizedSettings,
    draft,
    setDraft,
    isLoading,
    isError,
    isSaving: saveMutation.isPending,
    handleSave,
    resetDraft,
    hasChanges:
      draft && normalizedSettings ? JSON.stringify(draft) !== JSON.stringify(normalizedSettings) : false,
  };
}

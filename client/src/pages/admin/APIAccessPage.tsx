import { useMemo, useCallback } from 'react';
import { useAdminSettings } from '@/hooks/use-admin-settings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';
import { AI_MODELS } from '@shared/schema';
import type { AIModel, ProviderSettings } from '@shared/schema';

export default function APIAccessPage() {
  const { draft, setDraft, isLoading, isSaving, handleSave } = useAdminSettings();

  const providerModelMap = useMemo(() => {
    const groups: Record<string, AIModel[]> = {};
    for (const model of AI_MODELS) {
      const key = model.provider.toLowerCase();
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(model);
      groups[key].sort((a, b) => a.name.localeCompare(b.name));
    }
    return groups;
  }, []);

  const orderedProviders = useMemo(() => {
    return ['anthropic', 'openai', 'groq', 'perplexity'] as const;
  }, []);

  const capabilityLabels: Partial<Record<string, string>> = {
    search: 'Search',
    code: 'Code',
    thinking: 'Reasoning',
    vision: 'Vision',
  };
  const highlightCapabilities = ['search', 'code', 'thinking'] as const;

  const sortProviderModelIds = useCallback((provider: string, ids: Set<string>) => {
    const knownOrder = (providerModelMap[provider] ?? []).map((model) => model.id);
    const sorted = knownOrder.filter((id) => ids.has(id));
    const extras = Array.from(ids).filter((id) => !knownOrder.includes(id));
    return [...sorted, ...extras];
  }, [providerModelMap]);

  const handleProviderUpdate = useCallback((provider: string, updater: (settings: ProviderSettings) => ProviderSettings) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      next.apiProviders[provider] = updater(next.apiProviders[provider]);
      return next;
    });
  }, [setDraft]);

  const handleToggleProviderEnabled = useCallback((provider: string, checked: boolean) => {
    handleProviderUpdate(provider, (settings) => ({
      ...settings,
      enabled: checked,
    }));
  }, [handleProviderUpdate]);

  const handleApiKeyChange = useCallback((provider: string, value: string) => {
    handleProviderUpdate(provider, (settings) => ({
      ...settings,
      defaultApiKey: value || null,
    }));
  }, [handleProviderUpdate]);

  const handleToggleUserKeys = useCallback((provider: string, checked: boolean) => {
    handleProviderUpdate(provider, (settings) => ({
      ...settings,
      allowUserProvidedKeys: checked,
    }));
  }, [handleProviderUpdate]);

  const handleDailyLimitChange = useCallback((provider: string, value: string) => {
    handleProviderUpdate(provider, (settings) => {
      const parsed = value === '' ? null : parseInt(value, 10);
      return {
        ...settings,
        dailyRequestLimit: isNaN(parsed as number) ? null : parsed,
      };
    });
  }, [handleProviderUpdate]);

  const toggleProviderModel = useCallback((provider: string, modelId: string) => {
    handleProviderUpdate(provider, (settings) => {
      const ids = new Set(settings.allowedModels);
      if (ids.has(modelId)) {
        ids.delete(modelId);
      } else {
        ids.add(modelId);
      }
      return {
        ...settings,
        allowedModels: sortProviderModelIds(provider, ids),
      };
    });
  }, [handleProviderUpdate, sortProviderModelIds]);

  const toggleProviderPlatformModel = useCallback((provider: string, modelId: string, checked?: boolean) => {
    handleProviderUpdate(provider, (settings) => {
      const ids = new Set(settings.platformKeyAllowedModels ?? []);
      const shouldEnable = typeof checked === 'boolean' ? checked : !ids.has(modelId);
      if (shouldEnable) {
        ids.add(modelId);
      } else {
        ids.delete(modelId);
      }
      return {
        ...settings,
        platformKeyAllowedModels: sortProviderModelIds(provider, ids),
      };
    });
  }, [handleProviderUpdate, sortProviderModelIds]);

  if (isLoading || !draft) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const providerEntries = Object.entries(draft.apiProviders);

  return (
    <div className="flex-1 overflow-auto px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold">API Access</h1>
              <p className="text-muted-foreground mt-2">
                Configure API providers, authentication, and model availability.
              </p>
            </div>
            <Button
              onClick={() => handleSave('apiProviders')}
              disabled={isSaving}
              className="gap-2 whitespace-nowrap sm:w-auto"
              data-testid="button-save-api-access"
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

        <section className="space-y-6">
          {orderedProviders.map((provider) => {
            const config = draft.apiProviders[provider];
            if (!config) return null;

            const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);

            return (
              <Card key={provider} data-testid={`card-api-provider-${provider}`}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2">
                    <span>{providerName}</span>
                    <Switch
                      checked={config.enabled}
                      onCheckedChange={(checked) => handleToggleProviderEnabled(provider, checked)}
                      data-testid={`switch-provider-${provider}-enabled`}
                    />
                  </CardTitle>
                  <CardDescription>
                    Configure {providerName} API access, models, and usage limits.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-2">
                    <Label htmlFor={`${provider}-api-key`}>Default API key</Label>
                    <Input
                      id={`${provider}-api-key`}
                      type="password"
                      placeholder="Enter platform API key"
                      value={config.defaultApiKey ?? ''}
                      onChange={(event) => handleApiKeyChange(provider, event.target.value)}
                      data-testid={`input-provider-${provider}-api-key`}
                    />
                    <p className="text-xs text-muted-foreground">
                      Platform-wide API key used when users don't provide their own.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Allowed models</Label>
                      <span className="text-xs text-muted-foreground">Click to toggle</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(providerModelMap[provider] ?? []).map((model) => {
                        const isEnabled = config.allowedModels.includes(model.id);
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
                            onClick={() => toggleProviderModel(provider, model.id)}
                            data-testid={`toggle-provider-${provider}-model-${model.id}`}
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
                    {(providerModelMap[provider] ?? []).length === 0 && (
                      <p className="text-xs text-muted-foreground">No models catalogued for this provider yet.</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
                    <div className="space-y-1">
                      <Label htmlFor={`${provider}-user-keys`} className="text-sm font-medium">
                        Allow user-supplied keys
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Let users provide their own {providerName} API keys for requests.
                      </p>
                    </div>
                    <Switch
                      id={`${provider}-user-keys`}
                      checked={config.allowUserProvidedKeys}
                      onCheckedChange={(checked) => handleToggleUserKeys(provider, checked)}
                      data-testid={`switch-provider-${provider}-user-keys`}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Platform key coverage</Label>
                      <span className="text-xs text-muted-foreground">Control global key usage per model</span>
                    </div>
                    <div className="space-y-2">
                      {(providerModelMap[provider] ?? []).map((model) => {
                        const usesGlobalKey = (config.platformKeyAllowedModels ?? []).includes(model.id);
                        return (
                          <div
                            key={model.id}
                            className="flex items-center justify-between rounded-lg border bg-muted/20 p-3"
                          >
                            <span className="text-sm">{model.name}</span>
                            <Switch
                              checked={usesGlobalKey}
                              onCheckedChange={(checked) => toggleProviderPlatformModel(provider, model.id, checked)}
                              data-testid={`switch-provider-${provider}-platform-model-${model.id}`}
                            />
                          </div>
                        );
                      })}
                      {(providerModelMap[provider] ?? []).length === 0 && (
                        <p className="text-xs text-muted-foreground">No models available to configure platform keys.</p>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor={`${provider}-daily-limit`}>Daily request cap</Label>
                    <Input
                      id={`${provider}-daily-limit`}
                      type="number"
                      min={0}
                      placeholder="Leave blank for unlimited"
                      value={config.dailyRequestLimit ?? ''}
                      onChange={(event) => handleDailyLimitChange(provider, event.target.value)}
                      data-testid={`input-provider-${provider}-daily-limit`}
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum API requests per day across all users. Blank = unlimited.
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      </div>
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { EffectiveCapabilities } from '@shared/schema';

interface UseEffectiveCapabilitiesOptions {
  enabled?: boolean;
}

export function useEffectiveCapabilities(options?: UseEffectiveCapabilitiesOptions) {
  return useQuery<EffectiveCapabilities>({
    queryKey: ['effective-capabilities'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/effective-capabilities');
      return response.json();
    },
    enabled: options?.enabled,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });
}

// Helper function to check if user can use experts
export function canUseExperts(capabilities?: EffectiveCapabilities | null): boolean {
  if (!capabilities) return false;
  return capabilities.features.experts.allowed;
}

// Helper function to check if user can use templates  
export function canUseTemplates(capabilities?: EffectiveCapabilities | null): boolean {
  if (!capabilities) return false;
  return capabilities.features.templates.allowed;
}

// Helper function to check if user can use a specific model
export function canUseModel(capabilities: EffectiveCapabilities | null | undefined, modelId: string): boolean {
  if (!capabilities) return false;
  
  // If models aren't restricted, allow all
  if (!capabilities.features.models.allowed) return false;
  
  // If no allowlist specified, allow all models
  if (capabilities.allowlists.models.length === 0) return true;
  
  // Check if model is in the allowlist
  return capabilities.allowlists.models.includes(modelId);
}

// Helper function to check if user can access a specific expert
export function canAccessExpert(capabilities: EffectiveCapabilities | null | undefined, expertId: string): boolean {
  if (!capabilities) return false;
  
  // Must have experts feature enabled
  if (!capabilities.features.experts.allowed) return false;
  
  // If no allowlist specified, allow all experts
  if (capabilities.allowlists.experts.length === 0) return true;
  
  // Check if expert is in the allowlist
  return capabilities.allowlists.experts.includes(expertId);
}

// Helper function to check if user can access a specific template
export function canAccessTemplate(capabilities: EffectiveCapabilities | null | undefined, templateId: string): boolean {
  if (!capabilities) return false;
  
  // Must have templates feature enabled
  if (!capabilities.features.templates.allowed) return false;
  
  // If no allowlist specified, allow all templates
  if (capabilities.allowlists.templates.length === 0) return true;
  
  // Check if template is in the allowlist
  return capabilities.allowlists.templates.includes(templateId);
}

// Helper function to check if user has access to knowledge base features
export function hasKnowledgeBaseAccess(capabilities: EffectiveCapabilities | null | undefined, scope: 'system' | 'team' | 'user'): boolean {
  if (!capabilities) return false;
  return capabilities.features.kb[scope];
}

// Helper function to check if user has API access
export function hasApiAccess(capabilities: EffectiveCapabilities | null | undefined): boolean {
  if (!capabilities) return false;
  return capabilities.features.api_access.allowed;
}

// Helper function to check if user has agents feature
export function hasAgentsAccess(capabilities: EffectiveCapabilities | null | undefined): boolean {
  if (!capabilities) return false;
  return capabilities.features.agents;
}

// Helper function to check if user has memory feature
export function hasMemoryAccess(capabilities: EffectiveCapabilities | null | undefined): boolean {
  if (!capabilities) return false;
  return capabilities.features.memory;
}

// Helper function to check if teams are enabled
export function hasTeamsAccess(capabilities: EffectiveCapabilities | null | undefined): boolean {
  if (!capabilities) return false;
  return capabilities.teams.enabled;
}

// Helper function to get upsell message for a feature
export function getUpsellMessage(
  feature: 'experts' | 'templates' | 'api_access',
  capabilities: EffectiveCapabilities | null | undefined
): string | null {
  if (!capabilities) return null;
  
  const featureConfig = capabilities.features[feature];
  
  // If feature is allowed, no upsell needed
  if ('allowed' in featureConfig && featureConfig.allowed) {
    return null;
  }
  
  // If upsell is enabled for this feature
  if ('upsell' in featureConfig && featureConfig.upsell) {
    const messages = {
      experts: 'Upgrade to Pro to access expert AI assistants',
      templates: 'Upgrade to Pro to use advanced output templates',
      api_access: 'Upgrade to Enterprise for API access',
    };
    return messages[feature];
  }
  
  return null;
}

// Helper function to check if a feature should show upsell
export function shouldShowUpsell(
  feature: 'experts' | 'templates' | 'api_access',
  capabilities: EffectiveCapabilities | null | undefined
): boolean {
  if (!capabilities) return false;
  
  const featureConfig = capabilities.features[feature];
  return 'upsell' in featureConfig && featureConfig.upsell;
}

// Helper function to get user's plan tier
export function getUserPlanTier(capabilities: EffectiveCapabilities | null | undefined): string {
  if (!capabilities) return 'free';
  return capabilities.plan.tier;
}

// Helper function to check daily message limit
export function getDailyMessageLimit(capabilities: EffectiveCapabilities | null | undefined): number | null {
  if (!capabilities) return 10; // Default to free tier limit
  return capabilities.limits.daily_message_limit;
}

// Helper function to check file size limit
export function getMaxFileSizeMb(capabilities: EffectiveCapabilities | null | undefined): number {
  if (!capabilities) return 10; // Default to 10MB
  return capabilities.limits.max_file_size_mb;
}

// Helper function to check storage quota
export function getStorageQuotaGb(capabilities: EffectiveCapabilities | null | undefined): number {
  if (!capabilities) return 1; // Default to 1GB
  return capabilities.limits.storage_quota_gb;
}

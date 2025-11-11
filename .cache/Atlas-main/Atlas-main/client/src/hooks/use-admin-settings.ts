import {
  useState,
  useEffect,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import type { PlatformSettings, PlatformSettingsData } from '@shared/schema';

type AdminSettingsQueryResult = UseQueryResult<
  { settings: PlatformSettings },
  Error
>;

export interface UseAdminSettingsResult {
  settings: PlatformSettingsData | undefined;
  draft: PlatformSettingsData | null;
  setDraft: Dispatch<SetStateAction<PlatformSettingsData | null>>;
  isLoading: boolean;
  isError: boolean;
  isSaving: boolean;
  handleSave: (section?: keyof PlatformSettingsData) => Promise<void>;
  resetDraft: () => void;
  hasChanges: boolean;
  refetch: AdminSettingsQueryResult['refetch'];
}

export function useAdminSettings(): UseAdminSettingsResult {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();

  const { data, isLoading, isError, refetch } = useQuery<{ settings: PlatformSettings }>({
    queryKey: ['admin-settings'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/settings');
      return response.json();
    },
    enabled: isAdmin,
  });

  const [draft, setDraft] = useState<PlatformSettingsData | null>(null);

  const settingsData = data?.settings?.data;

  useEffect(() => {
    if (!draft && settingsData) {
      const normalizedSettings: PlatformSettingsData = structuredClone(settingsData);
      setDraft(normalizedSettings);
    }
  }, [settingsData, draft]);

  const saveMutation = useMutation<{ settings: PlatformSettings }, Error, PlatformSettingsData>({
    mutationFn: async (payload: PlatformSettingsData) => {
      const response = await apiRequest('PUT', '/api/admin/settings', payload);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save settings');
      }
      return response.json();
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      const normalizedSettings: PlatformSettingsData = structuredClone(
        response.settings.data,
      );
      setDraft(normalizedSettings);
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

  const handleSave = useCallback(
    async (section?: keyof PlatformSettingsData) => {
      if (!draft) return;

      const payload = structuredClone(draft);

      // When saving a specific section, make sure we only submit known keys by
      // copying the original settings and replacing the targeted section. This
      // keeps the payload aligned with the schema while avoiding undefined keys.
      if (section && settingsData) {
        const merged = structuredClone(settingsData);
        merged[section] = payload[section];
        await saveMutation.mutateAsync(merged);
        return;
      }

      await saveMutation.mutateAsync(payload);
    },
    [draft, settingsData, saveMutation],
  );

  const resetDraft = useCallback(() => {
    if (settingsData) {
      setDraft(structuredClone(settingsData));
      return;
    }
    setDraft(null);
  }, [settingsData]);

  const hasChanges = Boolean(
    draft &&
      settingsData &&
      JSON.stringify(draft) !== JSON.stringify(settingsData),
  );

  return {
    settings: settingsData,
    draft,
    setDraft,
    isLoading,
    isError,
    isSaving: saveMutation.isPending,
    handleSave,
    resetDraft,
    hasChanges,
    refetch,
  };
}

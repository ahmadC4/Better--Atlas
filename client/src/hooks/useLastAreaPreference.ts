import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

type LastArea = 'user' | 'admin';

const PREFERENCES_QUERY_KEY = ['/api/user/preferences'] as const;

type PreferencesResult = { lastArea?: LastArea } | undefined;

type QueryClientLike = Pick<QueryClient, 'getQueryData' | 'setQueryData'>;

interface PersistOptions {
  queryClient: QueryClientLike;
  api?: typeof apiRequest;
}

export async function persistLastAreaPreference(
  area: LastArea,
  { queryClient, api = apiRequest }: PersistOptions,
): Promise<boolean> {
  let preferences = queryClient.getQueryData<PreferencesResult>(PREFERENCES_QUERY_KEY) ?? undefined;

  if (!preferences) {
    try {
      const response = await api('GET', '/api/user/preferences');
      preferences = (await response.json()) as PreferencesResult;
      queryClient.setQueryData(PREFERENCES_QUERY_KEY, preferences ?? {});
    } catch (error) {
      console.error('Failed to load user preferences for last area persistence:', error);
      return false;
    }
  }

  if (preferences?.lastArea && preferences.lastArea !== area) {
    return false;
  }

  try {
    await api('POST', '/api/user/preferences', { lastArea: area });
    queryClient.setQueryData(PREFERENCES_QUERY_KEY, (current: PreferencesResult) => ({
      ...(current ?? {}),
      lastArea: area,
    }));
    return true;
  } catch (error) {
    console.error('Failed to persist last area preference:', error);
    return false;
  }
}

export function useLastAreaPreference(area: LastArea) {
  const queryClient = useQueryClient();

  useEffect(() => {
    void persistLastAreaPreference(area, { queryClient });
  }, [area, queryClient]);
}


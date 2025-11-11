import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const reactQueryModule = await import('@tanstack/react-query');
const toastModule = await import('../client/src/hooks/use-toast.ts');
const authModule = await import('../client/src/hooks/useAuth.ts');
const { defaultPlatformSettings } = await import('../shared/schema');

test('useAdminSettings exposes refetch from the query result', async () => {
  const refetchMock = mock.fn(async () => ({
    data: { settings: { data: defaultPlatformSettings } },
  }));

  const useQueryMock = mock.method(reactQueryModule, 'useQuery', () => ({
    data: { settings: { data: defaultPlatformSettings } },
    isLoading: false,
    isError: false,
    refetch: refetchMock,
  }));

  const useMutationMock = mock.method(reactQueryModule, 'useMutation', () => ({
    mutateAsync: async () => ({ settings: { data: defaultPlatformSettings } }),
    isPending: false,
  }));

  const useQueryClientMock = mock.method(reactQueryModule, 'useQueryClient', () => ({
    invalidateQueries: () => {},
  }));

  const toastMock = mock.method(toastModule, 'useToast', () => ({
    toast: () => {},
  }));

  const authMock = mock.method(authModule, 'useAuth', () => ({
    isAdmin: true,
  }));

  const adminSettingsModule = await import('../client/src/hooks/use-admin-settings.ts');

  let hookResult: adminSettingsModule.UseAdminSettingsResult | undefined;

  function TestComponent() {
    hookResult = adminSettingsModule.useAdminSettings();
    return null;
  }

  try {
    renderToStaticMarkup(createElement(TestComponent));

    assert.ok(hookResult, 'expected hook to return a result');
    assert.strictEqual(hookResult?.refetch, refetchMock);
    assert.deepEqual(hookResult?.settings, defaultPlatformSettings);
    await hookResult?.refetch?.();
    assert.equal(refetchMock.mock.callCount(), 1, 'expected refetch to be called once');
  } finally {
    authMock.restore();
    toastMock.restore();
    useQueryClientMock.restore();
    useMutationMock.restore();
    useQueryMock.restore();
  }
});

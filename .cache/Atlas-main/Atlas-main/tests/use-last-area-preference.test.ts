import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import type { QueryClient } from '@tanstack/react-query';

import { persistLastAreaPreference } from '../client/src/hooks/useLastAreaPreference.ts';

type LastArea = 'user' | 'admin';

type QueryState = { value: { lastArea?: LastArea } | undefined };

function createQueryClientStub(initial: { lastArea?: LastArea } | undefined = undefined) {
  const state: QueryState = { value: initial };

  const setQueryData: QueryClient['setQueryData'] = (_key, updater) => {
    if (typeof updater === 'function') {
      const result = updater(state.value);
      state.value = result as QueryState['value'];
      return;
    }
    state.value = updater as QueryState['value'];
  };

  return {
    getQueryData: () => state.value,
    setQueryData,
    _state: state,
  } satisfies Pick<QueryClient, 'getQueryData' | 'setQueryData'> & { _state: QueryState };
}

const okResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

test('skips persisting admin area when preference is user', async () => {
  const queryClient = createQueryClientStub({ lastArea: 'user' });
  const api = mock.fn(async (method: string) => {
    if (method === 'GET') {
      return okResponse({ lastArea: 'user' });
    }
    return okResponse({});
  });

  const persisted = await persistLastAreaPreference('admin', {
    queryClient,
    api,
  });

  assert.equal(persisted, false);
  assert.equal(
    api.mock.calls.filter((call) => call.arguments[0] === 'POST').length,
    0,
    'expected no POST calls when skipping persistence',
  );
  assert.equal(queryClient._state.value?.lastArea, 'user');
});

test('persists admin area when preference already allows admin', async () => {
  const queryClient = createQueryClientStub({ lastArea: 'admin' });
  const api = mock.fn(async (method: string) => {
    if (method === 'GET') {
      return okResponse({ lastArea: 'admin' });
    }
    return okResponse({});
  });

  const persisted = await persistLastAreaPreference('admin', {
    queryClient,
    api,
  });

  assert.equal(persisted, true);
  assert.equal(
    api.mock.calls.filter((call) => call.arguments[0] === 'POST').length,
    1,
    'expected a single POST call when persisting admin area',
  );
  assert.equal(queryClient._state.value?.lastArea, 'admin');
});

test('skips reverting to user area when admin preference is active', async () => {
  const queryClient = createQueryClientStub({ lastArea: 'admin' });
  const api = mock.fn(async (method: string) => {
    if (method === 'GET') {
      return okResponse({ lastArea: 'admin' });
    }
    return okResponse({});
  });

  const persisted = await persistLastAreaPreference('user', {
    queryClient,
    api,
  });

  assert.equal(persisted, false);
  assert.equal(
    api.mock.calls.filter((call) => call.arguments[0] === 'POST').length,
    0,
    'expected no POST calls when keeping admin preference',
  );
  assert.equal(queryClient._state.value?.lastArea, 'admin');
});

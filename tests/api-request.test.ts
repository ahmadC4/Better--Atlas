import test from 'node:test';
import assert from 'node:assert/strict';

import { apiRequest } from '../client/src/lib/queryClient';

test('apiRequest normalises method, fetches csrf token, and sends JSON payloads', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ input: unknown; init: RequestInit }> = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const resolvedInit: RequestInit = init ?? {};
    calls.push({ input, init: resolvedInit });

    if (typeof input === 'string' && input.includes('/api/auth/csrf-token')) {
      return new Response(JSON.stringify({ csrfToken: 'csrf-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('ok', { status: 200 });
  }) as typeof fetch;

  try {
    await apiRequest('post', '/api/example', { foo: 'bar' });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 2, 'expected csrf preflight and request fetch calls');

  const csrfCall = calls[0];
  assert.equal(csrfCall.init.method ?? 'GET', 'GET');
  assert.equal(csrfCall.init.credentials, 'include');

  const requestCall = calls[1];
  assert.equal(requestCall.input, '/api/example');
  assert.equal(requestCall.init.method, 'POST');
  assert.equal(requestCall.init.credentials, 'include');
  assert.equal(requestCall.init.body, JSON.stringify({ foo: 'bar' }));

  const headers = new Headers(requestCall.init.headers);
  assert.equal(headers.get('Content-Type'), 'application/json');
  assert.equal(headers.get('X-CSRF-Token'), 'csrf-token');
});

test('apiRequest avoids csrf round-trip for safe methods', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ input: unknown; init: RequestInit }> = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const resolvedInit: RequestInit = init ?? {};
    calls.push({ input, init: resolvedInit });
    return new Response('ok', { status: 200 });
  }) as typeof fetch;

  try {
    await apiRequest('GET', '/api/example');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 1, 'safe methods should not trigger csrf refresh');
  const [{ init }] = calls;
  const headers = new Headers(init.headers);
  assert.equal(headers.get('X-CSRF-Token'), null);
  assert.equal(headers.get('Content-Type'), null);
  assert.equal(init.method, 'GET');
});

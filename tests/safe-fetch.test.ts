import test from 'node:test';
import assert from 'node:assert/strict';

const { fetchWithSsrfProtection, UnsafeRemoteURLError } = await import('../server/security/safe-fetch');

test('rejects URLs resolving to private IPv4 addresses', async () => {
  let fetchCalls = 0;
  await assert.rejects(
    fetchWithSsrfProtection('http://example.local', {
      lookupFn: async () => [{ address: '127.0.0.1', family: 4 }],
      fetchFn: async () => {
        fetchCalls += 1;
        throw new Error('fetch should not be called for private IPs');
      },
    }),
    (error: unknown) => error instanceof UnsafeRemoteURLError && /private IP/.test(error.message),
  );

  assert.equal(fetchCalls, 0);
});

test('allows fetching from public addresses', async () => {
  const response = new Response('ok', { status: 200 });
  const result = await fetchWithSsrfProtection('http://example.com', {
    lookupFn: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchFn: async (input) => {
      assert.equal(input, 'http://example.com/');
      return response;
    },
  });

  assert.equal(result.response, response);
  assert.equal(result.finalUrl.hostname, 'example.com');
});

test('rejects redirects that resolve to private IP space', async () => {
  let fetchCount = 0;
  await assert.rejects(
    fetchWithSsrfProtection('http://example.com', {
      lookupFn: async (hostname) => {
        if (hostname === 'example.com') {
          return [{ address: '93.184.216.34', family: 4 }];
        }
        if (hostname === 'internal') {
          return [{ address: '10.0.0.5', family: 4 }];
        }
        throw new Error(`Unexpected hostname: ${hostname}`);
      },
      fetchFn: async (input) => {
        fetchCount += 1;
        if (fetchCount === 1) {
          return new Response(null, {
            status: 301,
            headers: { location: 'http://internal/resource' },
          });
        }
        throw new Error('Should not follow redirect to private host');
      },
    }),
    (error: unknown) => error instanceof UnsafeRemoteURLError,
  );

  assert.equal(fetchCount, 1);
});

test('respects wildcard entries in the allowlist', async () => {
  const response = new Response('ok', { status: 200 });
  const result = await fetchWithSsrfProtection('https://api.service.internal', {
    lookupFn: async () => [{ address: '203.0.113.5', family: 4 }],
    fetchFn: async (input) => {
      assert.equal(input, 'https://api.service.internal/');
      return response;
    },
    allowlist: ['*.service.internal'],
  });

  assert.equal(result.response, response);
  assert.equal(result.finalUrl.hostname, 'api.service.internal');
});

test('blocks requests to unspecified IPv4 addresses', async () => {
  await assert.rejects(
    fetchWithSsrfProtection('http://fake.invalid', {
      lookupFn: async () => [{ address: '0.0.0.0', family: 4 }],
      fetchFn: async () => new Response('should not run'),
    }),
    (error: unknown) => error instanceof UnsafeRemoteURLError && /private IP/.test(error.message),
  );
});

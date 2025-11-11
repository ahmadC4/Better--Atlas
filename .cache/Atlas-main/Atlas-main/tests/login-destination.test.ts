import test from 'node:test';
import assert from 'node:assert/strict';

const { resolveLoginDestination } = await import('../client/src/pages/login.tsx');

test('resolveLoginDestination routes admin users with preference to /admin', () => {
  assert.equal(
    resolveLoginDestination({
      role: 'admin',
      preferences: { lastArea: 'admin' },
    }),
    '/admin',
  );

  assert.equal(
    resolveLoginDestination({
      role: 'super_admin',
      preferences: { lastArea: 'admin' },
    }),
    '/admin',
  );
});

test('resolveLoginDestination keeps users in /app when preference is user or access is missing', () => {
  assert.equal(
    resolveLoginDestination({
      role: 'admin',
      preferences: { lastArea: 'user' },
    }),
    '/app',
  );

  assert.equal(
    resolveLoginDestination({
      role: 'user',
      preferences: { lastArea: 'admin' },
    }),
    '/app',
  );

  assert.equal(
    resolveLoginDestination({}),
    '/app',
  );
});

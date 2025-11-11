import test from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_ROUTES_BY_PATH } from '../shared/adminRoutes.ts';
import { ADMIN_PAGE_ROUTES } from '../client/src/App.tsx';

const sortPaths = (paths: string[]) => paths.slice().sort();

test('every admin route path has a registered page component', () => {
  const configuredPaths = sortPaths(ADMIN_PAGE_ROUTES.map((route) => route.path));
  const catalogPaths = sortPaths(Object.keys(ADMIN_ROUTES_BY_PATH));

  assert.deepEqual(configuredPaths, catalogPaths);
});

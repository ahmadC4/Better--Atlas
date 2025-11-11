import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAdminInventory } from '../scripts/generate-admin-inventory.ts';

test('generateAdminInventory reports OK when page and API handlers exist', () => {
  const catalog = {
    sample: {
      id: 'sample',
      path: '/admin/sample',
      apis: [
        { method: 'GET', path: '/api/admin/sample' },
        { method: 'POST', path: '/api/admin/sample' },
      ],
    },
  } as const;

  const pages = [{ path: '/admin/sample' }];
  const serverSource = "app.get('/api/admin/sample', handler); app.post('/api/admin/sample', handler);";

  const report = generateAdminInventory({
    routeCatalog: catalog,
    pageRoutes: pages,
    serverSource,
  });

  assert.equal(report.sample.page, 'OK');
  assert.equal(report.sample['api.get'], 'OK');
  assert.equal(report.sample['api.post'], 'OK');
});

test('generateAdminInventory highlights missing pages and API handlers', () => {
  const catalog = {
    missing: {
      id: 'missing',
      path: '/admin/missing',
      apis: [
        { method: 'GET', path: '/api/admin/missing' },
        { method: 'POST', path: '/api/admin/missing' },
        { method: 'DELETE', path: '/api/admin/missing/:id' },
      ],
    },
  } as const;

  const serverSource = "app.get('/api/admin/missing', handler);";

  const report = generateAdminInventory({
    routeCatalog: catalog,
    pageRoutes: [],
    serverSource,
  });

  assert.equal(report.missing.page, 'MISSING: /admin/missing');
  assert.equal(report.missing['api.get'], 'OK');
  assert.equal(report.missing['api.post'], 'MISSING: /api/admin/missing');
  assert.equal(
    report.missing['api.delete'],
    'MISSING: /api/admin/missing/:id',
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { requireRole } from '../server/security/roles';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test';

const { MemStorage } = await import('../server/storage');

function createMockResponse() {
  const res: any = {};
  res.statusCode = 200;
  res.body = undefined;
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload: unknown) => {
    res.body = payload;
    return res;
  };
  return res;
}

test('requireRole allows super_admin users', async () => {
  const storage = new MemStorage();
  const [superAdmin] = await storage.listUsers();
  const proPlan = await storage.getPlanBySlug('pro');
  if (!proPlan) {
    throw new Error('Expected pro plan to be seeded');
  }
  assert.equal(superAdmin.planId, proPlan.id);
  assert.equal(superAdmin.plan, proPlan.slug);
  const middleware = requireRole(['super_admin'], storage);

  const req: any = {
    isAuthenticated: () => true,
    session: {},
    user: superAdmin,
  };
  const res = createMockResponse();
  let nextCalled = false;

  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 200);
  assert.ok(nextCalled, 'next should be called for permitted roles');
});

test('requireRole rejects users without required roles', async () => {
  const storage = new MemStorage();
  const freePlan = await storage.getPlanBySlug('free');
  if (!freePlan) {
    throw new Error('Expected free plan to be seeded');
  }
  const user = await storage.createUser({
    username: 'basic-user',
    email: 'basic@example.com',
    password: null,
    plan: 'free',
    proAccessCode: null,
    role: 'user',
  });
  const middleware = requireRole(['admin', 'super_admin'], storage);

  assert.equal(user.planId, freePlan.id);
  assert.equal(user.plan, freePlan.slug);

  const req: any = {
    isAuthenticated: () => true,
    session: {},
    user,
  };
  const res = createMockResponse();
  let nextCalled = false;

  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'Insufficient permissions' });
  assert.equal(nextCalled, false);
});

test('requireRole rejects unauthenticated requests', async () => {
  const storage = new MemStorage();
  const middleware = requireRole(['admin', 'super_admin'], storage);

  const req: any = {
    isAuthenticated: () => false,
    session: {},
  };
  const res = createMockResponse();
  let nextCalled = false;

  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Authentication required' });
  assert.equal(nextCalled, false);
});

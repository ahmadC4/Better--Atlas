import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test';

const { AuthService } = await import('../server/auth-service');
const { MemStorage } = await import('../server/storage');

const createUser = async (storage: MemStorage) => {
  return storage.createUser({
    username: 'tester',
    password: 'hashed-password',
    email: 'tester@example.com',
    avatar: null,
    firstName: null,
    lastName: null,
    profileImageUrl: null,
    plan: 'free',
    proAccessCode: null,
  });
};

test('AuthService.upgradeToProPlan upgrades when code matches', async () => {
  const storage = new MemStorage();
  const service = new AuthService(storage);
  const user = await createUser(storage);
  process.env.PRO_ACCESS_CODE = 'secure-code';

  try {
    const upgraded = await service.upgradeToProPlan(user.id, 'secure-code');
    assert.equal(upgraded, true);
    const updatedUser = await storage.getUser(user.id);
    assert.equal(updatedUser?.plan, 'pro');
  } finally {
    delete process.env.PRO_ACCESS_CODE;
  }
});

test('AuthService.upgradeToProPlan rejects invalid codes', async () => {
  const storage = new MemStorage();
  const service = new AuthService(storage);
  const user = await createUser(storage);
  process.env.PRO_ACCESS_CODE = 'secure-code';

  try {
    await assert.rejects(service.upgradeToProPlan(user.id, 'wrong-code'), /Invalid Pro access code/);
  } finally {
    delete process.env.PRO_ACCESS_CODE;
  }
});

test('AuthService.upgradeToProPlan fails when code not configured', async () => {
  const storage = new MemStorage();
  const service = new AuthService(storage);
  const user = await createUser(storage);
  delete process.env.PRO_ACCESS_CODE;

  await assert.rejects(service.upgradeToProPlan(user.id, 'anything'), /Pro upgrades are currently disabled/);
});

test('AuthService.upgradeToProPlan upgrades using active coupon', async () => {
  const storage = new MemStorage();
  const service = new AuthService(storage);
  const user = await createUser(storage);
  delete process.env.PRO_ACCESS_CODE;

  const coupon = await storage.createProCoupon({
    code: 'team-2024',
    label: 'Team',
    description: 'Team rollout',
    maxRedemptions: 10,
    expiresAt: null,
    isActive: true,
  });

  const upgraded = await service.upgradeToProPlan(user.id, 'team-2024');
  assert.equal(upgraded, true);

  const updatedUser = await storage.getUser(user.id);
  assert.equal(updatedUser?.plan, 'pro');
  assert.equal(updatedUser?.proAccessCode, coupon.code);

  const redemption = await storage.getProCouponRedemption(coupon.id, user.id);
  assert.ok(redemption, 'Redemption record should exist');
});

test('AuthService.upgradeToProPlan rejects when coupon exhausted', async () => {
  const storage = new MemStorage();
  const service = new AuthService(storage);
  delete process.env.PRO_ACCESS_CODE;

  const coupon = await storage.createProCoupon({
    code: 'limited',
    label: 'Limited',
    description: null,
    maxRedemptions: 1,
    expiresAt: null,
    isActive: true,
  });

  const firstUser = await createUser(storage);
  await service.upgradeToProPlan(firstUser.id, 'limited');

  const secondUser = await storage.createUser({
    username: 'second',
    password: 'hashed-password',
    email: 'second@example.com',
    avatar: null,
    firstName: null,
    lastName: null,
    profileImageUrl: null,
    plan: 'free',
    proAccessCode: null,
  });

  await assert.rejects(service.upgradeToProPlan(secondUser.id, 'limited'), /This coupon has reached its redemption limit/);

  const finalCoupon = await storage.getProCouponByCode('limited');
  assert.equal(finalCoupon?.redemptionCount, 1);
});

test('AuthService.hasProPlan returns true for enterprise plans', async () => {
  const storage = new MemStorage();
  const service = new AuthService(storage);

  const enterpriseUser = await storage.createUser({
    username: 'enterprise-user',
    password: 'hashed-password',
    email: 'enterprise@example.com',
    avatar: null,
    firstName: null,
    lastName: null,
    profileImageUrl: null,
    plan: 'enterprise',
    proAccessCode: null,
  });

  const result = await service.hasProPlan(enterpriseUser.id);
  assert.equal(result, true);
});

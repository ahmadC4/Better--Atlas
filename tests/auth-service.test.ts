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
    const proPlan = await storage.getPlanBySlug('pro');
    assert.equal(updatedUser?.planId, proPlan?.id ?? null);
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
  const proPlan = await storage.getPlanBySlug('pro');
  assert.equal(updatedUser?.planId, proPlan?.id ?? null);
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

const createProPlan = async (storage: MemStorage, name = 'Pro'): Promise<string> => {
  const plan = await storage.createPlan({
    name,
    description: `${name} tier`,
    allowExperts: true,
    allowTemplates: true,
    allowModels: true,
    allowKbSystem: false,
    allowKbOrg: false,
    allowKbTeam: false,
    allowKbUser: true,
    allowMemory: true,
    allowAgents: false,
    allowApiAccess: true,
    showExpertsUpsell: false,
    showTemplatesUpsell: false,
    showApiUpsell: false,
    dailyMessageLimit: null,
    maxFileSizeMb: 50,
    storageQuotaGb: 10,
    modelsAllowed: [],
    expertsAllowed: [],
    templatesAllowed: [],
    priceMonthlyUsd: 2000,
    priceAnnualUsd: 20000,
    isActive: true,
  });
  return plan.id;
};

test('AuthService.hasProPlan returns true for planId assignments', async () => {
  const storage = new MemStorage();
  const service = new AuthService(storage);
  const user = await createUser(storage);

  const proPlanId = await createProPlan(storage, 'Launch Pro');
  await storage.updateUser(user.id, { plan: 'free', planId: proPlanId });

  const hasPro = await service.hasProPlan(user.id);
  assert.equal(hasPro, true);

  const limits = await service.getUserLimits(user.id);
  assert.equal(limits.plan, 'pro');

  const capabilities = await service.getEffectiveCapabilities(user.id);
  assert.equal(capabilities.plan.id, proPlanId);
  assert.equal(capabilities.plan.slug, 'launch-pro');
  assert.equal(capabilities.plan.tier, 'pro');
  assert.equal(capabilities.plan.isProTier, true);
});

test('AuthService.requireProPlan allows planId-based users', async () => {
  const storage = new MemStorage();
  const service = new AuthService(storage);
  const user = await createUser(storage);

  const proPlanId = await createProPlan(storage, 'Starter Pro');
  await storage.updateUser(user.id, { plan: 'free', planId: proPlanId });

  const req: any = { session: { userId: user.id } };
  const res: any = {
    statusCode: undefined,
    payload: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.payload = body;
      return this;
    }
  };

  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };

  await service.requireProPlan(req, res, next as any);

  assert.equal(nextCalled, true, 'Middleware should call next for Pro users');
  assert.equal(res.statusCode, undefined, 'Response should not be modified');
  assert.equal(res.payload, undefined, 'No error payload should be sent');
});

test('AuthService.getEffectiveCapabilities aggregates plan data', async () => {
  const storage = new MemStorage();
  const service = new AuthService(storage);
  const user = await createUser(storage);

  const proPlanId = await createProPlan(storage, 'Atlas Pro');
  await storage.updateUser(user.id, { plan: 'free', planId: proPlanId });
  await storage.saveUserPreferences(user.id, {
    personalizationEnabled: 'false',
    customInstructions: null,
    name: null,
    occupation: null,
    bio: null,
    profileImageUrl: null,
    memories: [],
    chatHistoryEnabled: 'true',
    autonomousCodeExecution: 'true',
    pinnedTeamIds: ['team-one', 'team-two'],
  });

  const settings = await storage.getPlatformSettings();
  await storage.upsertPlatformSettings({
    ...settings.data,
    planAllowlists: {
      ...settings.data.planAllowlists,
      pro: { knowledgeBaseHosts: ['pro.example.com'] },
    },
  });

  process.env.KNOWLEDGE_FETCH_HOST_ALLOWLIST = 'docs.example.com';
  try {
    const payload = await service.getEffectiveCapabilities(user.id);
    assert.equal(payload.plan.id, proPlanId);
    assert.equal(payload.plan.name, 'Atlas Pro');
    assert.equal(payload.plan.tier, 'pro');
    assert.equal(payload.plan.slug, 'atlas-pro');
    assert.equal(payload.plan.isProTier, true);
    assert.ok(payload.features.includes('deep-research'));
    assert.equal(payload.featureFlags['deep-research'], true);
    assert.deepEqual(payload.pins.teams, ['team-one', 'team-two']);
    assert.deepEqual(
      payload.allowlists.knowledgeBaseHosts.sort(),
      ['docs.example.com', 'pro.example.com'].sort(),
    );
  } finally {
    delete process.env.KNOWLEDGE_FETCH_HOST_ALLOWLIST;
  }
});

test('AuthService.getEffectiveCapabilities throws for missing user', async () => {
  const storage = new MemStorage();
  const service = new AuthService(storage);
  await assert.rejects(service.getEffectiveCapabilities('missing-user'), /User not found/);
});

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test';

const { MemStorage } = await import('../server/storage');

test('MemStorage.hasAdminUser reflects administrator presence', async () => {
  const storage = new MemStorage();

  assert.equal(await storage.hasAdminUser(), true);

  const user = await storage.createUser({
    username: 'regular',
    password: 'hashed',
    email: 'regular@example.com',
    avatar: null,
    firstName: null,
    lastName: null,
    profileImageUrl: null,
    plan: 'free',
    proAccessCode: null,
    role: 'user',
  });

  const freePlan = await storage.getPlanBySlug('free');
  if (!freePlan) {
    throw new Error('Expected free plan to be seeded');
  }
  assert.equal(user.planId, freePlan.id);
  assert.equal(user.plan, freePlan.slug);

  assert.equal(await storage.hasAdminUser(), true);

  await storage.updateUser(user.id, { role: 'admin' });

  assert.equal(await storage.hasAdminUser(), true);
});

test('MemStorage.updateUserStatus updates persisted status', async () => {
  const storage = new MemStorage();

  const user = await storage.createUser({
    username: 'status-user',
    password: 'hashed',
    email: 'status@example.com',
    avatar: null,
    firstName: 'Status',
    lastName: 'User',
    profileImageUrl: null,
    plan: 'free',
    proAccessCode: null,
    role: 'user',
  });

  assert.equal(user.status, 'active');

  await storage.updateUserStatus(user.id, 'suspended');
  const updated = await storage.getUser(user.id);

  assert.equal(updated?.status, 'suspended');

  await storage.updateUserStatus(user.id, 'deleted');
  const deletedStatus = await storage.getUser(user.id);

  assert.equal(deletedStatus?.status, 'deleted');
});

test('MemStorage template CRUD operations', async () => {
  const storage = new MemStorage();

  const created = await storage.createTemplate({
    name: 'AI onboarding',
    description: 'Welcome pack for new teammates',
    fileId: 'file-123',
    fileName: 'onboarding.pdf',
    mimeType: 'application/pdf',
    fileSize: 1024,
    availableForFree: false,
    availableForPro: true,
    isActive: true,
  });

  assert.equal(created.name, 'AI onboarding');
  assert.equal(created.availableForFree, false);
  assert.equal(created.availableForPro, true);
  assert.equal(created.isActive, true);

  const fetched = await storage.getTemplate(created.id);
  assert.equal(fetched?.id, created.id);

  const listed = await storage.listTemplates();
  assert.equal(listed.length, 1);

  const updated = await storage.updateTemplate(created.id, {
    availableForFree: true,
    isActive: false,
  });

  assert.equal(updated?.availableForFree, true);
  assert.equal(updated?.isActive, false);

  const deleted = await storage.deleteTemplate(created.id);
  assert.equal(deleted, true);

  const afterDelete = await storage.listTemplates();
  assert.equal(afterDelete.length, 0);
});

test('MemStorage output template CRUD operations', async () => {
  const storage = new MemStorage();

  const created = await storage.createOutputTemplate({
    name: 'Executive Brief',
    category: 'executive_brief',
    format: 'markdown',
    description: 'Summarize findings for leaders',
    instructions: 'Keep it concise and action-oriented.',
    requiredSections: [
      { key: 'summary', title: 'Summary' },
      { key: 'actions', title: 'Recommended Actions' },
    ],
    isActive: true,
  });

  assert.equal(created.category, 'executive_brief');
  assert.equal(created.requiredSections.length, 2);

  const fetched = await storage.getOutputTemplate(created.id);
  assert.equal(fetched?.id, created.id);

  const updated = await storage.updateOutputTemplate(created.id, {
    isActive: false,
    requiredSections: [{ key: 'summary', title: 'Summary' }],
  });

  assert.equal(updated?.isActive, false);
  assert.equal(updated?.requiredSections.length, 1);

  const listed = await storage.listOutputTemplates();
  assert.equal(listed.length, 1);

  const deleted = await storage.deleteOutputTemplate(created.id);
  assert.equal(deleted, true);

  const afterDelete = await storage.listOutputTemplates();
  assert.equal(afterDelete.length, 0);
});

test('MemStorage tool policy CRUD operations', async () => {
  const storage = new MemStorage();

  const created = await storage.createToolPolicy({
    provider: 'openai',
    toolName: 'web_search',
    isEnabled: false,
    safetyNote: 'Temporarily disabled while legal reviews data sources.',
  });

  assert.equal(created.provider, 'openai');
  assert.equal(created.toolName, 'web_search');
  assert.equal(created.isEnabled, false);
  assert.equal(created.safetyNote, 'Temporarily disabled while legal reviews data sources.');

  const listed = await storage.listToolPolicies();
  assert.equal(listed.length, 1);

  const byProvider = await storage.listToolPoliciesByProvider('openai');
  assert.equal(byProvider.length, 1);

  const updated = await storage.updateToolPolicy(created.id, {
    isEnabled: true,
    safetyNote: null,
  });

  assert.equal(updated?.isEnabled, true);
  assert.equal(updated?.safetyNote, null);

  await assert.rejects(
    storage.createToolPolicy({ provider: 'openai', toolName: 'web_search', isEnabled: true }),
    /TOOL_POLICY_CONFLICT/,
  );

  const deleted = await storage.deleteToolPolicy(created.id);
  assert.equal(deleted, true);

  const afterDelete = await storage.listToolPolicies();
  assert.equal(afterDelete.length, 0);
});

test('MemStorage admin audit logs capture chronological events', async () => {
  const storage = new MemStorage();

  const user = await storage.createUser({
    username: 'audit-user',
    password: 'hashed',
    email: 'audit@example.com',
    avatar: null,
    firstName: 'Audit',
    lastName: 'User',
    profileImageUrl: null,
    plan: 'free',
    proAccessCode: null,
    role: 'user',
  });

  await storage.createAdminAuditLog({
    action: 'user.status.changed',
    targetUserId: user.id,
    actorUserId: null,
    metadata: { from: 'active', to: 'suspended' },
  });

  await new Promise(resolve => setTimeout(resolve, 5));

  await storage.createAdminAuditLog({
    action: 'user.plan.changed',
    targetUserId: user.id,
    actorUserId: 'admin-1',
    metadata: { from: 'free', to: 'pro' },
  });

  const logs = await storage.listAdminAuditLogsForUser(user.id);
  assert.equal(logs.length, 2);
  assert.equal(logs[0].action, 'user.plan.changed');
  assert.equal(logs[0].actorUserId, 'admin-1');
  assert.deepEqual(logs[0].metadata, { from: 'free', to: 'pro' });

  const limited = await storage.listAdminAuditLogsForUser(user.id, 1);
  assert.equal(limited.length, 1);
  assert.equal(limited[0].action, 'user.plan.changed');
});

test('MemStorage system prompt versioning keeps a single active prompt', async () => {
  const storage = new MemStorage();

  const initialPrompts = await storage.listSystemPrompts();
  assert.equal(initialPrompts.length, 1);
  assert.equal(initialPrompts[0].isActive, true);

  const created = await storage.createSystemPrompt({
    content: 'You are the upgraded Atlas AI.',
    label: 'v2',
    notes: 'First revision',
    createdByUserId: 'admin-1',
    activate: false,
  });

  assert.equal(created.version, 2);
  assert.equal(created.isActive, false);

  const activated = await storage.activateSystemPrompt(created.id, 'admin-1');
  assert.equal(activated?.isActive, true);
  assert.equal(activated?.activatedByUserId, 'admin-1');

  const prompts = await storage.listSystemPrompts();
  assert.equal(prompts.filter((prompt) => prompt.isActive).length, 1);
  const legacyPrompt = prompts.find((prompt) => prompt.version === 1);
  assert.equal(legacyPrompt?.isActive, false);
});

test('MemStorage release lifecycle publishes new system prompt', async () => {
  const storage = new MemStorage();

  const prompt = await storage.createSystemPrompt({
    content: 'Release prompt',
    label: 'release',
    createdByUserId: 'admin-1',
    activate: false,
  });

  const release = await storage.createRelease({
    label: 'Release A',
    systemPromptId: prompt.id,
    expertIds: [],
    templateIds: [],
    outputTemplateIds: [],
    toolPolicyIds: [],
    changeNotes: 'Initial draft',
  });

  assert.equal(release.status, 'draft');

  const published = await storage.publishRelease(release.id, {
    changeNotes: 'Go live',
    actorUserId: 'admin-1',
  });

  assert.ok(published);
  assert.equal(published?.status, 'active');

  const activeRelease = await storage.getActiveRelease();
  assert.equal(activeRelease?.id, release.id);

  const activePrompt = await storage.getActiveSystemPrompt();
  assert.equal(activePrompt?.id, prompt.id);
});

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test';

const { MemStorage } = await import('../server/storage');
const { defaultPlatformSettings } = await import('../shared/schema');

test('MemStorage returns seeded platform settings', async () => {
  const storage = new MemStorage();
  const settings = await storage.getPlatformSettings();

  assert.equal(settings.id, 'global');
  assert.deepEqual(settings.data, defaultPlatformSettings);
});

test('MemStorage upsert persists new settings', async () => {
  const storage = new MemStorage();
  const original = await storage.getPlatformSettings();

  const updatedData = structuredClone(original.data);
  updatedData.planTiers.free.messageLimitPerDay = 25;
  updatedData.apiProviders.openai.enabled = false;

  const updated = await storage.upsertPlatformSettings(updatedData);
  assert.equal(updated.data.planTiers.free.messageLimitPerDay, 25);
  assert.equal(updated.data.apiProviders.openai.enabled, false);

  const fetched = await storage.getPlatformSettings();
  assert.equal(fetched.data.planTiers.free.messageLimitPerDay, 25);
  assert.equal(fetched.data.apiProviders.openai.enabled, false);
});

test('Legacy platform settings merge in defaults without throwing', async () => {
  const storage = new MemStorage();
  const legacyData = {
    planTiers: {
      free: {
        messageLimitPerDay: 10,
        allowedModels: ['compound'],
        features: [],
      },
      pro: {
        messageLimitPerDay: null,
        allowedModels: ['gpt-5', 'compound'],
        features: [],
      },
    },
    knowledgeBase: {
      enabled: true,
      maxItems: 100,
      maxStorageMb: 512,
      allowUploads: false,
    },
    memory: {
      enabled: true,
      maxMemoriesPerUser: 250,
      retentionDays: null,
    },
    aiAgents: {
      enabled: true,
      maxAgentsPerUser: 5,
      allowAutonomousExecution: false,
    },
    templates: {
      enabled: true,
      maxTemplatesPerUser: 15,
    },
    projects: {
      enabled: true,
      maxProjectsPerUser: 8,
      maxMembersPerProject: 3,
    },
    apiProviders: {
      openai: {
        enabled: true,
        defaultApiKey: null,
        allowUserProvidedKeys: true,
        allowedModels: ['gpt-5'],
        dailyRequestLimit: 0,
      },
    },
    legacyModels: ['gpt-4'],
  };

  (storage as any).platformSettings = {
    id: 'global',
    data: legacyData,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };

  const settings = await storage.getPlatformSettings();

  assert.equal(settings.data.apiProviders.openai.dailyRequestLimit, null);
  assert.deepEqual(settings.data.planTiers.enterprise, defaultPlatformSettings.planTiers.enterprise);
  assert.equal(
    settings.data.planTiers.free.fileUploadLimitMb,
    defaultPlatformSettings.planTiers.free.fileUploadLimitMb,
  );
  assert.equal(settings.data.planTiers.pro.chatHistoryEnabled, true);
  assert.ok(settings.data.apiProviders.anthropic);
  assert.deepEqual(settings.data.apiProviders.openai.allowedModels, ['gpt-5']);
  assert.deepEqual(settings.data.apiProviders.openai.platformKeyAllowedModels, ['gpt-5']);
  assert.deepEqual(settings.data.legacyModels, ['gpt-4']);
});

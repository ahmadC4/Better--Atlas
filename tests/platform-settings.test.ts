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

test('MemStorage merges defaults for missing settings fields', async () => {
  const storage = new MemStorage();
  const internal = (storage as any).platformSettings;
  const partialData = {
    planTiers: {
      free: {
        messageLimitPerDay: 10,
      },
    },
    memory: {
      enabled: false,
    },
    apiProviders: {
      openai: {
        enabled: false,
        allowedModels: ['gpt-5'],
      },
      custom: {
        enabled: true,
        defaultApiKey: 'secret',
        allowUserProvidedKeys: false,
        allowedModels: ['custom-model'],
        dailyRequestLimit: null,
        platformKeyAllowedModels: ['custom-model'],
      },
    },
  };

  (storage as any).platformSettings = {
    ...internal,
    data: partialData,
  };

  const settings = await storage.getPlatformSettings();

  assert.equal(settings.data.memory.enabled, false);
  assert.equal(
    settings.data.memory.maxMemoriesPerUser,
    defaultPlatformSettings.memory.maxMemoriesPerUser,
  );
  assert.equal(settings.data.planTiers.free.messageLimitPerDay, 10);
  assert.equal(
    settings.data.planTiers.free.fileUploadLimitMb,
    defaultPlatformSettings.planTiers.free.fileUploadLimitMb,
  );
  assert.equal(settings.data.knowledgeBase.enabled, defaultPlatformSettings.knowledgeBase.enabled);
  assert.equal(settings.data.apiProviders.openai.enabled, false);
  assert.equal(
    settings.data.apiProviders.openai.allowUserProvidedKeys,
    defaultPlatformSettings.apiProviders.openai.allowUserProvidedKeys,
  );
  assert.deepEqual(settings.data.apiProviders.openai.allowedModels, ['gpt-5']);
  assert.ok(settings.data.apiProviders.custom);
  assert.equal(settings.data.apiProviders.custom.enabled, true);
});

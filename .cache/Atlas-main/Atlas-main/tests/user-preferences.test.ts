import test from 'node:test';
import assert from 'node:assert/strict';

import type { InsertUserPreferences } from '@shared/schema';

process.env.DATABASE_URL ??= 'postgres://user:pass@localhost:5432/atlas';

const storageModulePromise = import('../server/storage');

test('user preferences default lastArea to user', async () => {
  const { MemStorage } = await storageModulePromise;
  const storage = new MemStorage();
  const userId = 'user-default-area';

  const created = await storage.saveUserPreferences(userId, {
    userId,
    personalizationEnabled: 'true',
    customInstructions: null,
    name: 'Example',
    occupation: 'Engineer',
    bio: null,
    profileImageUrl: null,
    memories: [],
    chatHistoryEnabled: 'true',
    autonomousCodeExecution: 'true',
  } as InsertUserPreferences);

  assert.equal(created.lastArea, 'user');
});

test('lastArea persists across updates and is not cleared when omitted', async () => {
  const { MemStorage } = await storageModulePromise;
  const storage = new MemStorage();
  const userId = 'user-update-area';

  await storage.saveUserPreferences(userId, {
    userId,
    personalizationEnabled: 'false',
    customInstructions: null,
    name: 'Initial',
    occupation: null,
    bio: null,
    profileImageUrl: null,
    memories: [],
    chatHistoryEnabled: 'true',
    autonomousCodeExecution: 'true',
    lastArea: 'user',
  } as InsertUserPreferences);

  const adminPrefs = await storage.saveUserPreferences(userId, {
    userId,
    personalizationEnabled: 'false',
    customInstructions: null,
    name: 'Initial',
    occupation: null,
    bio: null,
    profileImageUrl: null,
    memories: [],
    chatHistoryEnabled: 'true',
    autonomousCodeExecution: 'true',
    lastArea: 'admin',
  } as InsertUserPreferences);

  assert.equal(adminPrefs.lastArea, 'admin');

  const unchanged = await storage.saveUserPreferences(userId, {
    userId,
    personalizationEnabled: 'false',
    customInstructions: null,
    name: 'Initial',
    occupation: null,
    bio: null,
    profileImageUrl: null,
    memories: [],
    chatHistoryEnabled: 'true',
    autonomousCodeExecution: 'true',
  } as InsertUserPreferences);

  assert.equal(unchanged.lastArea, 'admin');
});

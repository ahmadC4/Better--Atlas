import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test';

const { assembleRequest } = await import('../server/prompt-engine');
const { MemStorage } = await import('../server/storage');
const { DEFAULT_SYSTEM_PROMPT } = await import('../server/system-prompts');

test('assembleRequest falls back to the default system prompt', async () => {
  const messages = await assembleRequest({ messages: [] });
  assert.equal(messages[0]?.role, 'system');
  assert.equal(messages[0]?.content, DEFAULT_SYSTEM_PROMPT);
});

test('assembleRequest uses the active prompt and appends additional instructions', async () => {
  const storage = new MemStorage();
  const prompt = await storage.createSystemPrompt({
    content: 'Custom Atlas instructions.',
    label: 'v2',
    createdByUserId: 'admin-1',
    activate: false,
  });

  const release = await storage.createRelease({
    label: 'Release v2',
    systemPromptId: prompt.id,
    expertIds: [],
    templateIds: [],
    outputTemplateIds: [],
    toolPolicyIds: [],
    changeNotes: 'Promote new prompt',
  });

  await storage.publishRelease(release.id, {
    changeNotes: 'Publishing new prompt',
    actorUserId: 'admin-1',
  });

  const result = await assembleRequest({
    storage,
    systemPrompt: 'Always respond cheerfully.',
    messages: [{ role: 'user', content: 'Hi' }],
  });

  assert.equal(result[0]?.role, 'system');
  assert.ok(result[0]?.content.startsWith('Custom Atlas instructions.'));
  assert.ok(result[0]?.content.includes('Always respond cheerfully.'));
  assert.equal(result[1]?.role, 'user');
});

test('assembleRequest inserts task summary after expert layer', async () => {
  const result = await assembleRequest({
    messages: [{ role: 'user', content: 'Ping' }],
    expertPrompt: 'Expert guidance here.',
    taskPrompt: 'Goal: Summarize the document concisely.',
  });

  assert.equal(result[0]?.role, 'system');
  assert.equal(result[1]?.role, 'system');
  assert.equal(result[1]?.content, 'Expert guidance here.');
  assert.equal(result[2]?.role, 'system');
  assert.equal(result[2]?.content, 'Goal: Summarize the document concisely.');
  assert.equal(result[3]?.role, 'user');
});

test('assembleRequest inserts profile prompt after task layer', async () => {
  const result = await assembleRequest({
    systemPrompt: 'Remember to cite sources.',
    expertPrompt: 'Expert perspective.',
    taskPrompt: 'Goal: Draft a response.',
    profilePrompt: 'User prefers concise answers.',
    messages: [{ role: 'user', content: 'Hello' }],
  });

  assert.equal(result[0]?.role, 'system');
  assert.ok(result[0]?.content.includes('Remember to cite sources.'));
  assert.equal(result[1]?.content, 'Expert perspective.');
  assert.equal(result[2]?.content, 'Goal: Draft a response.');
  assert.equal(result[3]?.content, 'User prefers concise answers.');
  assert.equal(result[4]?.role, 'user');
});

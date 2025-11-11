import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test';

const { MemStorage } = await import('../server/storage');

test('MemStorage tracks usage metrics per user and model', async () => {
  const storage = new MemStorage();
  const userId = randomUUID();
  const chatA = randomUUID();
  const chatB = randomUUID();

  await storage.createUsageMetric({
    userId,
    chatId: chatA,
    model: 'gpt-5',
    promptTokens: '120',
    completionTokens: '80',
    totalTokens: '200',
  });

  await storage.createUsageMetric({
    userId,
    chatId: chatB,
    model: 'gpt-5-mini',
    promptTokens: '60',
    completionTokens: '90',
    totalTokens: '150',
  });

  const metrics = await storage.getUserUsageMetrics(userId);
  assert.equal(metrics.length, 2);

  const totalTokens = metrics.reduce((acc, metric) => acc + Number(metric.totalTokens), 0);
  assert.equal(totalTokens, 350);

  const dateInFuture = new Date(Date.now() + 60_000);
  const filtered = await storage.getUserUsageMetrics(userId, dateInFuture);
  assert.equal(filtered.length, 0);
});

test('MemStorage filters usage metrics per chat', async () => {
  const storage = new MemStorage();
  const userId = randomUUID();
  const chatId = randomUUID();

  await storage.createUsageMetric({
    userId,
    chatId,
    model: 'sonar-pro',
    promptTokens: '30',
    completionTokens: '45',
    totalTokens: '75',
  });

  await storage.createUsageMetric({
    userId,
    chatId,
    model: 'sonar-pro',
    promptTokens: '10',
    completionTokens: '15',
    totalTokens: '25',
  });

  const metrics = await storage.getChatUsageMetrics(chatId);
  assert.equal(metrics.length, 2);
  assert(metrics.every(metric => metric.chatId === chatId));
});

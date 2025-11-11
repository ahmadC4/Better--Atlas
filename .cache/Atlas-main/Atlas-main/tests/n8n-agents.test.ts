import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test';

const { MemStorage } = await import('../server/storage');

test('MemStorage can create and update N8N agents', async () => {
  const storage = new MemStorage();

  const created = await storage.createN8nAgent('user-1', {
    workflowId: 'workflow-123',
    name: 'Daily Research Agent',
    description: 'Runs a daily research automation.',
    status: 'active',
    webhookUrl: 'https://example.com/webhook',
    metadata: { tags: ['daily', 'research'] },
  });

  assert.ok(created.id);
  assert.equal(created.status, 'active');
  assert.equal((created.metadata as any)?.tags?.length, 2);

  const fetched = await storage.getN8nAgents('user-1');
  assert.equal(fetched.length, 1);
  assert.equal(fetched[0].id, created.id);

  const updated = await storage.createN8nAgent('user-1', {
    workflowId: 'workflow-123',
    name: 'Updated Research Agent',
    status: 'inactive',
  });

  assert.equal(updated.id, created.id);
  assert.equal(updated.name, 'Updated Research Agent');
  assert.equal(updated.status, 'inactive');
  assert.equal((updated.metadata as any)?.tags?.length, 2);

  const fetchedAgain = await storage.getN8nAgents('user-1');
  assert.equal(fetchedAgain.length, 1);
  assert.equal(fetchedAgain[0].name, 'Updated Research Agent');
  assert.equal(fetchedAgain[0].status, 'inactive');
});

test('MemStorage deleteN8nAgent enforces ownership', async () => {
  const storage = new MemStorage();

  const created = await storage.createN8nAgent('user-2', {
    workflowId: 'workflow-xyz',
    name: 'Outbound Agent',
  });

  const deletedByOwner = await storage.deleteN8nAgent('user-2', created.id);
  assert.equal(deletedByOwner, true);

  const createdAgain = await storage.createN8nAgent('user-3', {
    workflowId: 'workflow-xyz',
    name: 'Outbound Agent 2',
  });

  const deletedByOther = await storage.deleteN8nAgent('user-2', createdAgain.id);
  assert.equal(deletedByOther, false);
});

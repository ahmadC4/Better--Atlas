import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test';

const { InMemoryFileStorage, FileQuotaExceededError } = await import('../server/storage/file-store');
const { MemStorage } = await import('../server/storage');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('InMemoryFileStorage stores and retrieves files within TTL', async () => {
  const storage = new InMemoryFileStorage({ ttlMs: 1000, quotaBytes: 1024 * 1024 });
  const record = await storage.put({
    ownerId: 'user-1',
    buffer: Buffer.from('test'),
    name: 'test.txt',
    mimeType: 'text/plain',
  });

  const retrieved = await storage.get(record.id);
  assert.equal(retrieved?.buffer.toString(), 'test');
});

test('InMemoryFileStorage expires files after TTL', async () => {
  const storage = new InMemoryFileStorage({ ttlMs: 10, quotaBytes: 1024 * 1024 });
  const record = await storage.put({
    ownerId: 'user-1',
    buffer: Buffer.from('test'),
    name: 'expire.txt',
    mimeType: 'text/plain',
  });

  await sleep(20);

  const retrieved = await storage.get(record.id);
  assert.equal(retrieved, undefined);
});

test('InMemoryFileStorage enforces per-user quotas', async () => {
  const storage = new InMemoryFileStorage({ ttlMs: 1000, quotaBytes: 16 });
  await storage.put({
    ownerId: 'user-1',
    buffer: Buffer.from('12345678'),
    name: 'fits.txt',
    mimeType: 'text/plain',
  });

  await assert.rejects(
    storage.put({
      ownerId: 'user-1',
      buffer: Buffer.from('1234567890'),
      name: 'too-big.txt',
      mimeType: 'text/plain',
    }),
    FileQuotaExceededError,
  );
});

test('MemStorage restricts file retrieval to the owner', async () => {
  const storage = new MemStorage();
  const attachment = await storage.saveFile(
    'owner-1',
    Buffer.from('secret'),
    'secret.txt',
    'text/plain',
  );

  const ownedFile = await storage.getFileForUser(attachment.id, 'owner-1');
  assert.ok(ownedFile);

  const foreignFile = await storage.getFileForUser(attachment.id, 'owner-2');
  assert.equal(foreignFile, undefined);
});

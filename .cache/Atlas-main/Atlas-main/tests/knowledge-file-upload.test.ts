import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { formatFileUploadLimitLabel, PLAN_LABELS } from '@shared/schema';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import type { UserPlan } from '@shared/schema';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';

const knowledgeItems: any[] = [];
const authenticatedUser = { id: 'user-1', plan: 'pro' };

const { storage } = await import('../server/storage');
const { fileAnalysisService } = await import('../server/file-analysis');
const { validateUploadSizeForPlan } = await import('../server/routes');

mock.method(storage, 'getUser', async () => authenticatedUser as any);

mock.method(storage, 'createKnowledgeItem', async (item: any) => {
  const record = {
    ...item,
    id: `knowledge-${knowledgeItems.length + 1}`,
    createdAt: new Date().toISOString(),
  };
  knowledgeItems.push(record);
  return record;
});

mock.method(storage, 'getKnowledgeItems', async (userId: string) => {
  return knowledgeItems.filter(item => item.userId === userId);
});

mock.method(fileAnalysisService, 'analyzeFile', async () => ({
  content: 'Decoded content from test file',
  metadata: { language: 'en' },
  summary: 'Summary',
}));

test('uploads a knowledge base file and lists it', async (t) => {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: false, limit: '10mb' }));
  app.use(cookieParser());
  app.use((req, _res, next) => {
    (req as any).user = authenticatedUser;
    next();
  });

  const originalSettingsData = structuredClone((await storage.getPlatformSettings()).data);
  t.after(async () => {
    await storage.upsertPlatformSettings(originalSettingsData);
  });

  const fileUploadSchema = z.object({
    name: z.string().min(1).max(255),
    mimeType: z.string().min(1),
    data: z.string(),
  });

  app.post('/api/knowledge/file', async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const { name, mimeType, data } = fileUploadSchema.parse(req.body);
      const buffer = Buffer.from(data, 'base64');

      const plan: UserPlan = authenticatedUser.plan as UserPlan;
      const uploadValidation = validateUploadSizeForPlan(plan, buffer.length);
      if (uploadValidation) {
        return res.status(uploadValidation.status).json({ error: uploadValidation.message });
      }

      const analysisResult = await fileAnalysisService.analyzeFile(buffer, name, mimeType);
      const knowledgeItem = await storage.createKnowledgeItem({
        userId,
        type: 'file',
        title: name,
        content: analysisResult.content,
        fileName: name,
        fileType: mimeType,
        fileSize: buffer.length.toString(),
        metadata: {
          ...analysisResult.metadata,
          summary: analysisResult.summary,
        },
      });

      res.json(knowledgeItem);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid file data', details: error.errors });
      }
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/knowledge', async (req, res) => {
    const userId = (req as any).user.id;
    const items = await storage.getKnowledgeItems(userId);
    res.json(items);
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));

  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(() => {
    knowledgeItems.length = 0;
    server.close();
  });

  const fileData = Buffer.from('Hello knowledge base!').toString('base64');
  const uploadRes = await fetch(`${baseUrl}/api/knowledge/file`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'sample.txt',
      mimeType: 'text/plain',
      data: fileData,
    }),
  });

  assert.equal(uploadRes.status, 200, 'upload should succeed');
  const createdItem = await uploadRes.json();
  assert.equal(createdItem.title, 'sample.txt');
  assert.equal(createdItem.fileType, 'text/plain');
  assert.equal(createdItem.type, 'file');

  const listRes = await fetch(`${baseUrl}/api/knowledge`);
  assert.equal(listRes.status, 200, 'list request should succeed');
  const items = await listRes.json();
  assert.equal(Array.isArray(items), true, 'items should be an array');
  assert.equal(items.length, 1, 'uploaded item should be returned');
  assert.equal(items[0].title, 'sample.txt');

  const updatedSettings = structuredClone(originalSettingsData);
  updatedSettings.planTiers.pro.fileUploadLimitMb = 1;
  await storage.upsertPlatformSettings(updatedSettings);

  const largeBuffer = Buffer.alloc(1 * 1024 * 1024 + 1, 'a');
  const largeUploadRes = await fetch(`${baseUrl}/api/knowledge/file`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'large.txt',
      mimeType: 'text/plain',
      data: largeBuffer.toString('base64'),
    }),
  });

  assert.equal(largeUploadRes.status, 413, 'oversized upload should be rejected');
  const errorBody = await largeUploadRes.json();
  assert.equal(
    errorBody.error,
    `File too large. Maximum size is ${formatFileUploadLimitLabel(1)} for ${PLAN_LABELS.pro} users.`,
  );
});

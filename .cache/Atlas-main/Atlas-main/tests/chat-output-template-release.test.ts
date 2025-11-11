import test from 'node:test';
import assert from 'node:assert/strict';
import type { OutputTemplate, Release } from '@shared/schema';
import type { IStorage } from '../server/storage';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test';

const { createPrepareChatCompletionRequest } = await import('../server/routes');

const noopDate = new Date();

test('rejects chat request when output template is not allowed by active release', async () => {
  const template: OutputTemplate = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Test Template',
    category: 'general',
    description: null,
    format: 'markdown',
    instructions: null,
    requiredSections: [],
    isActive: true,
    createdAt: noopDate,
    updatedAt: noopDate,
  };

  const release: Release = {
    id: '22222222-2222-4222-8222-222222222222',
    version: 1,
    label: 'v1',
    status: 'active',
    changeNotes: null,
    systemPromptId: null,
    expertIds: [],
    templateIds: [],
    outputTemplateIds: ['33333333-3333-4333-8333-333333333333'],
    toolPolicyIds: [],
    isActive: true,
    publishedAt: noopDate,
    publishedByUserId: null,
    createdAt: noopDate,
    updatedAt: noopDate,
  };

  const storageStub: Pick<IStorage, 'getChat' | 'getFileForUser' | 'getOutputTemplate' | 'getActiveRelease'> = {
    async getChat() {
      return undefined;
    },
    async getFileForUser() {
      return undefined;
    },
    async getOutputTemplate(id: string) {
      return id === template.id ? template : undefined;
    },
    async getActiveRelease() {
      return release;
    },
  };

  const prepare = createPrepareChatCompletionRequest({
    storage: storageStub,
    authService: {
      async checkRateLimit() {
        return { allowed: true, remaining: 1, limit: 100 };
      },
    },
  });

  const request = {
    body: {
      model: 'compound',
      messages: [{ role: 'user', content: 'Hello' }],
      metadata: { outputTemplateId: template.id },
    },
    user: { id: 'user-1', plan: 'pro' },
  } as any;

  await assert.rejects(
    () => prepare(request),
    (error: any) => {
      assert.equal(error?.status, 400);
      assert.equal(error?.message, 'Selected output template is not available');
      return true;
    },
  );
});

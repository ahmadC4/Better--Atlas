import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test';

const { AIService } = await import('../server/ai-service');
const { MemStorage } = await import('../server/storage');
import type { ToolPolicy } from '@shared/schema';

test('AIService tool policy helpers prepend notices and enforce disabled tools', () => {
  const storage = new MemStorage();
  const service = new AIService(storage as any);

  const privateHelpers = service as unknown as {
    buildToolPolicyMap: (policies: ToolPolicy[]) => Map<string, ToolPolicy>;
    prependToolPolicyNotice: (
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
      map: Map<string, ToolPolicy>,
    ) => Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    isToolEnabled: (toolName: string, map: Map<string, ToolPolicy>) => boolean;
    buildToolBlockedMessage: (content: string | null | undefined, toolName: string) => string;
  };

  const now = new Date();
  const policies: ToolPolicy[] = [
    {
      id: 'policy-1',
      provider: 'openai',
      toolName: 'web_search',
      isEnabled: false,
      safetyNote: 'Use internal research dashboard when you need web data.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'policy-2',
      provider: 'openai',
      toolName: 'python_execute',
      isEnabled: true,
      safetyNote: 'Double-check code execution outputs before sharing with users.',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const map = privateHelpers.buildToolPolicyMap(policies);

  assert.strictEqual(privateHelpers.isToolEnabled('web_search', map), false);
  assert.strictEqual(privateHelpers.isToolEnabled('python_execute', map), true);
  assert.strictEqual(
    privateHelpers.isToolEnabled('file_upload', map),
    true,
    'tools without explicit policy remain enabled',
  );

  const userMessages = [{ role: 'user' as const, content: 'Hello there' }];
  const decorated = privateHelpers.prependToolPolicyNotice(userMessages.slice(), map);

  assert.strictEqual(decorated.length, 2, 'notice should prepend a system message');
  assert.strictEqual(decorated[0].role, 'system');
  assert.ok(
    decorated[0].content.includes('web_search') && decorated[0].content.includes('disabled'),
    'system notice highlights disabled tools',
  );
  assert.ok(
    decorated[0].content.includes('python_execute') && decorated[0].content.includes('Double-check code execution outputs'),
    'system notice includes safety note guidance',
  );
  assert.deepEqual(decorated[1], userMessages[0], 'original message order preserved after notice prepend');

  const alreadyPrefixed = privateHelpers.prependToolPolicyNotice(userMessages, new Map());
  assert.strictEqual(alreadyPrefixed, userMessages, 'no policies should return the original message array reference');

  const blockedMessageWithContent = privateHelpers.buildToolBlockedMessage('Existing answer', 'web_search');
  assert.match(blockedMessageWithContent, /Existing answer/);
  assert.match(blockedMessageWithContent, /web_search/);

  const blockedMessageWithoutContent = privateHelpers.buildToolBlockedMessage('', 'python_execute');
  assert.strictEqual(blockedMessageWithoutContent, '[Tool use blocked by administrator policy: python_execute]');
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { AIService } from '../server/ai-service.ts';

const voiceSentences = ['Hello world.', 'Next sentence?'];

const groqChunks = ['Hello', ' world.', ' Next', ' sentence?'];

await test('streamGroqCompletion yields text and voice deltas per sentence', async () => {
  const requestedClauses: string[] = [];
  const storedClips: Array<{ ownerId: string; name: string; mimeType: string }> = [];

  const storageStub: any = {
    saveFile: async (
      ownerId: string,
      buffer: Buffer,
      name: string,
      mimeType: string,
    ) => {
      storedClips.push({ ownerId, name, mimeType });
      return {
        id: 'file-' + name,
        name,
        mimeType,
        size: buffer.byteLength,
        url: `/files/${name}`,
      };
    },
  };

  const service: any = new AIService(storageStub, {
    createGroqClient: () => ({
      chat: {
        completions: {
          create: async () =>
            (async function* () {
              for (const content of groqChunks) {
                yield { choices: [{ delta: { content } }] };
              }
            })(),
        },
      },
    }),
    synthesizeClauses: async (clauses: Array<{ text: string; id?: string }>) => {
      clauses.forEach(clause => requestedClauses.push(clause.text));
      return clauses.map((clause, index) => {
        const audio = Buffer.from(`audio-${index + 1}`);
        return {
          clipId: clause.id ?? `clip-${index + 1}`,
          audio,
          mimeType: 'audio/mpeg',
          durationMs: 500,
          sizeBytes: audio.byteLength,
          text: clause.text,
        };
      });
    },
  });

  const stream = (service as any).streamGroqCompletion(
    [{ role: 'user', content: 'Hello world' }],
    {
      id: 'test-model',
      apiModel: 'test-model',
      provider: 'groq',
      apiKeyEnvVar: 'GROQ_API_KEY',
      supportsStreaming: true,
      supportsWebSearch: false,
      supportsThinking: false,
      supportsCodeInterpreter: false,
    },
    {
      messages: [],
      model: 'test-model',
      userId: 'user-1',
      metadata: { voiceMode: true },
    },
    'fake-key',
    new Map(),
  );

  const deltas: Array<{ text?: string; audioChunk?: { text: string } }> = [];

  for await (const delta of stream) {
    deltas.push(delta);
  }

  const textParts = deltas.filter(delta => delta.text).map(delta => delta.text);
  assert.deepEqual(textParts, groqChunks, 'text deltas should mirror Groq chunks');

  assert.deepEqual(requestedClauses, voiceSentences, 'Play.ai should receive complete sentences');

  const audioTexts = deltas
    .filter(delta => delta.audioChunk)
    .map(delta => delta.audioChunk?.text);
  assert.deepEqual(audioTexts, voiceSentences, 'audio chunks should align with sentences');

  assert.equal(storedClips.length, 2, 'voice clips should be stored for each clause');
  const audioUrls = deltas
    .filter(delta => delta.audioChunk)
    .map(delta => delta.audioChunk?.audioUrl);
  assert.deepEqual(
    audioUrls,
    ['/files/groq-clause-1.mp3', '/files/groq-clause-2.mp3'],
    'audio chunks should include persisted URLs',
  );
});

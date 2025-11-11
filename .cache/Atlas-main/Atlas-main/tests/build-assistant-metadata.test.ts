import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAssistantMetadata } from '../server/chat-metadata.ts';

await test('buildAssistantMetadata merges voice metadata', () => {
  const metadata = buildAssistantMetadata({
    baseMetadata: { voiceMode: true },
    voiceClips: [
      {
        clipId: 'clip-1',
        mimeType: 'audio/mpeg',
        durationMs: 1500,
        sizeBytes: 4096,
        text: 'Hello world.',
      },
    ],
  });

  assert.ok(metadata, 'metadata should be returned');
  assert.equal((metadata as any).voiceMode, true);
  assert.deepEqual((metadata as any).audioClips, [
    {
      clipId: 'clip-1',
      mimeType: 'audio/mpeg',
      durationMs: 1500,
      sizeBytes: 4096,
      audioUrl: undefined,
      text: 'Hello world.',
    },
  ]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { handleVoiceChunk, type VoiceClipMetadataSummary } from '../server/voice-stream.ts';

await test('handleVoiceChunk emits SSE events and tracks metadata', () => {
  const events: Array<{ event: string; data: Record<string, unknown> }> = [];
  const sendEvent = (event: string, data: Record<string, unknown>) => {
    events.push({ event, data });
  };
  const metadata: VoiceClipMetadataSummary[] = [];

  handleVoiceChunk(sendEvent, {
    clipId: 'clip-123',
    mimeType: 'audio/mpeg',
    data: 'base64-data',
    durationMs: 1200,
    sizeBytes: 2048,
    audioUrl: '/api/files/clip-123',
    text: 'Hello world.',
  }, metadata);

  assert.equal(events.length, 2, 'expected chunk and end events');
  assert.deepEqual(events[0], {
    event: 'voice_chunk',
    data: {
      clipId: 'clip-123',
      mimeType: 'audio/mpeg',
      data: 'base64-data',
      durationMs: 1200,
      sizeBytes: 2048,
      audioUrl: '/api/files/clip-123',
      text: 'Hello world.',
    },
  });

  assert.deepEqual(events[1], {
    event: 'voice_end',
    data: {
      clipId: 'clip-123',
      mimeType: 'audio/mpeg',
      durationMs: 1200,
      sizeBytes: 2048,
      text: 'Hello world.',
    },
  });

  assert.deepEqual(metadata, [
    {
      clipId: 'clip-123',
      mimeType: 'audio/mpeg',
      durationMs: 1200,
      sizeBytes: 2048,
      audioUrl: '/api/files/clip-123',
      text: 'Hello world.',
    },
  ]);
});

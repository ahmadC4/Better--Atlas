import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ChatMessages } from '../ChatMessages';
import { initialVoicePlaybackState, type VoicePlaybackController } from '@/hooks/useVoicePlaybackController';
import type { Message } from '@shared/schema';

const createMessage = (): Message => ({
  id: 'message-1',
  chatId: 'chat-1',
  role: 'assistant',
  content: 'Hello world',
  attachments: null,
  metadata: {
    voiceMode: true,
    audioClips: [
      {
        clipId: 'clip-1',
        mimeType: 'audio/mpeg',
        durationMs: 1200,
        sizeBytes: 2048,
        audioUrl: 'https://example.com/audio.mp3',
        text: 'Hello world.',
      },
    ],
  },
  createdAt: new Date().toISOString(),
}) as unknown as Message;

describe('ChatMessages voice history playback', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    const audioData = new Uint8Array([1, 2, 3, 4]).buffer;
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('audio.mp3')) {
        return new Response(audioData, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
      }
      if (url.includes('/api/user')) {
        return new Response(
          JSON.stringify({ id: 'user-1', username: 'Test User', profileImageUrl: null }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/api/messages') && url.includes('/reactions')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('OK', { status: 200 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('enables playback controls when metadata includes persisted audio clips', async () => {
    const queryClient = new QueryClient();
    const voiceController: VoicePlaybackController = {
      status: 'idle',
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      progressMs: 0,
      totalDurationMs: 0,
      currentClipId: null,
      hasAudio: false,
    };

    render(
      <QueryClientProvider client={queryClient}>
        <ChatMessages
          messages={[createMessage()]}
          onCopyMessage={vi.fn()}
          onRegenerateResponse={vi.fn()}
          voicePlaybackState={initialVoicePlaybackState}
          voicePlaybackController={voiceController}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('voice-playback-toggle')).not.toBeDisabled();
    });
  });
});

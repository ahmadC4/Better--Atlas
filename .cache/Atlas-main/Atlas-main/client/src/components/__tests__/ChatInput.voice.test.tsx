import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChatInput } from '../ChatInput';

declare global {
  // eslint-disable-next-line no-var
  var MediaRecorder: any;
}

describe('ChatInput voice mode', () => {
  const originalMediaDevices = navigator.mediaDevices;
  const originalMediaRecorder = global.MediaRecorder;
  const originalFetch = global.fetch;
  const originalFileReader = global.FileReader;

  let mockGetUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGetUserMedia = vi.fn(async () => ({
      getTracks: vi.fn(() => [{ stop: vi.fn() }]),
    }));

    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: mockGetUserMedia },
      configurable: true,
      writable: true,
    });

    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ text: 'voice transcript' }),
    })) as unknown as typeof fetch;
    global.fetch = mockFetch;

    class MockFileReader {
      public result: string | ArrayBuffer | null = null;
      public onloadend: null | (() => void) = null;

      readAsDataURL(blob: Blob) {
        // Provide deterministic base64 payload
        this.result = `data:${blob.type};base64,dm9pY2U=`;
        this.onloadend?.();
      }
    }

    global.FileReader = MockFileReader as unknown as typeof FileReader;

    class MockMediaRecorder {
      public stream: any;
      public ondataavailable: ((event: { data: Blob }) => void) | null = null;
      public onstop: (() => void) | null = null;

      constructor(stream: any) {
        this.stream = stream;
        MockMediaRecorder.instance = this;
      }

      static instance: MockMediaRecorder | null = null;

      start = vi.fn();

      stop = vi.fn(() => {
        const blob = new Blob(['voice'], { type: 'audio/webm' });
        this.ondataavailable?.({ data: blob });
        this.onstop?.();
      });
    }

    global.MediaRecorder = MockMediaRecorder as any;
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMediaDevices,
      configurable: true,
      writable: true,
    });
    global.MediaRecorder = originalMediaRecorder;
    global.fetch = originalFetch;
    global.FileReader = originalFileReader;
    vi.restoreAllMocks();
  });

  it('auto submits transcript when voice recording stops', async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();

    render(
      <ChatInput
        onSendMessage={onSendMessage}
        enabledFeatures={[]}
      />,
    );

    const micButton = screen.getByTestId('button-voice-input');
    expect(micButton).toHaveAttribute('aria-pressed', 'false');

    await user.click(micButton);
    await waitFor(() => expect(mockGetUserMedia).toHaveBeenCalledTimes(1));
    expect(micButton).toHaveAttribute('aria-pressed', 'true');

    await user.click(micButton);

    await waitFor(() => {
      expect(onSendMessage).toHaveBeenCalledWith(
        'voice transcript',
        undefined,
        expect.objectContaining({
          voiceMode: true,
          preferredModelId: 'llama-3.1-8b-instant',
        }),
      );
    });

    expect(onSendMessage).toHaveBeenCalledTimes(1);
  });
});

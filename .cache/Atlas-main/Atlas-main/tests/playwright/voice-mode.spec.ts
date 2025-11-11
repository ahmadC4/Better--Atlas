import { test, expect } from '@playwright/test';

test('voice mode session streams audio and transcripts', async ({ page }) => {
  await page.addInitScript(() => {
    const okJson = (data: unknown, init: ResponseInit = {}) =>
      Promise.resolve(
        new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          ...init,
        }),
      );

    const originalFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.url;
      const method = (init?.method || 'GET').toUpperCase();

      if (url.endsWith('/api/auth/user')) {
        return okJson({ id: 'user-1', name: 'Voice Tester', role: 'user' });
      }

      if (url.includes('/api/users/me/limits')) {
        return okJson({
          plan: 'pro',
          messageLimitPerDay: null,
          allowedModels: ['compound'],
          features: [],
          chatHistoryEnabled: true,
        });
      }

      if (url.includes('/api/experts')) {
        return okJson([]);
      }

      if (url.includes('/api/output-templates')) {
        return okJson({ templates: [] });
      }

      if (url.includes('/api/chats') && method === 'GET') {
        return okJson([]);
      }

      if (url.includes('/api/chats') && method === 'POST') {
        return okJson({ id: 'chat-voice', title: 'Voice Chat', createdAt: new Date().toISOString() });
      }

      if (url.includes('/api/csrf')) {
        return okJson({ token: 'test-token' });
      }

      if (url.includes('/api/transcribe')) {
        return okJson({ text: 'Live voice reply' });
      }

      if (url.includes('/api/chat/completions/stream')) {
        const encoder = new TextEncoder();
        const events = [
          'event: voice_chunk\n' +
            'data: {"clipId":"clip-1","mimeType":"audio/webm","data":"dm9pY2U=","text":"Hello from audio"}\n\n',
          'event: voice_end\n' +
            'data: {"clipId":"clip-1","mimeType":"audio/webm","durationMs":600,"text":"Hello from audio"}\n\n',
          'event: text_delta\n' + 'data: {"text":"Hello from audio"}\n\n',
          'event: done\n' +
            'data: {"content":"Hello from audio","metadata":{"voiceMode":true,"audioClips":[{"clipId":"clip-1","mimeType":"audio/webm","durationMs":600,"text":"Hello from audio"}]}}\n\n',
        ];

        const stream = new ReadableStream({
          start(controller) {
            for (const entry of events) {
              controller.enqueue(encoder.encode(entry));
            }
            controller.close();
          },
        });

        return Promise.resolve(
          new Response(stream, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          }),
        );
      }

      return originalFetch(input, init);
    };

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: () =>
          Promise.resolve({
            getTracks: () => [
              {
                stop: () => undefined,
              },
            ],
          }),
      },
      configurable: true,
    });

    class MockMediaRecorder {
      public stream: any;
      public ondataavailable: ((event: { data: Blob }) => void) | null = null;
      public onstop: (() => void) | null = null;

      constructor(stream: any) {
        this.stream = stream;
      }

      start() {}

      stop() {
        const blob = new Blob(['voice'], { type: 'audio/webm' });
        this.ondataavailable?.({ data: blob });
        this.onstop?.();
      }
    }

    window.MediaRecorder = MockMediaRecorder as any;

    window.FileReader = class {
      public result: string | ArrayBuffer | null = null;
      public onloadend: null | (() => void) = null;

      readAsDataURL(blob: Blob) {
        this.result = `data:${blob.type};base64,dm9pY2U=`;
        this.onloadend?.();
      }
    } as any;

    class MockAudioContext {
      public destination = {};
      public state: 'running' | 'suspended' | 'closed' = 'running';
      public currentTime = 0;
      resume = async () => {
        this.state = 'running';
      };
      suspend = async () => {
        this.state = 'suspended';
      };
      close = async () => {
        this.state = 'closed';
      };
      decodeAudioData = async () => ({ duration: 0.6 });
      createBufferSource = () => {
        const source: {
          connect: () => void;
          start: () => void;
          stop: () => void;
          onended: null | (() => void);
        } = {
          connect: () => undefined,
          start: () => {
            this.currentTime += 0.6;
            setTimeout(() => {
              source.onended?.();
            }, 0);
          },
          stop: () => undefined,
          onended: null,
        };
        return source;
      };
    }

    window.AudioContext = MockAudioContext as any;
  });

  await page.goto('/app');

  const voiceButton = page.getByTestId('button-voice-input');
  await expect(voiceButton).toBeVisible();

  await voiceButton.click();
  await voiceButton.click();

  const voicePanel = page.getByTestId('voice-playback-panel');
  await expect(voicePanel).toBeVisible();
  await expect(page.getByTestId('voice-transcript')).toContainText('Hello from audio');
});

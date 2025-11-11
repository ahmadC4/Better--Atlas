import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

import {
  initialVoicePlaybackState,
  useVoicePlaybackController,
  voicePlaybackReducer,
} from '../useVoicePlaybackController';

declare global {
  // eslint-disable-next-line no-var
  var AudioContext: any;
}

describe('useVoicePlaybackController', () => {
  let latestSource: {
    onended: (() => void) | null;
    start: ReturnType<typeof vi.fn>;
  } | null = null;
  let latestContext: any;

  beforeEach(() => {
    latestSource = null;
    latestContext = null;

    class FakeAudioBufferSourceNode {
      public onended: (() => void) | null = null;
      public connect = vi.fn();
      public start = vi.fn();
      public stop = vi.fn();
    }

    class FakeAudioContext {
      public destination = {};
      public state: 'running' | 'suspended' | 'closed' = 'suspended';
      public currentTime = 0;
      public resume = vi.fn(async () => {
        this.state = 'running';
      });
      public suspend = vi.fn(async () => {
        this.state = 'suspended';
      });
      public close = vi.fn(async () => {
        this.state = 'closed';
      });
      public decodeAudioData = vi.fn(async () => ({ duration: 0.5 }));
      public createBufferSource = vi.fn(() => {
        const source = new FakeAudioBufferSourceNode();
        source.start = vi.fn(() => {
          this.currentTime += 0.5;
        });
        latestSource = source;
        return source;
      });
      public constructor() {
        latestContext = this;
      }
    }

    global.AudioContext = FakeAudioContext as any;
  });

  afterEach(() => {
    delete global.AudioContext;
    latestSource = null;
    latestContext = null;
  });

  it('plays queued clips and advances playback state', async () => {
    const { result } = renderHook(() => {
      const [state, dispatch] = React.useReducer(voicePlaybackReducer, initialVoicePlaybackState);
      const controller = useVoicePlaybackController({ state, dispatch, autoPlay: false });
      return { state, dispatch, controller };
    });

    const buffer = new Uint8Array([0, 1, 2, 3]).buffer;

    act(() => {
      result.current.dispatch({ type: 'start_session', sessionId: 'stream-1' });
      result.current.dispatch({
        type: 'enqueue_chunk',
        sessionId: 'stream-1',
        clipId: 'clip-1',
        mimeType: 'audio/webm',
        buffer,
      });
      result.current.dispatch({
        type: 'finalize_clip',
        sessionId: 'stream-1',
        clipId: 'clip-1',
        durationMs: 600,
        text: 'hello there',
        mimeType: 'audio/webm',
      });
    });

    await waitFor(() => expect(result.current.controller.hasAudio).toBe(true));

    await act(async () => {
      await result.current.controller.play();
    });

    expect(result.current.controller.status).toBe('playing');
    expect(latestSource).not.toBeNull();

    act(() => {
      latestSource?.onended?.();
    });

    await waitFor(() => expect(result.current.state.currentClipIndex).toBe(1));
    expect(result.current.state.status).toBe('idle');
  });

  it('auto plays the first clip when ready', async () => {
    const { result } = renderHook(() => {
      const [state, dispatch] = React.useReducer(voicePlaybackReducer, initialVoicePlaybackState);
      const controller = useVoicePlaybackController({ state, dispatch, autoPlay: true });
      return { state, dispatch, controller };
    });

    const buffer = new Uint8Array([9, 8, 7, 6]).buffer;

    act(() => {
      result.current.dispatch({ type: 'start_session', sessionId: 'stream-auto' });
      result.current.dispatch({
        type: 'enqueue_chunk',
        sessionId: 'stream-auto',
        clipId: 'clip-auto',
        mimeType: 'audio/webm',
        buffer,
      });
      result.current.dispatch({
        type: 'finalize_clip',
        sessionId: 'stream-auto',
        clipId: 'clip-auto',
        durationMs: 400,
        text: 'auto play',
        mimeType: 'audio/webm',
      });
    });

    await waitFor(() => expect(result.current.controller.hasAudio).toBe(true));

    await waitFor(() => expect(result.current.controller.status).toBe('playing'));

    expect(latestContext).not.toBeNull();
    expect(latestContext.resume).toHaveBeenCalled();
    await waitFor(() => expect(latestSource?.start).toHaveBeenCalled());

    act(() => {
      latestSource?.onended?.();
    });

    await waitFor(() => expect(result.current.state.currentClipIndex).toBe(1));
    expect(result.current.state.status).toBe('idle');
  });
});

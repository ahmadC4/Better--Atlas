import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface VoicePlaybackClip {
  clipId: string;
  mimeType: string;
  buffers: ArrayBuffer[];
  text?: string;
  durationMs?: number;
  sizeBytes?: number;
  isComplete: boolean;
}

export type VoicePlaybackStatus = 'idle' | 'playing' | 'paused';

export interface VoicePlaybackState {
  sessionId: string | null;
  clips: VoicePlaybackClip[];
  status: VoicePlaybackStatus;
  currentClipIndex: number;
  isVoiceActive: boolean;
  lastReadyClipId: string | null;
}

export type VoicePlaybackAction =
  | { type: 'reset' }
  | { type: 'start_session'; sessionId: string }
  | {
      type: 'enqueue_chunk';
      sessionId: string;
      clipId: string;
      mimeType: string;
      buffer: ArrayBuffer;
      text?: string;
    }
  | {
      type: 'finalize_clip';
      sessionId: string;
      clipId: string;
      durationMs?: number;
      sizeBytes?: number;
      text?: string;
      mimeType?: string;
    }
  | { type: 'set_status'; status: VoicePlaybackStatus }
  | { type: 'advance_clip'; clipId: string }
  | { type: 'update_clip_duration'; clipId: string; durationMs: number }
  | { type: 'clip_ready'; clipId: string };

export const initialVoicePlaybackState: VoicePlaybackState = {
  sessionId: null,
  clips: [],
  status: 'idle',
  currentClipIndex: 0,
  isVoiceActive: false,
  lastReadyClipId: null,
};

const mergeText = (current: string | undefined, next: string | undefined): string | undefined => {
  if (!current && !next) {
    return undefined;
  }

  if (!current) {
    return next;
  }

  if (!next) {
    return current;
  }

  return `${current} ${next}`.replace(/\s+/g, ' ').trim();
};

export function voicePlaybackReducer(
  state: VoicePlaybackState,
  action: VoicePlaybackAction,
): VoicePlaybackState {
  switch (action.type) {
    case 'reset':
      return { ...initialVoicePlaybackState };
    case 'start_session': {
      if (state.sessionId === action.sessionId) {
        return { ...state, isVoiceActive: true, lastReadyClipId: null };
      }
      return {
        ...initialVoicePlaybackState,
        sessionId: action.sessionId,
        isVoiceActive: true,
      };
    }
    case 'enqueue_chunk': {
      const { sessionId, clipId, mimeType, buffer, text } = action;
      const nextState =
        state.sessionId && state.sessionId !== sessionId
          ? {
              ...initialVoicePlaybackState,
              sessionId,
              isVoiceActive: true,
            }
          : { ...state, sessionId, isVoiceActive: true };

      const existingIndex = nextState.clips.findIndex(clip => clip.clipId === clipId);
      const updatedClips = [...nextState.clips];

      if (existingIndex >= 0) {
        const currentClip = updatedClips[existingIndex];
        updatedClips[existingIndex] = {
          ...currentClip,
          mimeType,
          buffers: [...currentClip.buffers, buffer],
          text: mergeText(currentClip.text, text),
        };
      } else {
        updatedClips.push({
          clipId,
          mimeType,
          buffers: [buffer],
          text,
          isComplete: false,
        });
      }

      return {
        ...nextState,
        clips: updatedClips,
        lastReadyClipId: nextState.lastReadyClipId,
      };
    }
    case 'finalize_clip': {
      if (state.sessionId && state.sessionId !== action.sessionId) {
        return state;
      }

      const index = state.clips.findIndex(clip => clip.clipId === action.clipId);
      if (index === -1) {
        return state;
      }

      const updatedClips = [...state.clips];
      const current = updatedClips[index];
      updatedClips[index] = {
        ...current,
        isComplete: true,
        mimeType: action.mimeType ?? current.mimeType,
        durationMs: typeof action.durationMs === 'number' ? action.durationMs : current.durationMs,
        sizeBytes: typeof action.sizeBytes === 'number' ? action.sizeBytes : current.sizeBytes,
        text: mergeText(current.text, action.text),
      };

      return {
        ...state,
        clips: updatedClips,
        isVoiceActive: true,
      };
    }
    case 'set_status':
      if (state.status === action.status) {
        return state;
      }
      return { ...state, status: action.status };
    case 'advance_clip': {
      const nextIndex = Math.min(state.currentClipIndex + 1, state.clips.length);
      const hasMore = nextIndex < state.clips.length;
      return {
        ...state,
        currentClipIndex: nextIndex,
        status: hasMore ? state.status : 'idle',
        lastReadyClipId: hasMore ? state.lastReadyClipId : null,
      };
    }
    case 'update_clip_duration': {
      const index = state.clips.findIndex(clip => clip.clipId === action.clipId);
      if (index === -1) {
        return state;
      }
      const updatedClips = [...state.clips];
      updatedClips[index] = {
        ...updatedClips[index],
        durationMs: action.durationMs,
      };
      return { ...state, clips: updatedClips };
    }
    case 'clip_ready': {
      return {
        ...state,
        lastReadyClipId: action.clipId,
      };
    }
    default:
      return state;
  }
}

export interface VoicePlaybackController {
  status: VoicePlaybackStatus;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  progressMs: number;
  totalDurationMs: number;
  currentClipId: string | null;
  hasAudio: boolean;
}

interface UseVoicePlaybackControllerOptions {
  state: VoicePlaybackState;
  dispatch: React.Dispatch<VoicePlaybackAction>;
  autoPlay?: boolean;
}

export function useVoicePlaybackController({
  state,
  dispatch,
  autoPlay = true,
}: UseVoicePlaybackControllerOptions): VoicePlaybackController {
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const decodedRef = useRef<Map<string, AudioBuffer>>(new Map());
  const clipStartTimeRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const playbackStateRef = useRef(state);
  const [progressMs, setProgressMs] = useState(0);
  const [currentClipId, setCurrentClipId] = useState<string | null>(null);

  useEffect(() => {
    playbackStateRef.current = state;
  }, [state]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (sourceRef.current) {
        try {
          sourceRef.current.stop();
        } catch {}
        sourceRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => undefined);
        audioContextRef.current = null;
      }
    };
  }, []);

  const completedDurationMs = useMemo(() => {
    if (state.currentClipIndex <= 0) {
      return 0;
    }
    return state.clips
      .slice(0, Math.min(state.currentClipIndex, state.clips.length))
      .reduce((total, clip) => total + (clip.durationMs ?? 0), 0);
  }, [state.clips, state.currentClipIndex]);

  const totalDurationMs = useMemo(
    () => state.clips.reduce((total, clip) => total + (clip.durationMs ?? 0), 0),
    [state.clips],
  );

  const resetAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const ensureAudioContext = useCallback(async () => {
    let context = audioContextRef.current;
    if (!context) {
      context = new AudioContext();
      audioContextRef.current = context;
    }

    if (context.state === 'suspended') {
      await context.resume();
    }

    return context;
  }, []);

  const updateProgress = useCallback(() => {
    if (!audioContextRef.current) {
      return;
    }

    const playback = playbackStateRef.current;
    const elapsed = (audioContextRef.current.currentTime - clipStartTimeRef.current) * 1000;
    const activeClip = playback.clips[playback.currentClipIndex];
    const activeDuration = activeClip?.durationMs ?? (sourceRef.current?.buffer?.duration ?? 0) * 1000;
    const boundedElapsed = Math.min(Math.max(elapsed, 0), activeDuration || elapsed);
    const nextProgress = completedDurationMs + boundedElapsed;
    const safeTotal = totalDurationMs || nextProgress || 1;

    setProgressMs(Math.min(safeTotal, nextProgress));
    rafRef.current = requestAnimationFrame(updateProgress);
  }, [completedDurationMs, totalDurationMs]);

  const closeContext = useCallback(async () => {
    resetAnimation();
    setProgressMs(0);
    setCurrentClipId(null);
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {}
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      await audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
    decodedRef.current.clear();
  }, [resetAnimation]);

  const startClipIfReady = useCallback(() => {
    const playback = playbackStateRef.current;
    if (playback.status !== 'playing') {
      return;
    }

    const clip = playback.clips[playback.currentClipIndex];
    if (!clip || !clip.isComplete) {
      return;
    }

    const decoded = decodedRef.current.get(clip.clipId);
    if (!decoded || !audioContextRef.current) {
      return;
    }

    if (sourceRef.current) {
      return;
    }

    const context = audioContextRef.current;
    const source = context.createBufferSource();
    source.buffer = decoded;
    source.connect(context.destination);
    source.onended = () => {
      sourceRef.current = null;
      clipStartTimeRef.current = context.currentTime;
      resetAnimation();
      setCurrentClipId(null);
      const latest = playbackStateRef.current;
      if (latest.status === 'paused') {
        return;
      }
      dispatch({ type: 'advance_clip', clipId: clip.clipId });
    };

    clipStartTimeRef.current = context.currentTime;
    sourceRef.current = source;
    setCurrentClipId(clip.clipId);
    resetAnimation();
    rafRef.current = requestAnimationFrame(updateProgress);
    source.start();
  }, [dispatch, resetAnimation, updateProgress]);

  useEffect(() => {
    let cancelled = false;
    const decodeClips = async () => {
      const clips = state.clips;
      if (clips.length === 0) {
        setProgressMs(0);
        setCurrentClipId(null);
      }

      for (const clip of clips) {
        if (!clip.isComplete) {
          continue;
        }
        if (decodedRef.current.has(clip.clipId)) {
          continue;
        }
        if (clip.buffers.length === 0) {
          continue;
        }

        let context = audioContextRef.current;
        if (!context) {
          context = new AudioContext();
          audioContextRef.current = context;
        }

        const blob = new Blob(clip.buffers.map(buf => new Uint8Array(buf)), { type: clip.mimeType });
        const arrayBuffer = await blob.arrayBuffer();
        if (cancelled) {
          return;
        }
        const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
        if (cancelled) {
          return;
        }
        decodedRef.current.set(clip.clipId, decoded);
        dispatch({ type: 'clip_ready', clipId: clip.clipId });
        const durationMs = Math.round(decoded.duration * 1000);
        if (!clip.durationMs || Math.abs((clip.durationMs ?? 0) - durationMs) > 10) {
          dispatch({ type: 'update_clip_duration', clipId: clip.clipId, durationMs });
        }
      }
    };

    decodeClips().catch(error => {
      console.error('Failed to decode audio clip', error);
    });

    return () => {
      cancelled = true;
    };
  }, [dispatch, state.clips]);

  useEffect(() => {
    if (state.status !== 'playing') {
      resetAnimation();
      if (state.status === 'idle') {
        setProgressMs(0);
      }
      return;
    }

    startClipIfReady();
  }, [resetAnimation, startClipIfReady, state.status, state.clips, state.currentClipIndex]);

  useEffect(() => {
    if (!autoPlay) {
      return;
    }

    if (!state.isVoiceActive) {
      return;
    }

    if (state.status !== 'idle') {
      return;
    }

    const firstClip = state.clips[state.currentClipIndex];
    if (!firstClip || !firstClip.isComplete) {
      return;
    }

    const hasDecoded = decodedRef.current.has(firstClip.clipId);
    if (!hasDecoded) {
      return;
    }

    const resumeAndPlay = async () => {
      await ensureAudioContext();
      dispatch({ type: 'set_status', status: 'playing' });
    };

    void resumeAndPlay();
  }, [
    autoPlay,
    dispatch,
    ensureAudioContext,
    state.clips,
    state.currentClipIndex,
    state.isVoiceActive,
    state.lastReadyClipId,
    state.status,
  ]);

  useEffect(() => {
    if (state.status === 'paused') {
      resetAnimation();
    }
  }, [resetAnimation, state.status]);

  useEffect(() => {
    if (state.clips.length === 0) {
      void closeContext();
    }
  }, [closeContext, state.clips.length]);

  const play = useCallback(async () => {
    await ensureAudioContext();

    dispatch({ type: 'set_status', status: 'playing' });
    startClipIfReady();
  }, [dispatch, ensureAudioContext, startClipIfReady]);

  const pause = useCallback(async () => {
    if (!audioContextRef.current) {
      return;
    }

    if (audioContextRef.current.state === 'running') {
      await audioContextRef.current.suspend();
    }

    dispatch({ type: 'set_status', status: 'paused' });
    resetAnimation();
  }, [dispatch, resetAnimation]);

  const stop = useCallback(async () => {
    dispatch({ type: 'reset' });
    await closeContext();
  }, [closeContext, dispatch]);

  const hasAudio = state.clips.some(clip => clip.isComplete && clip.buffers.length > 0);

  return {
    status: state.status,
    play,
    pause,
    stop,
    progressMs,
    totalDurationMs,
    currentClipId,
    hasAudio,
  };
}

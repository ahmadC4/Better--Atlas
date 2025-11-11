import { randomUUID } from 'node:crypto';

export interface ClauseInput {
  id?: string;
  text: string;
  voiceId?: string;
  format?: 'mp3' | 'wav';
}

export interface PlayAITTSOptions {
  voiceId?: string;
  apiKey?: string;
  format?: 'mp3' | 'wav';
}

export interface PlayAIAudioClip {
  clipId: string;
  audio: Buffer;
  mimeType: string;
  durationMs?: number;
  sizeBytes: number;
  text: string;
}

interface PlayAIClipResponse {
  id?: string;
  audio_base64?: string;
  audio?: string;
  duration_ms?: number;
  mime_type?: string;
  text?: string;
}

interface PlayAIResponseBody {
  clips?: PlayAIClipResponse[];
}

const PLAYAI_TTS_ENDPOINT = 'https://api.play.ai/v1/tts';

export async function synthesizeClauses(
  clauses: ClauseInput[],
  options: PlayAITTSOptions = {},
): Promise<PlayAIAudioClip[]> {
  if (!clauses.length) {
    return [];
  }

  const apiKey = options.apiKey ?? process.env.PLAYAI_API_KEY;
  if (!apiKey) {
    throw new Error('PLAYAI_API_KEY is not configured');
  }

  const voiceId = options.voiceId ?? process.env.PLAYAI_VOICE_ID;
  if (!voiceId) {
    throw new Error('PLAYAI_VOICE_ID is not configured');
  }

  const format = options.format ?? clauses[0]?.format ?? 'mp3';

  const payload = {
    voice_id: voiceId,
    format,
    input: clauses.map((clause, index) => ({
      id: clause.id ?? `clause-${index + 1}`,
      text: clause.text,
    })),
  };

  const response = await fetch(PLAYAI_TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Play.ai TTS request failed: ${response.status} ${message}`);
  }

  const data = (await response.json()) as PlayAIResponseBody;
  const clips = data.clips ?? [];

  return clips.map((clip, index) => {
    const base64 = clip.audio_base64 ?? clip.audio;
    if (!base64) {
      throw new Error('Play.ai response missing audio payload');
    }
    const audio = Buffer.from(base64, 'base64');
    return {
      clipId: clip.id ?? clauses[index]?.id ?? randomUUID(),
      audio,
      mimeType: clip.mime_type ?? `audio/${format}`,
      durationMs: clip.duration_ms,
      sizeBytes: audio.byteLength,
      text: clip.text ?? clauses[index]?.text ?? '',
    } satisfies PlayAIAudioClip;
  });
}

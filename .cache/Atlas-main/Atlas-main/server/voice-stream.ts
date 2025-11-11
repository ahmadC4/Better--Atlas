export type SendSseEvent = (event: string, data: Record<string, unknown>) => void;

export interface VoiceChunkPayload {
  clipId: string;
  mimeType: string;
  data: string;
  durationMs?: number;
  sizeBytes?: number;
  audioUrl?: string;
  text?: string;
}

export interface VoiceClipMetadataSummary {
  clipId: string;
  mimeType?: string;
  durationMs?: number;
  sizeBytes?: number;
  audioUrl?: string;
  text?: string;
}

export function handleVoiceChunk(
  sendEvent: SendSseEvent | null,
  chunk: VoiceChunkPayload | undefined,
  metadata: VoiceClipMetadataSummary[],
): void {
  if (!sendEvent || !chunk) {
    return;
  }

  const chunkPayload: Record<string, unknown> = {
    clipId: chunk.clipId,
    mimeType: chunk.mimeType,
    data: chunk.data,
  };

  if (typeof chunk.durationMs === 'number') {
    chunkPayload.durationMs = chunk.durationMs;
  }

  if (typeof chunk.sizeBytes === 'number') {
    chunkPayload.sizeBytes = chunk.sizeBytes;
  }

  if (chunk.text) {
    chunkPayload.text = chunk.text;
  }

  sendEvent('voice_chunk', chunkPayload);

  const endPayload: Record<string, unknown> = {
    clipId: chunk.clipId,
    mimeType: chunk.mimeType,
  };

  if (typeof chunk.durationMs === 'number') {
    endPayload.durationMs = chunk.durationMs;
  }

  if (typeof chunk.sizeBytes === 'number') {
    endPayload.sizeBytes = chunk.sizeBytes;
  }

  if (chunk.audioUrl) {
    endPayload.audioUrl = chunk.audioUrl;
  }

  if (chunk.text) {
    endPayload.text = chunk.text;
  }

  sendEvent('voice_end', endPayload);

  metadata.push({
    clipId: chunk.clipId,
    mimeType: chunk.mimeType,
    durationMs: chunk.durationMs,
    sizeBytes: chunk.sizeBytes,
    audioUrl: chunk.audioUrl,
    text: chunk.text,
  });
}

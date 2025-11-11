import { useMemo } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { VoicePlaybackClip, VoicePlaybackStatus } from '@/hooks/useVoicePlaybackController';

interface VoicePlaybackControlsProps {
  status: VoicePlaybackStatus;
  progressMs: number;
  totalDurationMs: number;
  onPlay: () => Promise<void> | void;
  onPause: () => Promise<void> | void;
  clips: VoicePlaybackClip[];
  disabled?: boolean;
  transcripts?: string[];
  isStreaming?: boolean;
}

const formatDuration = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '0:00';
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export function VoicePlaybackControls({
  status,
  progressMs,
  totalDurationMs,
  onPlay,
  onPause,
  clips,
  disabled = false,
  transcripts,
  isStreaming = false,
}: VoicePlaybackControlsProps) {
  const progressPercent = totalDurationMs > 0 ? Math.min(100, (progressMs / totalDurationMs) * 100) : 0;
  const isPlaying = status === 'playing';
  const isPaused = status === 'paused';

  const transcriptEntries = useMemo(() => {
    if (transcripts && transcripts.length > 0) {
      return transcripts.filter(Boolean);
    }
    return clips
      .map(clip => clip.text)
      .filter((value): value is string => Boolean(value && value.trim()));
  }, [clips, transcripts]);

  const showTranscriptFallback = transcriptEntries.length === 0;

  return (
    <div
      className={cn(
        'rounded-lg border bg-muted/40 p-3 space-y-3 transition-colors',
        disabled && 'opacity-70'
      )}
      data-testid="voice-playback-panel"
    >
      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={isPlaying ? onPause : onPlay}
          disabled={disabled}
          aria-pressed={isPlaying}
          aria-label={isPlaying ? 'Pause voice response' : 'Play voice response'}
          data-testid="voice-playback-toggle"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1 font-medium text-foreground">
              <Volume2 className="h-3.5 w-3.5" />
              <span>{isStreaming ? 'Streaming voice response' : 'Voice response'}</span>
            </div>
            <span>
              {formatDuration(progressMs)} / {formatDuration(totalDurationMs || progressMs)}
            </span>
          </div>
          <Progress value={progressPercent} className="h-1.5" data-testid="voice-playback-progress" />
          {isPaused && (
            <p className="text-[11px] text-muted-foreground">Paused</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {showTranscriptFallback ? (
          <p className="text-xs text-muted-foreground" data-testid="voice-transcript-fallback">
            Transcript will appear once the assistant finishes speaking.
          </p>
        ) : (
          <div className="space-y-1.5" data-testid="voice-transcript">
            {transcriptEntries.map((entry, index) => (
              <p key={`${index}-${entry.slice(0, 10)}`} className="text-sm leading-5 text-foreground">
                {entry}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

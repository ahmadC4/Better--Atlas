import { z } from 'zod';
import {
  voiceAudioClipSchema,
  type OutputTemplate,
  type OutputTemplateValidation,
} from '@shared/schema';

export const audioClipMetadataSchema = voiceAudioClipSchema.extend({
  text: z.string().optional(),
});

export type VoiceClipMetadata = z.infer<typeof audioClipMetadataSchema>;

export const chatMetadataSchema = z.object({
  deepVoyageEnabled: z.boolean().optional(),
  voiceMode: z.boolean().optional(),
  taskSummary: z
    .string()
    .max(240, 'Task summary must be 240 characters or fewer')
    .optional(),
  outputTemplateId: z.string().uuid('Output template id must be a valid UUID').optional(),
  audioClips: z.array(audioClipMetadataSchema).optional(),
  preferredModelId: z.string().optional(),
});

export function buildAssistantMetadata(options: {
  baseMetadata?: z.infer<typeof chatMetadataSchema>;
  outputTemplate?: OutputTemplate | null;
  executedTools?: string[];
  thinkingContent?: string;
  validation?: OutputTemplateValidation | null;
  voiceClips?: VoiceClipMetadata[];
  voiceMode?: boolean;
}): Record<string, unknown> | undefined {
  const {
    baseMetadata,
    outputTemplate,
    executedTools,
    thinkingContent,
    validation,
    voiceClips,
    voiceMode,
  } = options;

  const metadata: Record<string, unknown> = {};

  if (baseMetadata?.deepVoyageEnabled) {
    metadata.deepVoyageEnabled = true;
  }

  if (baseMetadata?.voiceMode || voiceMode) {
    metadata.voiceMode = true;
  }

  if (baseMetadata?.taskSummary) {
    metadata.taskSummary = baseMetadata.taskSummary;
  }

  if (outputTemplate) {
    metadata.outputTemplateId = outputTemplate.id;
    metadata.outputTemplateName = outputTemplate.name;
    metadata.outputTemplateCategory = outputTemplate.category;
    metadata.outputTemplateFormat = outputTemplate.format;
  } else if (baseMetadata?.outputTemplateId) {
    metadata.outputTemplateId = baseMetadata.outputTemplateId;
  }

  if (executedTools && executedTools.length > 0) {
    metadata.executedTools = executedTools;
  }

  if (thinkingContent) {
    metadata.thinkingContent = thinkingContent;
  }

  if (validation) {
    metadata.outputTemplateValidation = validation;
  }

  const baseClips = baseMetadata?.audioClips ?? [];
  const combinedClips = [...baseClips, ...(voiceClips ?? [])];

  if (combinedClips.length > 0) {
    metadata.audioClips = combinedClips.map(clip => ({
      clipId: clip.clipId,
      mimeType: clip.mimeType,
      durationMs: clip.durationMs,
      sizeBytes: clip.sizeBytes,
      audioUrl: clip.audioUrl,
      text: clip.text,
    }));
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

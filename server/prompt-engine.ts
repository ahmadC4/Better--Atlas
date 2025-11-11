import type { Message as StoredMessage } from '../shared/schema.js';
import type { IStorage } from './storage/index.js';
import { DEFAULT_SYSTEM_PROMPT } from './system-prompts.js';

export type PromptLayerRole = 'system' | 'user' | 'assistant';

export type PromptMessage = Pick<StoredMessage, 'role' | 'content'> & {
  role: PromptLayerRole;
};

export interface PromptAssemblyContext {
  systemPrompt?: string;
  expertPrompt?: string | null;
  taskPrompt?: string | null;
  profilePrompt?: string | null;
  messages: Array<{ role: PromptLayerRole; content: string }>;
  logger?: Pick<Console, 'debug' | 'log'>;
  storage?: Pick<IStorage, 'getActiveSystemPrompt' | 'getActiveRelease' | 'getSystemPrompt'>;
}

const ALLOWED_ROLES: ReadonlySet<PromptLayerRole> = new Set(['system', 'user', 'assistant']);

function createLogger(logger?: PromptAssemblyContext['logger']) {
  const target = logger ?? console;
  return (message: string) => {
    if (typeof target.debug === 'function') {
      target.debug(`[PromptEngine] ${message}`);
      return;
    }

    if (typeof target.log === 'function') {
      target.log(`[PromptEngine] ${message}`);
      return;
    }

    console.log(`[PromptEngine] ${message}`);
  };
}

async function resolveSystemPrompt(
  ctx: PromptAssemblyContext,
  log: (message: string) => void,
): Promise<string> {
  if (ctx.storage) {
    try {
      const release = await ctx.storage.getActiveRelease();
      if (release?.systemPromptId && ctx.storage.getSystemPrompt) {
        const prompt = await ctx.storage.getSystemPrompt(release.systemPromptId);
        if (prompt?.content) {
          return prompt.content;
        }
      }
    } catch (error) {
      log(`Failed to load system prompt from active release: ${(error as Error).message}`);
    }

    try {
      const active = await ctx.storage.getActiveSystemPrompt();
      if (active?.content) {
        return active.content;
      }
    } catch (error) {
      log(`Failed to load system prompt from storage: ${(error as Error).message}`);
    }
  }

  return DEFAULT_SYSTEM_PROMPT;
}

export async function assembleRequest(ctx: PromptAssemblyContext): Promise<PromptMessage[]> {
  const log = createLogger(ctx.logger);
  const assembled: PromptMessage[] = [];

  const baseSystemPrompt = await resolveSystemPrompt(ctx, log);
  const trimmedAdditional = ctx.systemPrompt?.trim();
  const systemPromptContent = trimmedAdditional
    ? `${baseSystemPrompt.trimEnd()}\n\n${trimmedAdditional}`
    : baseSystemPrompt;

  log('Layer: system');
  assembled.push({ role: 'system', content: systemPromptContent });

  const expertPrompt = ctx.expertPrompt?.trim();
  if (expertPrompt) {
    log('Layer: expert');
    assembled.push({ role: 'system', content: expertPrompt });
  } else {
    log('Layer: expert (skipped)');
  }

  const taskPrompt = ctx.taskPrompt?.trim();
  if (taskPrompt) {
    log('Layer: task');
    assembled.push({ role: 'system', content: taskPrompt });
  } else {
    log('Layer: task (skipped)');
  }

  const profilePrompt = ctx.profilePrompt?.trim();
  if (profilePrompt) {
    log('Layer: profile');
    assembled.push({ role: 'system', content: profilePrompt });
  } else {
    log('Layer: profile (skipped)');
  }

  const sanitizedMessages = ctx.messages.filter(message => ALLOWED_ROLES.has(message.role));
  log(`Layer: user (${sanitizedMessages.length} message${sanitizedMessages.length === 1 ? '' : 's'})`);

  sanitizedMessages.forEach(message => {
    assembled.push({
      role: message.role,
      content: message.content,
    });
  });

  return assembled;
}

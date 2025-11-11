// AI Model Configuration and Mapping
// Maps UI model IDs to actual API model names

export interface ModelConfig {
  id: string;
  apiModel: string; // Actual model name for API calls
  provider: 'openai' | 'anthropic' | 'groq' | 'perplexity';
  apiKeyEnvVar: string;
  endpoint?: string; // Optional custom endpoint
  maxTokens?: number;
  supportsFunctions?: boolean;
  supportsVision?: boolean;
  supportsStreaming?: boolean;
  supportsWebSearch?: boolean;
  supportsThinking?: boolean;
  supportsCodeInterpreter?: boolean;
}

export const MODEL_CONFIG: Record<string, ModelConfig> = {
  // OpenAI Models
  'gpt-5': {
    id: 'gpt-5',
    apiModel: 'gpt-5',
    provider: 'openai',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    maxTokens: 200000,
    supportsFunctions: true,
    supportsVision: true,
    supportsStreaming: true,
    supportsWebSearch: true,
    supportsThinking: true,
    supportsCodeInterpreter: true,
  },
  'gpt-5-mini': {
    id: 'gpt-5-mini',
    apiModel: 'gpt-5-mini',
    provider: 'openai',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    maxTokens: 128000,
    supportsFunctions: true,
    supportsVision: false,
    supportsStreaming: true,
    supportsWebSearch: true,
    supportsThinking: false,
    supportsCodeInterpreter: true,
  },
  'gpt-4.1-mini': {
    id: 'gpt-4.1-mini',
    apiModel: 'gpt-4.1-mini',
    provider: 'openai',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    maxTokens: 128000,
    supportsFunctions: true,
    supportsVision: true,
    supportsStreaming: true,
    supportsWebSearch: false,
    supportsThinking: false,
    supportsCodeInterpreter: true,
  },
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    apiModel: 'gpt-4o-mini',
    provider: 'openai',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    maxTokens: 128000,
    supportsFunctions: true,
    supportsVision: true,
    supportsStreaming: true,
    supportsWebSearch: true,
    supportsThinking: false,
    supportsCodeInterpreter: true,
  },

  // Anthropic / Claude Models
  'claude-4.5-sonnet': {
    id: 'claude-4.5-sonnet',
    apiModel: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    maxTokens: 200000,
    supportsFunctions: false,
    supportsVision: true,
    supportsStreaming: true,
    supportsWebSearch: true,
    supportsThinking: true,
    supportsCodeInterpreter: true,
  },

  // Groq Models
  'compound': {
    id: 'compound',
    apiModel: 'groq/compound',
    provider: 'groq',
    apiKeyEnvVar: 'GROQ_API_KEY',
    maxTokens: 32768,
    supportsFunctions: true,
    supportsVision: false,
    supportsStreaming: true,
    supportsWebSearch: true,
    supportsThinking: false,
    supportsCodeInterpreter: true,
  },
  'llama-3.1-8b-instant': {
    id: 'llama-3.1-8b-instant',
    apiModel: 'llama-3.1-8b-instant',
    provider: 'groq',
    apiKeyEnvVar: 'GROQ_API_KEY',
    maxTokens: 32768,
    supportsFunctions: false,
    supportsVision: false,
    supportsStreaming: true,
    supportsWebSearch: false,
    supportsThinking: false,
    supportsCodeInterpreter: false,
  },

  // Perplexity Models
  'sonar-deep-research': {
    id: 'sonar-deep-research',
    apiModel: 'sonar-reasoning-pro',
    provider: 'perplexity',
    apiKeyEnvVar: 'PERPLEXITY_API_KEY',
    endpoint: 'https://api.perplexity.ai/chat/completions',
    maxTokens: 4096,
    supportsFunctions: false,
    supportsVision: false,
    supportsStreaming: true,
    supportsWebSearch: true,
    supportsThinking: true,
    supportsCodeInterpreter: false,
  },
  'sonar-pro': {
    id: 'sonar-pro',
    apiModel: 'sonar-pro',
    provider: 'perplexity',
    apiKeyEnvVar: 'PERPLEXITY_API_KEY',
    endpoint: 'https://api.perplexity.ai/chat/completions',
    maxTokens: 4096,
    supportsFunctions: false,
    supportsVision: false,
    supportsStreaming: true,
    supportsWebSearch: true,
    supportsThinking: false,
    supportsCodeInterpreter: false,
  },
};

export function getModelConfig(modelId: string): ModelConfig | undefined {
  return MODEL_CONFIG[modelId];
}

export function isModelAvailable(modelId: string): boolean {
  const config = MODEL_CONFIG[modelId];
  if (!config) return false;
  
  const apiKey = process.env[config.apiKeyEnvVar];
  return !!apiKey;
}

export function getAvailableModels(): string[] {
  return Object.keys(MODEL_CONFIG).filter(modelId => isModelAvailable(modelId));
}

export function getDefaultModel(): string {
  // Prefer flagship OpenAI or Groq models when available
  if (isModelAvailable('gpt-5')) return 'gpt-5';
  if (isModelAvailable('gpt-5-mini')) return 'gpt-5-mini';
  if (isModelAvailable('compound')) return 'compound';

  // Fall back to any available model
  const available = getAvailableModels();
  return available[0] || 'compound';
}
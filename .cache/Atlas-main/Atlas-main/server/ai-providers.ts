import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { getModelById } from '@shared/schema';
import { z } from 'zod';
import { performWebSearch } from './web-search';
import { getModelConfig, getModelTemperature } from './ai-models';

// Initialize AI clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Message validation schema
const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1, 'Message content cannot be empty'),
});

const reasoningSettingsSchema = z
  .object({
    effort: z.enum(['low', 'medium', 'high']).optional(),
  })
  .optional();

const chatCompletionRequestSchema = z.object({
  model: z.string().min(1, 'Model is required'),
  messages: z.array(chatMessageSchema).min(1, 'At least one message is required'),
  maxTokens: z.number().optional(),
  temperature: z.number().min(0).max(2).optional(),
  reasoning: reasoningSettingsSchema,
});

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ReasoningSettings {
  effort?: 'low' | 'medium' | 'high';
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  reasoning?: ReasoningSettings;
}

// Get appropriate token limits based on model
function getTokenLimits(modelId: string): { maxTokens: number; defaultMaxTokens: number } {
  const model = getModelById(modelId);
  const baseMaxTokens = model?.maxTokens || 4000;
  
  // Conservative defaults to avoid hitting provider limits
  const defaultMaxTokens = Math.min(baseMaxTokens * 0.25, 4000); // Use 25% of max for generation
  
  return {
    maxTokens: baseMaxTokens,
    defaultMaxTokens,
  };
}

export interface ChatCompletionResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

// Web search tool definition for OpenAI
const webSearchTool = {
  type: 'function' as const,
  function: {
    name: 'web_search',
    description: 'Search the web for current information, news, facts, or any real-time data. Use this when you need up-to-date information that may not be in your training data.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to look up on the web',
        },
      },
      required: ['query'],
    },
  },
};

// OpenAI provider
export async function callOpenAI(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
  try {
    const modelConfig = getModelConfig(request.model);
    if (!modelConfig || modelConfig.provider !== 'openai') {
      throw new Error(`Unsupported OpenAI model: ${request.model}`);
    }

    const openaiModel = modelConfig.apiModel;
    if (!openaiModel) {
      throw new Error(`Missing API model configuration for: ${request.model}`);
    }

    // Check if model supports web search
    const supportsWebSearch = modelConfig.supportsWebSearch || false;
    const webSearchEnabled = supportsWebSearch && Boolean(process.env.PERPLEXITY_API_KEY);

    // Clean messages to only include required fields
    const cleanMessages = request.messages.map(m => ({ role: m.role, content: m.content }));

    const isGpt5Family = openaiModel.startsWith('gpt-5');
    const modelTemperature = getModelTemperature(request.model);

    const buildPayload = (messages: any[], includeTools = true) => {
      const payload: any = {
        model: openaiModel,
        messages,
        temperature: request.temperature ?? modelTemperature,
      };

      if (includeTools && webSearchEnabled) {
        payload.tools = [webSearchTool];
      }

      if (isGpt5Family) {
        payload.max_completion_tokens = request.maxTokens || 4000;
        if (request.reasoning) {
          payload.reasoning = request.reasoning;
        }
      } else {
        payload.max_tokens = request.maxTokens || 4000;
      }

      return payload;
    };

    // First request with tool calling if web search is supported
    const initialResponse = await openai.chat.completions.create(buildPayload(cleanMessages as any));

    const choice = initialResponse.choices[0];
    
    // Check if model wants to use web search tool
    if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
      const toolCall = choice.message.tool_calls[0];
      
      if (toolCall.type === 'function' && toolCall.function.name === 'web_search') {
        try {
          if (!webSearchEnabled) {
            console.warn('Web search tool requested without Perplexity configuration.');
            return {
              content: choice?.message?.content || '',
              model: request.model,
              usage: {
                promptTokens: initialResponse.usage?.prompt_tokens,
                completionTokens: initialResponse.usage?.completion_tokens,
                totalTokens: initialResponse.usage?.total_tokens,
              },
            };
          }
          const args = JSON.parse(toolCall.function.arguments);
          const searchQuery = args.query;
          
          if (!searchQuery || typeof searchQuery !== 'string') {
            throw new Error('Invalid search query');
          }
          
          // Perform web search
          const searchResult = await performWebSearch(searchQuery);
          
          // Format search results with citations if available
          let searchContent = `Web search results for "${searchQuery}":\n\n${searchResult.answer}`;
          
          if (searchResult.sources && searchResult.sources.length > 0) {
            searchContent += '\n\nSources:\n' + searchResult.sources.map((s, i) => `${i + 1}. ${s}`).join('\n');
          }
          
          // Add tool response to conversation
          const messagesWithToolResult = [
            ...cleanMessages,
            choice.message,
            {
              role: 'tool' as const,
              tool_call_id: toolCall.id,
              content: searchContent,
            },
          ];
        
          // Get final response with search results
          const finalResponse = await openai.chat.completions.create(
            buildPayload(messagesWithToolResult as any, false),
          );
          
          return {
            content: finalResponse.choices[0]?.message?.content || '',
            model: request.model,
            usage: {
              promptTokens: (initialResponse.usage?.prompt_tokens || 0) + (finalResponse.usage?.prompt_tokens || 0),
              completionTokens: (initialResponse.usage?.completion_tokens || 0) + (finalResponse.usage?.completion_tokens || 0),
              totalTokens: (initialResponse.usage?.total_tokens || 0) + (finalResponse.usage?.total_tokens || 0),
            },
          };
        } catch (searchError) {
          console.error('Web search tool error:', searchError);
          // Fall back to response without search
        }
      }
    }

    // No tool call, return initial response
    return {
      content: choice?.message?.content || '',
      model: request.model,
      usage: {
        promptTokens: initialResponse.usage?.prompt_tokens,
        completionTokens: initialResponse.usage?.completion_tokens,
        totalTokens: initialResponse.usage?.total_tokens,
      },
    };
  } catch (error) {
    console.error('OpenAI API error:', error);
    throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Anthropic provider
export async function callAnthropic(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
  try {
    // Map model ID to actual Anthropic model (using current available models)
    const modelMap: Record<string, string> = {
      'claude-4.5-sonnet': 'claude-sonnet-4-5',
      'claude-sonnet-4-5': 'claude-sonnet-4-5',
      'claude-sonnet-4-5-20241022': 'claude-sonnet-4-5',
    };
    
    const anthropicModel = modelMap[request.model];
    if (!anthropicModel) {
      throw new Error(`Unsupported Anthropic model: ${request.model}`);
    }
    
    // Convert messages format for Anthropic - clean messages to only include required fields
    const systemMessage = request.messages.find(m => m.role === 'system');
    const userMessages = request.messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content })); // Clean messages - only role and content
    
    const response = await anthropic.messages.create({
      model: anthropicModel,
      system: systemMessage?.content,
      messages: userMessages as any,
      max_tokens: request.maxTokens || 4000,
    });

    return {
      content: response.content[0]?.type === 'text' ? response.content[0].text : '',
      model: request.model,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  } catch (error) {
    console.error('Anthropic API error:', error);
    throw new Error(`Anthropic API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Groq provider (using fetch since no official SDK)
export async function callGroq(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
  try {
    // Map UI model IDs to actual Groq model IDs (updated with current models)
    const modelMap: Record<string, string> = {
      compound: 'groq/compound',
      'compound-mini': 'llama-3.1-8b-instant',
      'llama-3.1-8b-instant': 'llama-3.1-8b-instant',
    };

    const groqModel = modelMap[request.model] || 'groq/compound';
    
    // For security: do NOT log user messages - removed console.log
    
    // Clean messages to only include required fields
    const cleanMessages = request.messages.map(m => ({ role: m.role, content: m.content }));
    
    const modelTemperature = getModelTemperature(request.model);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: groqModel,
        messages: cleanMessages,
        max_tokens: request.maxTokens || 4000,
        temperature: request.temperature ?? modelTemperature,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Groq API ${response.status} error response:`, errorText);
      throw new Error(`Groq API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    
    return {
      content: data.choices[0]?.message?.content || '',
      model: request.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
      },
    };
  } catch (error) {
    console.error('Groq API error (no sensitive data logged)');
    throw new Error(`Groq API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Perplexity provider
export async function callPerplexity(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
  try {
    // Map model IDs to Perplexity models (trying basic model names)
    const modelMap: Record<string, string> = {
      'sonar-pro': 'sonar-pro',
      'sonar-deep-research': 'sonar-reasoning-pro',
    };

    const perplexityModel = modelMap[request.model] || 'sonar-pro';
    
    // Clean messages to only include required fields
    const cleanMessages = request.messages.map(m => ({ role: m.role, content: m.content }));
    
    const modelTemperature = getModelTemperature(request.model);

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: perplexityModel,
        messages: cleanMessages,
        max_tokens: request.maxTokens || 4000,
        temperature: request.temperature ?? modelTemperature,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Perplexity API ${response.status} error response:`, errorText);
      throw new Error(`Perplexity API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    
    return {
      content: data.choices[0]?.message?.content || '',
      model: request.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
      },
    };
  } catch (error) {
    console.error('Perplexity API error:', error);
    throw new Error(`Perplexity API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Environment variable validation
function validateEnvironmentVariables() {
  const missing = [];
  
  if (!process.env.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
  if (!process.env.ANTHROPIC_API_KEY) missing.push('ANTHROPIC_API_KEY');
  if (!process.env.PERPLEXITY_API_KEY) missing.push('PERPLEXITY_API_KEY');
  // Note: GROQ_API_KEY is optional since Groq models may not be fully available
  
  if (missing.length > 0) {
    console.warn(`Missing API keys: ${missing.join(', ')}`);
  }
}

// Initialize environment validation
validateEnvironmentVariables();

// Main AI provider router
export async function callAIProvider(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
  // Validate request structure
  try {
    chatCompletionRequestSchema.parse(request);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid request: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }
  
  const model = getModelById(request.model);

  if (!model) {
    throw new Error(`Unknown model: ${request.model}`);
  }

  const modelTemperature = getModelTemperature(request.model);

  // Guard: Ensure model is chat-capable
  if (!model.capabilities.includes('chat')) {
    throw new Error(`Model ${request.model} is not chat-capable. Available capabilities: ${model.capabilities.join(', ')}`);
  }

  // Apply appropriate token limits
  const { defaultMaxTokens } = getTokenLimits(request.model);
  const validatedRequest = {
    ...request,
    maxTokens: Math.min(request.maxTokens || defaultMaxTokens, defaultMaxTokens),
    temperature: request.temperature ?? modelTemperature,
  };

  // Check if required API key is available for the provider
  switch (model.provider) {
    case 'OpenAI':
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OpenAI API key is required but not configured');
      }
      return callOpenAI(validatedRequest);
    case 'Anthropic':
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('Anthropic API key is required but not configured');
      }
      return callAnthropic(validatedRequest);
    case 'Groq':
      if (!process.env.GROQ_API_KEY) {
        throw new Error('Groq API key is required but not configured');
      }
      return callGroq(validatedRequest);
    case 'Perplexity':
      if (!process.env.PERPLEXITY_API_KEY) {
        throw new Error('Perplexity API key is required but not configured');
      }
      return callPerplexity(validatedRequest);
    default:
      throw new Error(`Unsupported provider: ${model.provider}`);
  }
}
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';
import { getModelConfig, ModelConfig } from './ai-models.js';
import { performWebSearch } from './web-search.js';
import type { UserPreferences, Message, ToolPolicy } from '../shared/schema.js';
import { IStorage } from './storage/index.js';
import { assembleRequest } from './prompt-engine.js';
import { generateRequestId, estimateMessagesTokens, calculateCost } from './analytics-utils.js';

export interface ChatCompletionRequest {
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  model: string;
  userId: string;
  projectId?: string | null;
  expertId?: string | null;
  temperature?: number;
  maxTokens?: number;
  reasoning?: {
    effort?: 'low' | 'medium' | 'high';
  };
  stream?: boolean;
  metadata?: {
    deepVoyageEnabled?: boolean;
    taskSummary?: string;
    outputTemplateId?: string;
  };
}

export interface ChatCompletionResponse {
  content: string;
  model: string;
  thinkingContent?: string; // Extended thinking/reasoning content from models that support it
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  executedTools?: string[];
}

export class AIService {
  private pyodide: any = null; // Cached Pyodide instance
  private readonly providerLabels: Record<ModelConfig['provider'], string> = {
    openai: 'OpenAI',
    anthropic: 'Claude',
    groq: 'Groq',
    perplexity: 'Perplexity',
    openrouter: 'OpenRouter',
  };

  private envVarForProvider(provider: ModelConfig['provider']): string | null {
    switch (provider) {
      case 'groq':
        return process.env.GROQ_API_KEY || null;
      case 'openai':
        return process.env.OPENAI_API_KEY || null;
      case 'anthropic':
        return process.env.ANTHROPIC_API_KEY || null;
      case 'perplexity':
        return process.env.PERPLEXITY_API_KEY || null;
      case 'openrouter':
        return process.env.OPENROUTER_API_KEY || null;
      default:
        return null;
    }
  }

  private async resolveModelConfig(modelId: string): Promise<ModelConfig | undefined> {
    // Prefer static config first
    const staticConfig = getModelConfig(modelId);
    if (staticConfig) return staticConfig;

    // Fallback to dynamic models stored in the DB
    try {
      const dbModel = await this.storage.getModelByModelId(modelId);
      if (!dbModel) return undefined;

      const apiKeyEnvVar = (() => {
        switch (dbModel.provider) {
          case 'openai':
            return 'OPENAI_API_KEY';
          case 'anthropic':
            return 'ANTHROPIC_API_KEY';
          case 'groq':
            return 'GROQ_API_KEY';
          case 'perplexity':
            return 'PERPLEXITY_API_KEY';
          case 'openrouter':
            return 'OPENROUTER_API_KEY';
          default:
            return 'OPENAI_API_KEY';
        }
      })();

      const caps: any = dbModel.capabilities ?? {};

      return {
        id: modelId,
        apiModel: dbModel.modelId,
        provider: dbModel.provider as ModelConfig['provider'],
        apiKeyEnvVar,
        maxTokens: dbModel.maxOutputTokens ?? dbModel.contextWindow ?? undefined,
        supportsFunctions: false,
        supportsVision: Boolean(caps.vision),
        supportsStreaming: true,
        supportsWebSearch: Boolean(caps.web),
        supportsThinking: Boolean(caps.thinking),
        supportsCodeInterpreter: Boolean(caps.code),
      };
    } catch (e) {
      return undefined;
    }
  }

  private buildToolPolicyMap(policies: ToolPolicy[]): Map<string, ToolPolicy> {
    const map = new Map<string, ToolPolicy>();
    for (const policy of policies) {
      map.set(policy.toolName.trim().toLowerCase(), policy);
    }
    return map;
  }

  private isToolEnabled(toolName: string, policyMap: Map<string, ToolPolicy>): boolean {
    const policy = policyMap.get(toolName.trim().toLowerCase());
    return policy ? policy.isEnabled : true;
  }

  private prependToolPolicyNotice(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    policyMap: Map<string, ToolPolicy>,
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const disabled = Array.from(policyMap.values()).filter(policy => !policy.isEnabled);
    const safetyNotes = Array.from(policyMap.values())
      .map(policy => ({ toolName: policy.toolName, note: policy.safetyNote?.trim() }))
      .filter((entry): entry is { toolName: string; note: string } => Boolean(entry.note));

    if (disabled.length === 0 && safetyNotes.length === 0) {
      return messages;
    }

    const noticeSections: string[] = ['ADMINISTRATIVE TOOL POLICY NOTICE'];

    if (disabled.length > 0) {
      noticeSections.push('The following tools are disabled and must not be used:');
      disabled.forEach(policy => {
        noticeSections.push(`- ${policy.toolName}`);
      });
    }

    if (safetyNotes.length > 0) {
      noticeSections.push('Safety guidelines:');
      safetyNotes.forEach(entry => {
        noticeSections.push(`- ${entry.toolName}: ${entry.note}`);
      });
    }

    const noticeMessage = noticeSections.join('\n');
    return [{ role: 'system', content: noticeMessage }, ...messages];
  }

  private buildToolBlockedMessage(content: string | null | undefined, toolName: string): string {
    const base = content?.trim();
    const notice = `[Tool use blocked by administrator policy: ${toolName}]`;
    return base && base.length > 0 ? `${base}\n\n${notice}` : notice;
  }

  private async recordAnalytics(params: {
    requestId: string;
    userId: string;
    chatId?: string;
    projectId?: string | null;
    expertId?: string | null;
    templateId?: string | null;
    provider: 'openai' | 'anthropic' | 'groq' | 'perplexity' | 'compound';
    model: string;
    status: 'success' | 'error';
    errorCode?: string;
    errorMessage?: string;
    inputTokens: number;
    outputTokens: number;
    tokensEstimated: boolean;
    latencyMs: number;
  }): Promise<void> {
    try {
      // Get pricing for cost calculation
      const pricing = await this.storage.getProviderPricing(params.provider, params.model);
      const inputPricePerK = pricing?.inputUsdPer1k || '0';
      const outputPricePerK = pricing?.outputUsdPer1k || '0';
      
      const costUsd = calculateCost(
        params.inputTokens,
        params.outputTokens,
        inputPricePerK,
        outputPricePerK
      );

      await this.storage.createAnalyticsEvent({
        requestId: params.requestId,
        userId: params.userId,
        chatId: params.chatId || null,
        projectId: params.projectId || null,
        expertId: params.expertId || null,
        templateId: params.templateId || null,
        provider: params.provider,
        model: params.model,
        status: params.status,
        errorCode: params.errorCode || null,
        errorMessage: params.errorMessage || null,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        totalTokens: params.inputTokens + params.outputTokens,
        tokensEstimated: params.tokensEstimated,
        latencyMs: params.latencyMs,
        costUsd,
      });
    } catch (error) {
      // Don't fail the request if analytics recording fails
      console.error('Failed to record analytics:', error);
    }
  }

  private getEnvDefaultApiKey(provider: ModelConfig['provider']): string | null {
    switch (provider) {
      case 'groq':
        return process.env.GROQ_API_KEY || null;
      case 'openai':
        return process.env.OPENAI_API_KEY || null;
      case 'anthropic':
        return process.env.ANTHROPIC_API_KEY || null;
      case 'perplexity':
        return process.env.PERPLEXITY_API_KEY || null;
      case 'openrouter':
        return process.env.OPENROUTER_API_KEY || null;
      default:
        return null;
    }
  }

  constructor(private storage: IStorage) {}

  private async requireApiKey(
    userId: string,
    provider: ModelConfig['provider'],
    modelId: string,
  ): Promise<string> {
    const [apiKeyRecord, settingsRecord] = await Promise.all([
      this.storage.getUserApiKey(userId, provider),
      this.storage.getPlatformSettings(),
    ]);

    const providerSettings = settingsRecord.data.apiProviders[provider];
    const providerName = this.providerLabels[provider] ?? provider;

    if (!providerSettings) {
      throw new Error(`${providerName} is not configured. Contact your administrator.`);
    }

    if (providerSettings.allowUserProvidedKeys !== false && apiKeyRecord?.apiKey) {
      return apiKeyRecord.apiKey;
    }

    const envDefault = this.getEnvDefaultApiKey(provider);
    const platformDefault = providerSettings.defaultApiKey ?? null;
    const fallbackKey = envDefault || platformDefault;
    const allowedModels = new Set(providerSettings.platformKeyAllowedModels ?? []);

    if (fallbackKey && allowedModels.has(modelId)) {
      return fallbackKey;
    }

    if (!fallbackKey) {
      if (providerSettings.allowUserProvidedKeys === false) {
        throw new Error(
          `${providerName} access is disabled for ${modelId}. Contact your administrator to enable the platform key.`,
        );
      }
      throw new Error(`${providerName} API key is required. Add it in Settings → Integrations.`);
    }

    if (providerSettings.allowUserProvidedKeys === false) {
      throw new Error(
        `${providerName} platform key is disabled for ${modelId}. Contact your administrator to enable access.`,
      );
    }

    throw new Error(
      `${providerName} platform key is disabled for this model. Add your own API key in Settings → Integrations.`,
    );
  }
  
  async buildSystemPrompt(userId: string, projectId?: string | null): Promise<string> {
    const { systemPrompt } = await this.buildPromptLayers(userId, projectId);
    return systemPrompt;
  }

  private async buildPromptLayers(
    userId: string,
    projectId?: string | null,
  ): Promise<{ systemPrompt: string; profilePrompt?: string; preferences: UserPreferences | null }> {
    const preferences = await this.storage.getUserPreferences(userId);
    const project = projectId ? await this.storage.getProject(projectId) : null;

    const systemParts: string[] = [];
    const profileParts: string[] = [];

    // Add knowledge base context - project knowledge if in project, global knowledge otherwise
    try {
      if (projectId) {
        // Fetch project-specific knowledge
        const projectKnowledge = await this.storage.getProjectKnowledge(projectId);
        if (projectKnowledge && projectKnowledge.length > 0) {
          systemParts.push('\n## Project Knowledge Base');
          systemParts.push('The following information is specific to this project and should inform your responses:');

          projectKnowledge.forEach((item, index) => {
            systemParts.push(`\n### ${item.title}`);
            systemParts.push(`Source: ${item.type === 'file' ? `File (${item.fileName})` : item.type === 'url' ? `URL (${item.sourceUrl})` : 'User-provided text'}`);
            systemParts.push(`Content:\n${item.content}`);

            if (index < projectKnowledge.length - 1) {
              systemParts.push('\n---');
            }
          });
        }

        // Also add project custom instructions if available
        if (project?.customInstructions) {
          systemParts.push('\n## Project Instructions');
          systemParts.push(project.customInstructions);
        }

        if (project?.includeGlobalKnowledge === 'true') {
          const knowledgeItems = await this.storage.getEffectiveKnowledgeBase(userId);
          if (knowledgeItems && knowledgeItems.length > 0) {
            systemParts.push('\n## Global Knowledge Base');
            systemParts.push('The following global knowledge items from the user workspace are also available to this project:');

            knowledgeItems.forEach((item, index) => {
              systemParts.push(`\n### ${item.title}`);
              systemParts.push(`Source: ${item.type === 'file' ? `File (${item.fileName})` : item.type === 'url' ? `URL (${item.sourceUrl})` : 'User-provided text'}`);
              systemParts.push(`Content:\n${item.content}`);

              if (index < knowledgeItems.length - 1) {
                systemParts.push('\n---');
              }
            });
          }
        }
      } else {
        // Fetch effective knowledge base (includes all allowed levels: system, team, user)
        const knowledgeItems = await this.storage.getEffectiveKnowledgeBase(userId);
        if (knowledgeItems && knowledgeItems.length > 0) {
          systemParts.push('\n## Knowledge Base');
          systemParts.push('The following information has been provided about the user and should inform your responses:');

          knowledgeItems.forEach((item, index) => {
            systemParts.push(`\n### ${item.title}`);
            systemParts.push(`Source: ${item.type === 'file' ? `File (${item.fileName})` : item.type === 'url' ? `URL (${item.sourceUrl})` : 'User-provided text'}`);
            systemParts.push(`Content:\n${item.content}`);

            if (index < knowledgeItems.length - 1) {
              systemParts.push('\n---');
            }
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch knowledge items:', error);
      // Continue without knowledge base if fetch fails
    }

    const includePersonalization = projectId
      ? project?.includeUserMemories === 'true'
      : preferences?.personalizationEnabled === 'true';

    if (includePersonalization && preferences) {
      if (preferences.name || preferences.occupation || preferences.bio) {
        profileParts.push('\n## User Profile');

        if (preferences.name) {
          profileParts.push(`Name: ${preferences.name}`);
        }

        if (preferences.occupation) {
          profileParts.push(`Occupation: ${preferences.occupation}`);
        }

        if (preferences.bio) {
          profileParts.push(`About: ${preferences.bio}`);
        }
      }

      if (preferences.memories && Array.isArray(preferences.memories) && preferences.memories.length > 0) {
        profileParts.push('\n## Things to Remember');
        preferences.memories.forEach(memory => {
          profileParts.push(`- ${memory}`);
        });
      }

      if (preferences.customInstructions) {
        profileParts.push('\n## User Custom Instructions');
        profileParts.push(preferences.customInstructions);
      }

      if (preferences.chatHistoryEnabled === 'true') {
        profileParts.push('\n## Note');
        profileParts.push('You have access to the conversation history. Use it to maintain context and provide consistent responses.');
      }
    }

    const systemPrompt = systemParts.join('\n').trim();
    const profilePromptContent = profileParts.join('\n').trim();

    return {
      systemPrompt,
      profilePrompt: profilePromptContent ? profilePromptContent : undefined,
      preferences: preferences ?? null,
    };
  }
  
  async getChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const modelConfig = await this.resolveModelConfig(request.model);
    
    if (!modelConfig) {
      throw new Error(`Model ${request.model} not found`);
    }
    
    const apiKey = await this.requireApiKey(request.userId, modelConfig.provider, request.model);

    const { systemPrompt, profilePrompt, preferences } = await this.buildPromptLayers(request.userId, request.projectId);
    // Default to true if preferences don't exist or field is undefined
    const autonomousCodeExecution = preferences?.autonomousCodeExecution === undefined
      ? true
      : preferences.autonomousCodeExecution === 'true';

    // Fetch expert prompt if expertId is provided
    let expertPrompt: string | undefined;
    if (request.expertId) {
      const expert = await this.storage.getExpert(request.expertId);
      if (expert && expert.isActive) {
        expertPrompt = expert.promptContent;
      }
    }

    const taskSummary = request.metadata?.taskSummary?.trim();
    const taskPrompt = taskSummary ? `Goal: ${taskSummary}` : undefined;

    // Assemble final prompt layers through shared builder
    const messages = await assembleRequest({
      systemPrompt,
      expertPrompt,
      taskPrompt,
      profilePrompt,
      messages: request.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      storage: this.storage,
    });

    // Get tool policies with fallback to empty array if there's an error
    let toolPolicies: ToolPolicy[] = [];
    let toolPolicyMap = new Map<string, ToolPolicy>();
    
    try {
      const [policies, release] = await Promise.all([
        this.storage.listToolPoliciesByProvider(modelConfig.provider),
        this.storage.getActiveRelease().catch(() => undefined),
      ]);
      const allowed = release ? new Set((release.toolPolicyIds ?? []).filter(Boolean)) : null;
      toolPolicies = allowed ? policies.filter((policy) => allowed.has(policy.id)) : policies;
      toolPolicyMap = this.buildToolPolicyMap(toolPolicies);
    } catch (error) {
      console.warn(`Could not fetch tool policies for provider ${modelConfig.provider}:`, error);
      // Continue with empty policies - tools will be enabled by default
    }
    
    const messagesWithToolPolicies = this.prependToolPolicyNotice(messages, toolPolicyMap);

    switch (modelConfig.provider) {
      case 'openai':
        return this.getOpenAICompletion(messagesWithToolPolicies, modelConfig, request, autonomousCodeExecution, apiKey, toolPolicyMap);

      case 'anthropic':
        return this.getAnthropicCompletion(messagesWithToolPolicies, modelConfig, request, autonomousCodeExecution, apiKey, toolPolicyMap);

      case 'groq':
        return this.getGroqCompletion(messagesWithToolPolicies, modelConfig, request, autonomousCodeExecution, apiKey, toolPolicyMap);

      case 'perplexity':
        return this.getPerplexityCompletion(messagesWithToolPolicies, modelConfig, request, apiKey, toolPolicyMap);

      case 'openrouter':
        // OpenRouter uses the same OpenAI-compatible chat completion format via its own endpoint.
        return this.getOpenAICompletion(messagesWithToolPolicies, modelConfig, request, autonomousCodeExecution, apiKey, toolPolicyMap);

      default:
        throw new Error(`Provider ${modelConfig.provider} not implemented`);
    }
  }

  private async getOpenAICompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    config: ModelConfig,
    request: ChatCompletionRequest,
    autonomousCodeExecution: boolean,
    apiKey: string,
    toolPolicyMap: Map<string, ToolPolicy>,
  ): Promise<ChatCompletionResponse> {
    const openai = new OpenAI({ apiKey });
    
    // Add tools based on model capabilities and user preferences
    const tools = [] as Array<{ type: 'function'; function: any }>;

    const envWebSearchConfigured = Boolean(process.env.PERPLEXITY_API_KEY);
    const policyAllowsWebSearch = this.isToolEnabled('web_search', toolPolicyMap);
    const webSearchEnabled = config.supportsWebSearch && envWebSearchConfigured && policyAllowsWebSearch;

    if (webSearchEnabled) {
      tools.push({
        type: 'function' as const,
        function: {
          name: 'web_search',
          description: 'Search the web for current information, news, facts, or any real-time data. Use this when you need up-to-date information that may not be in your training data.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query to look up on the web'
              }
            },
            required: ['query']
          }
        }
      });
    }

    const policyAllowsPython = this.isToolEnabled('python_execute', toolPolicyMap);
    const pythonToolEnabled = config.supportsCodeInterpreter && autonomousCodeExecution && policyAllowsPython;

    if (pythonToolEnabled) {
      tools.push({
        type: 'function' as const,
        function: {
          name: 'python_execute',
          description: 'Execute Python code in a sandboxed environment. Use this to perform calculations, data analysis, create visualizations, or run any Python code.',
          parameters: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                description: 'The Python code to execute'
              }
            },
            required: ['code']
          }
        }
      });
    }
    
    // Add thinking mode parameters for reasoning-capable models
    const completionParams: any = {
      model: config.apiModel,
      messages: messages as any,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 2000,
      tools: tools.length > 0 ? tools : undefined,
      stream: false,
    };

    const completion = await openai.chat.completions.create(completionParams);

    const choice = completion.choices[0];

    // Handle tool calls
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      const toolCall = choice.message.tool_calls[0];

      // Handle web search tool call
      if (toolCall.type === 'function' && toolCall.function.name === 'web_search') {
        try {
          if (!policyAllowsWebSearch) {
            return {
              content: this.buildToolBlockedMessage(choice.message.content, 'web_search'),
              model: request.model,
              executedTools: [],
              usage: completion.usage
                ? {
                    promptTokens: completion.usage.prompt_tokens,
                    completionTokens: completion.usage.completion_tokens,
                    totalTokens: completion.usage.total_tokens,
                  }
                : undefined,
            };
          }

          if (!envWebSearchConfigured) {
            console.warn('Web search tool was requested but Perplexity API key is not configured.');
            return {
              content: choice.message.content || '',
              model: config.id,
              usage: completion.usage
                ? {
                    promptTokens: completion.usage.prompt_tokens,
                    completionTokens: completion.usage.completion_tokens,
                    totalTokens: completion.usage.total_tokens,
                  }
                : undefined,
            };
          }
          const args = JSON.parse(toolCall.function.arguments);
          const searchResult = await performWebSearch(args.query);
          
          // Format search results with citations
          let searchContent = `Web search results for "${args.query}":\n\n${searchResult.answer}`;
          if (searchResult.sources && searchResult.sources.length > 0) {
            searchContent += '\n\nSources:\n' + searchResult.sources.map((s, i) => `${i + 1}. ${s}`).join('\n');
          }
          
          // Add tool call message and tool response to conversation
          const updatedMessages = [
            ...messages,
            { role: 'assistant' as const, content: choice.message.content || '', tool_calls: choice.message.tool_calls },
            { role: 'tool' as const, content: searchContent, tool_call_id: toolCall.id }
          ];
          
          // Get final response with search results
          const finalCompletion = await openai.chat.completions.create({
            model: config.apiModel,
            messages: updatedMessages as any,
            temperature: request.temperature ?? 0.7,
            max_tokens: request.maxTokens ?? 2000,
          });
          
          const finalChoice = finalCompletion.choices[0];

          return {
            content: finalChoice.message.content || '',
            model: request.model,
            executedTools: webSearchEnabled ? ['web_search'] : [],
            usage: finalCompletion.usage ? {
              promptTokens: (completion.usage?.prompt_tokens || 0) + (finalCompletion.usage?.prompt_tokens || 0),
              completionTokens: (completion.usage?.completion_tokens || 0) + (finalCompletion.usage?.completion_tokens || 0),
              totalTokens: (completion.usage?.total_tokens || 0) + (finalCompletion.usage?.total_tokens || 0),
            } : undefined,
          };
        } catch (searchError) {
          console.error('Web search error:', searchError);
          // Fall back to response without search on error
        }
      }
      
      // Handle code execution tool call
      if (toolCall.type === 'function' && toolCall.function.name === 'python_execute') {
        if (!policyAllowsPython) {
          return {
            content: this.buildToolBlockedMessage(choice.message.content, 'python_execute'),
            model: request.model,
            executedTools: [],
            usage: completion.usage
              ? {
                  promptTokens: completion.usage.prompt_tokens,
                  completionTokens: completion.usage.completion_tokens,
                  totalTokens: completion.usage.total_tokens,
                }
              : undefined,
          };
        }

        const args = JSON.parse(toolCall.function.arguments);
        const result = await this.executePythonCode(args.code);
        
        // Add tool call message and tool response to conversation
        const updatedMessages = [
          ...messages,
          { role: 'assistant' as const, content: choice.message.content || '', tool_calls: choice.message.tool_calls },
          { role: 'tool' as const, content: result, tool_call_id: toolCall.id }
        ];
        
        // Get final response with tool result
        const finalCompletion = await openai.chat.completions.create({
          model: config.apiModel,
          messages: updatedMessages as any,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 2000,
        });
        
        const finalChoice = finalCompletion.choices[0];

        return {
          content: finalChoice.message.content || '',
          model: request.model,
          executedTools: pythonToolEnabled ? ['python_execute'] : [],
          usage: finalCompletion.usage ? {
            promptTokens: finalCompletion.usage.prompt_tokens,
            completionTokens: finalCompletion.usage.completion_tokens,
            totalTokens: finalCompletion.usage.total_tokens,
          } : undefined,
        };
      }
    }

    return {
      content: choice.message.content || '',
      model: request.model,
      executedTools: [],
      usage: completion.usage ? {
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
      } : undefined,
    };
  }
  
  private async executePythonCode(code: string): Promise<string> {
    // Use Pyodide (WebAssembly Python) for secure code execution
    try {
      // Lazy load and cache Pyodide instance for performance
      if (!this.pyodide) {
        const { loadPyodide } = await import('pyodide');
        
        // Load Pyodide runtime with correct version (v0.28.3)
        this.pyodide = await loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/"
        });
        
        console.log('Pyodide runtime loaded successfully');
      }
      
      // Capture stdout and stderr
      await this.pyodide.runPythonAsync(`
import sys
from io import StringIO
_stdout = StringIO()
_stderr = StringIO()
sys.stdout = _stdout
sys.stderr = _stderr
      `);
      
      // Execute user code
      try {
        await this.pyodide.runPythonAsync(code);
        
        // Get captured output and errors
        const stdout = await this.pyodide.runPythonAsync('_stdout.getvalue()');
        const stderr = await this.pyodide.runPythonAsync('_stderr.getvalue()');
        
        // Reset streams for next execution
        await this.pyodide.runPythonAsync(`
_stdout = StringIO()
_stderr = StringIO()
sys.stdout = _stdout
sys.stderr = _stderr
        `);
        
        if (stderr) {
          return `Error: ${stderr}\n${stdout || ''}`.trim();
        }
        
        return stdout || 'Code executed successfully (no output)';
      } catch (execError: any) {
        // Python execution error (syntax, runtime, etc.)
        return `Python error: ${execError.message}`;
      }
    } catch (error: any) {
      return `Execution error: ${error.message}`;
    }
  }
  
  private async getAnthropicCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    config: ModelConfig,
    request: ChatCompletionRequest,
    autonomousCodeExecution: boolean,
    apiKey: string,
    toolPolicyMap: Map<string, ToolPolicy>,
  ): Promise<ChatCompletionResponse> {
    const anthropic = new Anthropic({ apiKey });

    // Extract system message for Anthropic format
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const conversationMessages = messages.filter(m => m.role !== 'system');

    // Add code execution tool if enabled via user preferences
    const tools = [];
    const policyAllowsPython = this.isToolEnabled('python_execute', toolPolicyMap);
    const pythonToolEnabled = config.supportsCodeInterpreter && autonomousCodeExecution && policyAllowsPython;

    if (pythonToolEnabled) {
      tools.push({
        name: 'python_execute',
        description: 'Execute Python code in a sandboxed environment. Use this to perform calculations, data analysis, create visualizations, or run any Python code.',
        input_schema: {
          type: 'object' as const,
          properties: {
            code: {
              type: 'string' as const,
              description: 'The Python code to execute'
            }
          },
          required: ['code']
        }
      });
    }
    
    // Add thinking mode parameters for Claude models
    const completionParams: any = {
      model: config.apiModel,
      system: systemMessage,
      messages: conversationMessages as any,
      max_tokens: request.maxTokens ?? 2000,
      temperature: request.temperature ?? 0.7,
      tools: tools.length > 0 ? tools : undefined,
    };
    
    // Enable extended thinking for Claude with 10k token budget
    if (config.supportsThinking) {
      completionParams.thinking = {
        type: 'enabled',
        budget_tokens: 10000
      };
    }
    
    const completion = await anthropic.messages.create(completionParams);
    
    // Extract thinking content if present - concatenate all thinking blocks
    const thinkingBlocks = completion.content.filter(block => block.type === 'thinking');
    const thinkingContent = thinkingBlocks.length > 0
      ? thinkingBlocks.map(block => 'text' in block ? block.text : '').join('\n\n').trim()
      : null;
    
    // Handle tool use
    const toolUseBlock = completion.content.find(block => block.type === 'tool_use');
    
    if (toolUseBlock && toolUseBlock.type === 'tool_use' && toolUseBlock.name === 'python_execute') {
      if (!policyAllowsPython) {
        const baseContent = completion.content[0].type === 'text' ? completion.content[0].text : '';
        return {
          content: this.buildToolBlockedMessage(baseContent, 'python_execute'),
          model: request.model,
          thinkingContent: thinkingContent || undefined,
          executedTools: [],
          usage: {
            promptTokens: completion.usage.input_tokens,
            completionTokens: completion.usage.output_tokens,
            totalTokens: completion.usage.input_tokens + completion.usage.output_tokens,
          },
        };
      }

      const toolInput = toolUseBlock.input as { code: string };
      const result = await this.executePythonCode(toolInput.code);
      
      // Add tool use and tool result to conversation
      const updatedMessages = [
        ...conversationMessages,
        { role: 'assistant' as const, content: completion.content },
        { 
          role: 'user' as const, 
          content: [{
            type: 'tool_result' as const,
            tool_use_id: toolUseBlock.id,
            content: [{ type: 'text' as const, text: result }]
          }]
        }
      ];
      
      // Get final response with tool result
      const finalCompletion = await anthropic.messages.create({
        model: config.apiModel,
        system: systemMessage,
        messages: updatedMessages as any,
        max_tokens: request.maxTokens ?? 2000,
        temperature: request.temperature ?? 0.7,
      });
      
      // Extract thinking from final completion if present - concatenate all thinking blocks
      const finalThinkingBlocks = finalCompletion.content.filter(block => block.type === 'thinking');
      const finalThinkingContent = finalThinkingBlocks.length > 0
        ? finalThinkingBlocks.map(block => 'text' in block ? block.text : '').join('\n\n').trim()
        : null;
      
      return {
        content: finalCompletion.content[0].type === 'text' ? finalCompletion.content[0].text : '',
        model: request.model,
        thinkingContent: finalThinkingContent || undefined,
        executedTools: pythonToolEnabled ? ['python_execute'] : [],
        usage: {
          promptTokens: finalCompletion.usage.input_tokens,
          completionTokens: finalCompletion.usage.output_tokens,
          totalTokens: finalCompletion.usage.input_tokens + finalCompletion.usage.output_tokens,
        },
      };
    }

    return {
      content: completion.content[0].type === 'text' ? completion.content[0].text : '',
      model: request.model,
      thinkingContent: thinkingContent || undefined,
      executedTools: [],
      usage: {
        promptTokens: completion.usage.input_tokens,
        completionTokens: completion.usage.output_tokens,
        totalTokens: completion.usage.input_tokens + completion.usage.output_tokens,
      },
    };
  }
  
  private async getGroqCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    config: ModelConfig,
    request: ChatCompletionRequest,
    autonomousCodeExecution: boolean,
    apiKey: string,
    toolPolicyMap: Map<string, ToolPolicy>,
  ): Promise<ChatCompletionResponse> {
    const requestId = generateRequestId();
    const startTime = Date.now();
    const groq = new Groq({ apiKey });

    // Control autonomous tools via system prompt based on user preferences
    const toolConstraints: string[] = [];

    const policyAllowsPython = this.isToolEnabled('python_execute', toolPolicyMap);
    const policyAllowsWebSearch = this.isToolEnabled('web_search', toolPolicyMap);

    // Only allow code execution if user has autonomous execution enabled
    if (!policyAllowsPython && config.supportsCodeInterpreter) {
      toolConstraints.push('python_execute is disabled by administrator policy. Do NOT execute or request code execution.');
    } else if (!autonomousCodeExecution && config.supportsCodeInterpreter) {
      toolConstraints.push('Do NOT execute any code or run Python scripts.');
    }

    if (!policyAllowsWebSearch && config.supportsWebSearch) {
      toolConstraints.push('Web search is disabled by administrator policy. Do NOT request browsing or external research.');
    }

    // Add constraints to system message if needed
    const constrainedMessages = [...messages];
    if (toolConstraints.length > 0) {
      const systemMessageIndex = constrainedMessages.findIndex(m => m.role === 'system');
      const constraints = `\n\nIMPORTANT RESTRICTIONS:\n${toolConstraints.join('\n')}`;
      
      if (systemMessageIndex >= 0) {
        constrainedMessages[systemMessageIndex] = {
          ...constrainedMessages[systemMessageIndex],
          content: constrainedMessages[systemMessageIndex].content + constraints
        };
      } else {
        constrainedMessages.unshift({
          role: 'system',
          content: constraints.trim()
        });
      }
    }
    
    try {
      const completion = await groq.chat.completions.create({
        model: config.apiModel,
        messages: constrainedMessages as any,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2000,
        stream: false,
      });
      
      const latencyMs = Date.now() - startTime;
      const choice = completion.choices[0];
      const responseContent = choice.message.content || '';

      // Get token counts - use actual if available, estimate if not
      const hasActualTokens = completion.usage?.prompt_tokens !== undefined;
      const inputTokens = completion.usage?.prompt_tokens || estimateMessagesTokens(constrainedMessages);
      const outputTokens = completion.usage?.completion_tokens || estimateMessagesTokens([{ role: 'assistant', content: responseContent }]);

      // Record analytics
      await this.recordAnalytics({
        requestId,
        userId: request.userId,
        chatId: undefined, // Chat ID will be set by the caller if available
        projectId: request.projectId,
        expertId: request.expertId,
        templateId: request.metadata?.outputTemplateId,
        provider: 'groq',
        model: config.apiModel,
        status: 'success',
        inputTokens,
        outputTokens,
        tokensEstimated: !hasActualTokens,
        latencyMs,
      });

      return {
        content: responseContent,
        model: request.model,
        executedTools: [],
        usage: completion.usage ? {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens,
        } : undefined,
      };
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      
      // Record error analytics
      await this.recordAnalytics({
        requestId,
        userId: request.userId,
        chatId: undefined,
        projectId: request.projectId,
        expertId: request.expertId,
        templateId: request.metadata?.outputTemplateId,
        provider: 'groq',
        model: config.apiModel,
        status: 'error',
        errorCode: error.code || 'UNKNOWN',
        errorMessage: error.message || 'Unknown error',
        inputTokens: estimateMessagesTokens(constrainedMessages),
        outputTokens: 0,
        tokensEstimated: true,
        latencyMs,
      });

      throw error;
    }
  }
  
  private async getPerplexityCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    config: ModelConfig,
    request: ChatCompletionRequest,
    apiKey: string,
    toolPolicyMap: Map<string, ToolPolicy>,
  ): Promise<ChatCompletionResponse> {
    const policyAllowsWebSearch = this.isToolEnabled('web_search', toolPolicyMap);
    if (!policyAllowsWebSearch) {
      return {
        content: this.buildToolBlockedMessage(null, 'web_search'),
        model: request.model,
        executedTools: [],
      };
    }

    // Enhance messages for Deep Voyage mode
    let enhancedMessages = [...messages];
    const deepVoyageEnabled = request.metadata?.deepVoyageEnabled;
    
    if (deepVoyageEnabled && config.supportsThinking) {
      // Add deep research instructions to system prompt
      const systemMessage = enhancedMessages.find(m => m.role === 'system');
      if (systemMessage) {
        systemMessage.content += `\n\nDEEP RESEARCH MODE ACTIVATED:
- Conduct comprehensive, multi-layered research on the topic
- Explore various perspectives, sources, and data points
- Analyze connections and implications thoroughly
- Provide well-structured, in-depth analysis with supporting evidence
- Think step-by-step through complex questions
- Consider edge cases and alternative viewpoints`;
      }
    }
    
    const response = await fetch(config.endpoint || 'https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.apiModel,
        messages: enhancedMessages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2000,
        stream: false,
        // Additional parameters for deeper research - only for thinking-capable models
        ...(deepVoyageEnabled && config.supportsThinking && {
          search_recency_filter: 'month', // Focus on recent information
          return_citations: true, // Include source citations
        }),
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Perplexity API error: ${error}`);
    }
    
    const data = await response.json();
    const choice = data.choices[0];
    
    // Extract citations if available (only when Deep Voyage is enabled)
    const citations = deepVoyageEnabled && data.citations ? data.citations : [];
    const citationsText = citations.length > 0 
      ? '\n\n**Sources:**\n' + citations.map((c: string, i: number) => `[${i + 1}] ${c}`).join('\n')
      : '';
    
    const executedTools = config.supportsWebSearch && process.env.PERPLEXITY_API_KEY ? ['web_search'] : [];

    return {
      content: (choice.message.content || '') + citationsText,
      model: request.model,
      executedTools,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    };
  }
  
  // Stream completion for real-time responses
  async *streamChatCompletion(request: ChatCompletionRequest): AsyncGenerator<string> {
    const modelConfig = await this.resolveModelConfig(request.model);
    
    if (!modelConfig) {
      throw new Error(`Model ${request.model} not found`);
    }
    
    if (!modelConfig.supportsStreaming) {
      // Fall back to non-streaming for models that don't support it
      const response = await this.getChatCompletion(request);
      yield response.content;
      return;
    }
    
    const { systemPrompt, profilePrompt } = await this.buildPromptLayers(request.userId, request.projectId);

    // Fetch expert prompt if expertId is provided
    let expertPrompt: string | undefined;
    if (request.expertId) {
      const expert = await this.storage.getExpert(request.expertId);
      if (expert && expert.isActive) {
        expertPrompt = expert.promptContent;
      }
    }

    const taskSummary = request.metadata?.taskSummary?.trim();
    const taskPrompt = taskSummary ? `Goal: ${taskSummary}` : undefined;

    // Assemble final prompt layers through shared builder
    const messages = await assembleRequest({
      systemPrompt,
      expertPrompt,
      taskPrompt,
      profilePrompt,
      messages: request.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      storage: this.storage,
    });

    const apiKey = await this.requireApiKey(request.userId, modelConfig.provider, request.model);

    // Get tool policies with fallback to empty array if there's an error
    let toolPolicies: ToolPolicy[] = [];
    let toolPolicyMap = new Map<string, ToolPolicy>();
    
    try {
      const [policies, release] = await Promise.all([
        this.storage.listToolPoliciesByProvider(modelConfig.provider),
        this.storage.getActiveRelease().catch(() => undefined),
      ]);
      const allowed = release ? new Set((release.toolPolicyIds ?? []).filter(Boolean)) : null;
      toolPolicies = allowed ? policies.filter((policy) => allowed.has(policy.id)) : policies;
      toolPolicyMap = this.buildToolPolicyMap(toolPolicies);
    } catch (error) {
      console.warn(`Could not fetch tool policies for provider ${modelConfig.provider}:`, error);
      // Continue with empty policies - tools will be enabled by default
    }
    
    const messagesWithToolPolicies = this.prependToolPolicyNotice(messages, toolPolicyMap);

    switch (modelConfig.provider) {
      case 'openai':
        yield* this.streamOpenAICompletion(messagesWithToolPolicies, modelConfig, request, apiKey, toolPolicyMap);
        break;

      case 'anthropic':
        yield* this.streamAnthropicCompletion(messagesWithToolPolicies, modelConfig, request, apiKey, toolPolicyMap);
        break;

      case 'groq':
        yield* this.streamGroqCompletion(messagesWithToolPolicies, modelConfig, request, apiKey, toolPolicyMap);
        break;

      case 'perplexity':
        yield* this.streamPerplexityCompletion(messagesWithToolPolicies, modelConfig, request, apiKey, toolPolicyMap);
        break;
      
      default:
        throw new Error(`Streaming not implemented for ${modelConfig.provider}`);
    }
  }
  
  private async *streamOpenAICompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    config: ModelConfig,
    request: ChatCompletionRequest,
    apiKey: string,
    _toolPolicyMap: Map<string, ToolPolicy>,
  ): AsyncGenerator<string> {
    const openai = new OpenAI({ apiKey });

    const stream = await openai.chat.completions.create({
      model: config.apiModel,
      messages: messages as any,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 2000,
      stream: true,
    });
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }
  
  private async *streamAnthropicCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    config: ModelConfig,
    request: ChatCompletionRequest,
    apiKey: string,
    _toolPolicyMap: Map<string, ToolPolicy>,
  ): AsyncGenerator<string> {
    const anthropic = new Anthropic({ apiKey });

    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const conversationMessages = messages.filter(m => m.role !== 'system');

    const stream = await anthropic.messages.create({
      model: config.apiModel,
      system: systemMessage,
      messages: conversationMessages as any,
      max_tokens: request.maxTokens ?? 2000,
      temperature: request.temperature ?? 0.7,
      stream: true,
    });
    
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        yield chunk.delta.text;
      }
    }
  }
  
  private async *streamGroqCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    config: ModelConfig,
    request: ChatCompletionRequest,
    apiKey: string,
    toolPolicyMap: Map<string, ToolPolicy>,
  ): AsyncGenerator<string> {
    const requestId = generateRequestId();
    const startTime = Date.now();
    const groq = new Groq({ apiKey });

    const policyAllowsPython = this.isToolEnabled('python_execute', toolPolicyMap);
    const policyAllowsWebSearch = this.isToolEnabled('web_search', toolPolicyMap);

    const constrainedMessages = [...messages];
    const toolConstraints: string[] = [];

    if (!policyAllowsPython && config.supportsCodeInterpreter) {
      toolConstraints.push('python_execute is disabled by administrator policy. Do NOT execute or request code execution.');
    }

    if (!policyAllowsWebSearch && config.supportsWebSearch) {
      toolConstraints.push('Web search is disabled by administrator policy. Do NOT request browsing or external research.');
    }

    if (toolConstraints.length > 0) {
      const systemMessageIndex = constrainedMessages.findIndex(m => m.role === 'system');
      const constraints = `\n\nIMPORTANT RESTRICTIONS:\n${toolConstraints.join('\n')}`;

      if (systemMessageIndex >= 0) {
        constrainedMessages[systemMessageIndex] = {
          ...constrainedMessages[systemMessageIndex],
          content: constrainedMessages[systemMessageIndex].content + constraints,
        };
      } else {
        constrainedMessages.unshift({ role: 'system', content: constraints.trim() });
      }
    }

    let fullResponse = '';
    try {
      const stream = await groq.chat.completions.create({
        model: config.apiModel,
        messages: constrainedMessages as any,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2000,
        stream: true,
      });
      
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          fullResponse += content;
          yield content;
        }
      }

      // Record analytics after streaming completes
      const latencyMs = Date.now() - startTime;
      const inputTokens = estimateMessagesTokens(constrainedMessages);
      const outputTokens = estimateMessagesTokens([{ role: 'assistant', content: fullResponse }]);

      await this.recordAnalytics({
        requestId,
        userId: request.userId,
        chatId: undefined,
        projectId: request.projectId,
        expertId: request.expertId,
        templateId: request.metadata?.outputTemplateId,
        provider: 'groq',
        model: config.apiModel,
        status: 'success',
        inputTokens,
        outputTokens,
        tokensEstimated: true, // Streaming doesn't return token counts
        latencyMs,
      });
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      
      // Record error analytics
      await this.recordAnalytics({
        requestId,
        userId: request.userId,
        chatId: undefined,
        projectId: request.projectId,
        expertId: request.expertId,
        templateId: request.metadata?.outputTemplateId,
        provider: 'groq',
        model: config.apiModel,
        status: 'error',
        errorCode: error.code || 'UNKNOWN',
        errorMessage: error.message || 'Unknown error',
        inputTokens: estimateMessagesTokens(constrainedMessages),
        outputTokens: fullResponse ? estimateMessagesTokens([{ role: 'assistant', content: fullResponse }]) : 0,
        tokensEstimated: true,
        latencyMs,
      });

      throw error;
    }
  }
  
  private async *streamPerplexityCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    config: ModelConfig,
    request: ChatCompletionRequest,
    apiKey: string,
    toolPolicyMap: Map<string, ToolPolicy>,
  ): AsyncGenerator<string> {
    if (!this.isToolEnabled('web_search', toolPolicyMap)) {
      yield this.buildToolBlockedMessage(null, 'web_search');
      return;
    }

    // Perplexity streaming would require SSE implementation
    // For now, fall back to non-streaming
    const response = await this.getPerplexityCompletion(messages, config, request, apiKey, toolPolicyMap);
    yield response.content;
  }
}

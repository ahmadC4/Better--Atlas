import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { ChatSidebar } from './ChatSidebar';
import { ChatHeader } from './ChatHeader';
import { ChatMessages } from './ChatMessages';
import type { ChatMessagesHandle } from './ChatMessages';
import { ChatInput } from './ChatInput';
import { useTheme } from './ThemeProvider';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { 
  useEffectiveCapabilities, 
  canUseModel,
  canUseExperts,
  canUseTemplates 
} from '@/hooks/use-effective-capabilities';
import { Button } from '@/components/ui/button';
import { getChatCapableModels, type Chat, type Message, type Attachment, type AIModel, type ApiProvider, getModelById } from '@shared/schema';

interface FileAttachment {
  id: string;
  file: File;
  preview?: string;
  type: 'image' | 'document' | 'video' | 'other';
}

type ChatRequestMetadata = {
  deepVoyageEnabled?: boolean;
  taskSummary?: string;
  outputTemplateId?: string | null;
};

type StreamSegment =
  | { type: 'text'; content: string }
  | { type: 'code'; content: string; lang: string; rawLang?: string };

interface StreamingAssistantState {
  id: string;
  segments: StreamSegment[];
  metadata?: Message['metadata'];
  isComplete?: boolean;
}

const segmentsToString = (segments: StreamSegment[]): string =>
  segments
    .map((segment) => {
      if (segment.type === 'code') {
        const langToken = segment.rawLang ?? (segment.lang === 'text' ? '' : segment.lang);
        return `\`\`\`${langToken}\n${segment.content}\n\`\`\``;
      }
      return segment.content;
    })
    .join('');

export function Chat() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }
    return window.innerWidth >= 768;
  });
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState('compound');
  const [selectedExpert, setSelectedExpert] = useState<string | null>(null);
  const [triggerKnowledgeDialog, setTriggerKnowledgeDialog] = useState(false);
  const [triggerNewProjectDialog, setTriggerNewProjectDialog] = useState(false);
  const [currentLocation, navigate] = useLocation();
  const [settingsTrigger, setSettingsTrigger] = useState<{ tab?: string; focusProvider?: ApiProvider | null } | null>(null);
  const { theme } = useTheme();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const chatMessagesRef = useRef<ChatMessagesHandle | null>(null);
  const [inputHeight, setInputHeight] = useState(0);
  const previousPlanRef = useRef<'free' | 'pro' | 'enterprise'>('free');
  const [pendingUserMessage, setPendingUserMessage] = useState<Message | null>(null);
  const [streamingAssistantMessage, setStreamingAssistantMessage] = useState<StreamingAssistantState | null>(null);
  const streamingStartedAtRef = useRef<number | null>(null);
  const [streamingStatus, setStreamingStatus] = useState<'idle' | 'streaming' | 'completed'>('idle');
  const [streamingActivity, setStreamingActivity] = useState<string | null>(null);
  const streamingActivityTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const initialScrollDoneRef = useRef(false);

  const clearStreamingActivityTimers = () => {
    streamingActivityTimersRef.current.forEach(clearTimeout);
    streamingActivityTimersRef.current = [];
  };

  const scheduleStreamingActivity = (message: string | null, delay: number) => {
    const timer = setTimeout(() => setStreamingActivity(message), delay);
    streamingActivityTimersRef.current.push(timer);
  };

  const scrollMessagesToTop = (behavior: ScrollBehavior = 'smooth') => {
    chatMessagesRef.current?.scrollToTop({ behavior });
  };

  useEffect(() => {
    return () => {
      clearStreamingActivityTimers();
    };
  }, []);

  useEffect(() => {
    const queryIndex = currentLocation.indexOf('?');
    if (queryIndex === -1) {
      return;
    }

    const search = currentLocation.slice(queryIndex + 1);
    if (!search) {
      return;
    }

    const params = new URLSearchParams(search);
    const settingsParam = params.get('settings');

    if (!settingsParam) {
      return;
    }

    const providerParam = params.get('provider');
    const allowedProviders: ApiProvider[] = ['openai', 'anthropic', 'groq', 'perplexity', 'n8n', 'notion'];
    let provider: ApiProvider | null = null;
    if (providerParam && allowedProviders.includes(providerParam as ApiProvider)) {
      provider = providerParam as ApiProvider;
    }

    setSettingsTrigger({
      tab: settingsParam,
      focusProvider: provider,
    });

    const basePath = currentLocation.slice(0, queryIndex) || '/';
    navigate(basePath, { replace: true });
  }, [currentLocation, navigate]);

  const { user, isAuthenticated } = useAuth();
  const { data: capabilities } = useEffectiveCapabilities();

  // Get plan tier from capabilities, with fallback for loading state
  const plan: 'free' | 'pro' | 'enterprise' = capabilities?.plan.tier as 'free' | 'pro' | 'enterprise' || 'free';
  
  // Build enabledFeatures array for backward compatibility with ChatInput (will be removed later)
  const enabledFeatures = useMemo(() => {
    if (!capabilities) return [];
    const features: string[] = [];
    if (capabilities.features.experts.allowed) features.push('experts');
    if (capabilities.features.templates.allowed) features.push('templates');
    if (capabilities.features.models.allowed) features.push('models');
    if (capabilities.features.memory) features.push('memory');
    if (capabilities.features.agents) features.push('agents');
    if (capabilities.features.api_access.allowed) features.push('api_access');
    // Add deep-research if it's available (keeping this for compatibility)
    features.push('deep-research');
    return features;
  }, [capabilities]);

  // Fetch available models from API
  const { data: modelsApiData } = useQuery<{ models: any[] }>({
    queryKey: ['/api/models'],
    enabled: isAuthenticated,
  });

  const availableModels: AIModel[] = useMemo(() => {
    // If models are fetched from API, use them
    if (modelsApiData?.models && modelsApiData.models.length > 0) {
      return modelsApiData.models.map((model: any) => ({
        id: model.modelId,
        name: model.displayName,
        provider: model.provider.charAt(0).toUpperCase() + model.provider.slice(1) as 'OpenAI' | 'Anthropic' | 'Groq' | 'Perplexity',
        contextLimit: model.contextWindow || 8192,
        maxOutput: model.maxOutputTokens || 4096,
        status: model.isActive ? 'current' : 'legacy' as 'current' | 'legacy',
        capability: {
          audio: model.capabilities?.audio || false,
          vision: model.capabilities?.vision || false,
          search: model.capabilities?.web || false,
        },
      }));
    }
    
    // Fallback to hardcoded models if API is not available
    const chatCapableModels = getChatCapableModels();
    const defaultLegacyIds = chatCapableModels.filter(model => model.status === 'legacy').map(model => model.id);
    const modelsWithStatus = chatCapableModels.map(model => ({
      ...model,
      status: model.status === 'legacy' ? 'legacy' : undefined,
    }));

    // Use the allowlists from capabilities to filter models
    if (capabilities?.allowlists.models && capabilities.allowlists.models.length > 0) {
      const allowedIds = new Set(capabilities.allowlists.models);
      const filtered = modelsWithStatus.filter(model => allowedIds.has(model.id));
      return filtered.length > 0 ? filtered : modelsWithStatus;
    }
    
    // If models feature is enabled but no allowlist, show all models for pro/enterprise
    if (capabilities?.features.models.allowed && (plan === 'pro' || plan === 'enterprise')) {
      return modelsWithStatus;
    }
    
    // Default to Groq models for free users
    return modelsWithStatus.filter(model => model.provider.toLowerCase() === 'groq');
  }, [modelsApiData, capabilities, plan]);

  // Use max file size from capabilities
  const fallbackFileUploadLimitMb = plan === 'enterprise' ? 100 : plan === 'pro' ? 25 : 10;
  const configuredFileUploadLimitMb = capabilities?.limits.max_file_size_mb ?? fallbackFileUploadLimitMb;
  const maxFileSizeBytes = configuredFileUploadLimitMb * 1024 * 1024;

  const isDarkMode = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    } else {
      setIsSidebarOpen(true);
    }
  }, [isMobile]);

  useEffect(() => {
    const defaultModelId = capabilities?.allowlists.models?.[0] || (plan !== 'free' ? 'gpt-5' : 'compound');

    if (availableModels.length === 0) {
      previousPlanRef.current = plan;
      return;
    }

    const allowedIds = new Set(availableModels.map(model => model.id));

    if (!allowedIds.has(selectedModel)) {
      if (allowedIds.has(defaultModelId)) {
        setSelectedModel(defaultModelId);
      } else {
        setSelectedModel(availableModels[0].id);
      }
      previousPlanRef.current = plan;
      return;
    }

    if (
      previousPlanRef.current !== plan &&
      plan === 'pro' &&
      allowedIds.has(defaultModelId) &&
      selectedModel !== defaultModelId
    ) {
      setSelectedModel(defaultModelId);
    }

    previousPlanRef.current = plan;
  }, [availableModels, capabilities?.allowlists.models, plan, selectedModel]);

  // Fetch chats for default user (only global chats, not project chats)
  const { data: chats = [], isLoading: isLoadingChats } = useQuery<Chat[]>({
    queryKey: ['/api/chats', 'default-user'],
    queryFn: async () => {
      const response = await fetch('/api/chats/default-user', {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch chats');
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Fetch messages for active chat
  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<Message[]>({
    queryKey: ['/api/chats', activeChat, 'messages'],
    enabled: !!activeChat,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Define scrollMessagesToBottom AFTER messages is declared to avoid TDZ error
  const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (streamingAssistantMessage) {
      chatMessagesRef.current?.scrollToMessage(streamingAssistantMessage.id, {
        behavior,
        block: 'start',
      });
      return;
    }

    if (pendingUserMessage) {
      chatMessagesRef.current?.scrollToMessage(pendingUserMessage.id, {
        behavior,
        block: 'end',
      });
      return;
    }

    if (messages && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      chatMessagesRef.current?.scrollToMessage(lastMessage.id, {
        behavior,
        block: lastMessage.role === 'assistant' ? 'start' : 'end',
      });
      return;
    }

    chatMessagesRef.current?.scrollToTop({ behavior });
  }, [messages, pendingUserMessage, streamingAssistantMessage]);

  // Refetch messages when activeChat changes to ensure fresh data
  useEffect(() => {
    if (activeChat) {
      queryClient.invalidateQueries({ queryKey: ['/api/chats', activeChat, 'messages'] });
    }
  }, [activeChat, queryClient]);

  // Sync selected expert with active chat's last assistant message
  useEffect(() => {
    if (!activeChat || messages.length === 0) {
      setSelectedExpert(null);
      return;
    }

    // Find the last assistant message with expertId in metadata
    const lastAssistantMessage = [...messages]
      .reverse()
      .find((msg: Message) => msg.role === 'assistant' && msg.metadata?.expertId);

    if (lastAssistantMessage?.metadata?.expertId) {
      setSelectedExpert(lastAssistantMessage.metadata.expertId as string);
    } else {
      setSelectedExpert(null);
    }
  }, [activeChat, messages]);

  const currentChat = chats.find((chat: Chat) => chat.id === activeChat);

  // Create new chat mutation
  const createChatMutation = useMutation({
    mutationFn: async (data: { title: string; model: string; projectId?: string | null }) => {
      const response = await apiRequest('POST', '/api/chats', {
        userId: 'default-user', // In a real app, this would come from auth
        title: data.title,
        model: data.model,
        projectId: data.projectId ?? undefined,
      });
      return response.json();
    },
    onSuccess: (newChat) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats', 'default-user'] });
      setActiveChat(newChat.id);
      toast({
        title: 'New chat created',
        description: 'Started a new conversation.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to create new chat.',
        variant: 'destructive',
      });
      console.error('Failed to create chat:', error);
    },
  });

  // Archive chat mutation
  const archiveChatMutation = useMutation({
    mutationFn: async (chatId: string) => {
      await apiRequest('PATCH', `/api/chats/${chatId}/archive`);
    },
    onSuccess: (_, archivedChatId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats', 'default-user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/chats/archived'] });
      if (activeChat === archivedChatId) {
        setActiveChat(null);
      }
      toast({
        title: 'Chat archived',
        description: 'The conversation has been archived.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to archive chat.',
        variant: 'destructive',
      });
      console.error('Failed to archive chat:', error);
    },
  });

  const deleteChatMutation = useMutation({
    mutationFn: async (chatId: string) => {
      await apiRequest('DELETE', `/api/chats/${chatId}`);
    },
    onSuccess: (_, deletedChatId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats', 'default-user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/chats/archived'] });
      if (activeChat === deletedChatId) {
        setActiveChat(null);
      }
      toast({
        title: 'Chat deleted',
        description: 'The conversation has been permanently removed.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to delete chat.',
        variant: 'destructive',
      });
      console.error('Failed to delete chat:', error);
    },
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (data: {
      chatId: string;
      content: string;
      model: string;
      expertId?: string | null;
      attachments?: Attachment[];
      metadata?: ChatRequestMetadata;
      history: Message[];
    }) => {
      const baseMessages = data.history.map((message) => ({
        role: message.role,
        content: message.content,
      }));

      const requestBody = {
        model: data.model,
        messages: [
          ...baseMessages,
          { role: 'user' as const, content: data.content }
        ],
        chatId: data.chatId,
        userId: 'default-user',
        expertId: data.expertId,
        attachments: data.attachments,
        metadata: data.metadata,
      };

      const streamingId = `stream-${Date.now()}`;
      const userMessage: Message = {
        id: `temp-user-${Date.now()}`,
        chatId: data.chatId,
        role: 'user',
        content: data.content,
        createdAt: new Date().toISOString(),
        attachments: data.attachments || null,
        metadata: data.metadata as Message['metadata'],
      } as Message;

      setPendingUserMessage(userMessage);
      setStreamingAssistantMessage({ id: streamingId, segments: [], metadata: undefined, isComplete: false });
      streamingStartedAtRef.current = Date.now();
      setStreamingStatus('streaming');

      const modelDetails = getModelById(data.model);
      const hasAttachments = (data.attachments?.length ?? 0) > 0;
      clearStreamingActivityTimers();

      if (hasAttachments) {
        setStreamingActivity('Reviewing your attachments...');
      } else if (data.metadata?.deepVoyageEnabled) {
        setStreamingActivity('Exploring deep research threads...');
      } else {
        setStreamingActivity('Analyzing your request...');
      }

      if (modelDetails?.capabilities.includes('search')) {
        scheduleStreamingActivity('Searching the web for fresh insights...', 1200);
      }

      if (modelDetails?.capabilities.includes('code')) {
        scheduleStreamingActivity('Running data tools for deeper analysis...', 2600);
      }

      scheduleStreamingActivity('Composing a polished response...', 4200);

      const response = await apiRequest('POST', '/api/chat/completions/stream', requestBody);

      if (!response.body) {
        throw new Error('Streaming not supported by server response.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let donePayload: { content?: string; metadata?: Message['metadata'] } | null = null;
      let lastSegments: StreamSegment[] = [];

      const updateSegments = (updater: (segments: StreamSegment[]) => StreamSegment[]) => {
        setStreamingAssistantMessage((prev) => {
          const base = prev && prev.id === streamingId
            ? prev
            : { id: streamingId, segments: [], metadata: undefined, isComplete: false };
          const nextSegments = updater(base.segments);
          lastSegments = nextSegments;
          return { ...base, id: streamingId, segments: nextSegments };
        });
      };

      const appendText = (text: string) => {
        if (!text) return;
        updateSegments((segments) => {
          if (segments.length > 0 && segments[segments.length - 1].type === 'text') {
            const next = [...segments];
            const last = next[next.length - 1] as Extract<StreamSegment, { type: 'text' }>;
            next[next.length - 1] = { ...last, content: last.content + text };
            return next;
          }
          return [...segments, { type: 'text', content: text }];
        });
      };

      const appendCode = (payload: { text?: string; lang?: string; rawLang?: string }) => {
        const text = payload.text ?? '';
        if (!text && !payload.lang && !payload.rawLang) {
          return;
        }

        updateSegments((segments) => {
          if (segments.length > 0 && segments[segments.length - 1].type === 'code') {
            const next = [...segments];
            const last = next[next.length - 1] as Extract<StreamSegment, { type: 'code' }>;
            next[next.length - 1] = {
              ...last,
              content: last.content + text,
            };
            return next;
          }

          return [
            ...segments,
            {
              type: 'code',
              content: text,
              lang: payload.lang || 'text',
              rawLang: payload.rawLang,
            },
          ];
        });
      };

      while (true) {
        const { value, done } = await reader.read();
        if (value) {
          buffer += decoder.decode(value, { stream: true });

          let boundaryIndex: number;
          while ((boundaryIndex = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, boundaryIndex);
            buffer = buffer.slice(boundaryIndex + 2);

            if (!rawEvent.trim()) {
              continue;
            }

            const lines = rawEvent.split('\n');
            let eventType = 'text_delta';
            const dataLines: string[] = [];

            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trim());
              }
            }

            const dataString = dataLines.join('\n');
            let payload: any = {};
            if (dataString) {
              try {
                payload = JSON.parse(dataString);
              } catch {
                payload = { text: dataString };
              }
            }

            switch (eventType) {
              case 'text_delta':
                appendText(payload.text ?? '');
                break;
              case 'code_start':
                updateSegments((segments) => [
                  ...segments,
                  {
                    type: 'code',
                    content: '',
                    lang: payload.lang || 'text',
                    rawLang: payload.rawLang,
                  },
                ]);
                break;
              case 'code_delta':
                appendCode(payload);
                break;
              case 'code_end':
                break;
              case 'done':
                donePayload = {
                  content: payload.content,
                  metadata: payload.metadata as Message['metadata'] | undefined,
                };
                setStreamingAssistantMessage((prev) =>
                  prev && prev.id === streamingId
                    ? { ...prev, metadata: payload.metadata, isComplete: true }
                    : prev,
                );
                break;
              case 'error':
                throw new Error(payload.message || 'Streaming error');
              default:
                if (payload.text) {
                  appendText(payload.text);
                }
                break;
            }
          }
        }

        if (done) {
          break;
        }
      }

      if (buffer.trim()) {
        appendText(buffer);
      }

      setStreamingStatus('completed');

      const finalSegments = lastSegments;
      const finalContent = donePayload?.content ?? segmentsToString(finalSegments);
      const finalMetadata = donePayload?.metadata;

      return { content: finalContent, metadata: finalMetadata };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats', activeChat, 'messages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/chats', 'default-user'] });
    },
    onError: (error) => {
      let description = 'Failed to send message. Please try again.';
      if (error instanceof Error) {
        const message = error.message || '';
        const jsonStart = message.indexOf('{');
        if (jsonStart !== -1) {
          try {
            const parsed = JSON.parse(message.slice(jsonStart));
            if (parsed && typeof parsed === 'object') {
              description = parsed.error || parsed.message || description;
            }
          } catch {
            const fallback = message.slice(message.indexOf(':') + 1).trim();
            if (fallback) {
              description = fallback;
            }
          }
        } else if (message) {
          description = message;
        }
      }

      toast({
        title: 'Error',
        description,
        variant: 'destructive',
      });
      setPendingUserMessage(null);
      setStreamingAssistantMessage(null);
      setStreamingStatus('idle');
      streamingStartedAtRef.current = null;
      clearStreamingActivityTimers();
      setStreamingActivity(null);
      console.error('Failed to send message:', error);
    },
  });

  useEffect(() => {
    const behavior: ScrollBehavior = initialScrollDoneRef.current ? 'smooth' : 'auto';
    scrollMessagesToBottom(behavior);
    initialScrollDoneRef.current = true;
  }, [messages, pendingUserMessage, streamingAssistantMessage, scrollMessagesToBottom]);

  useEffect(() => {
    initialScrollDoneRef.current = false;
    scrollMessagesToBottom('auto');
  }, [activeChat, scrollMessagesToBottom]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleViewportChange = () => {
      scrollMessagesToBottom('auto');
    };

    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', handleViewportChange);
    window.addEventListener('focusin', handleViewportChange);

    return () => {
      viewport?.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('focusin', handleViewportChange);
    };
  }, [scrollMessagesToBottom]);

  const getTimestamp = (value: unknown): number => {
    if (!value) return 0;
    if (value instanceof Date) {
      return value.getTime();
    }
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  const getMessageTimestamp = (message: Message): number => {
    const anyMessage = message as any;
    return getTimestamp(anyMessage?.updatedAt) || getTimestamp(anyMessage?.createdAt);
  };

  useEffect(() => {
    if (streamingStatus !== 'completed') {
      return;
    }

    const startedAt = streamingStartedAtRef.current;

    const hasAssistantUpdate = messages.some((msg: Message) => {
      if (msg.role !== 'assistant') return false;
      if (!startedAt) return true;
      return getMessageTimestamp(msg) >= startedAt;
    });

    if (hasAssistantUpdate) {
      setStreamingAssistantMessage(null);
      setStreamingStatus('idle');
      streamingStartedAtRef.current = null;
    }

    const hasUserEcho = messages.some((msg: Message) => {
      if (msg.role !== 'user') return false;
      if (!startedAt) return true;
      return getMessageTimestamp(msg) >= startedAt;
    });

    if (hasUserEcho) {
      setPendingUserMessage(null);
    }
  }, [messages, streamingStatus]);

  useEffect(() => {
    const executedTools = streamingAssistantMessage?.metadata?.executedTools;
    if (!executedTools || executedTools.length === 0) {
      return;
    }

    const normalized = executedTools.map(tool => tool.toLowerCase());
    if (normalized.some(tool => tool.includes('search'))) {
      clearStreamingActivityTimers();
      setStreamingActivity('Reviewing web research to cite sources...');
    } else if (normalized.some(tool => tool.includes('python'))) {
      clearStreamingActivityTimers();
      setStreamingActivity('Processing code results for insights...');
    }
  }, [streamingAssistantMessage?.metadata?.executedTools]);

  useEffect(() => {
    if (streamingStatus === 'idle') {
      clearStreamingActivityTimers();
      setStreamingActivity(null);
    }
  }, [streamingStatus]);

  useEffect(() => {
    setPendingUserMessage(null);
    setStreamingAssistantMessage(null);
    setStreamingStatus('idle');
    streamingStartedAtRef.current = null;
    clearStreamingActivityTimers();
    setStreamingActivity(null);
  }, [activeChat]);

  // Set initial active chat when chats are loaded
  useEffect(() => {
    if (chats.length > 0 && !activeChat) {
      setActiveChat(chats[0].id);
    }
  }, [chats, activeChat]);

  const currentModelDetails = useMemo(() => getModelById(selectedModel), [selectedModel]);

  const capabilityNotice = useMemo(() => {
    if (!currentModelDetails) {
      return null;
    }

    const supportsSearch = currentModelDetails.capabilities.includes('search');
    const supportsCode = currentModelDetails.capabilities.includes('code');

    if (supportsSearch && supportsCode) {
      return `${currentModelDetails.name} can browse the web and run code automatically when it helps your answer.`;
    }

    if (supportsSearch) {
      return `${currentModelDetails.name} can browse the web automatically when additional context is needed.`;
    }

    if (supportsCode) {
      return `${currentModelDetails.name} can run code automatically when calculations are required.`;
    }

    return null;
  }, [currentModelDetails]);

  const handleInputHeightChange = useCallback((height: number) => {
    setInputHeight(height);
  }, []);

  const handleScrollToTop = () => {
    scrollMessagesToTop();
  };

  const handleNewChat = (projectId?: string | null) => {
    createChatMutation.mutate({
      title: 'New Conversation',
      model: selectedModel,
      projectId: projectId ?? undefined,
    });
  };

  const handleChatSelect = (chatId: string) => {
    setActiveChat(chatId);
  };

  const handleChatArchive = (chatId: string) => {
    archiveChatMutation.mutate(chatId);
  };

  const handleChatDelete = (chatId: string) => {
    deleteChatMutation.mutate(chatId);
  };

  const handleSendMessage = async (
    content: string,
    files?: FileAttachment[],
    metadata?: ChatRequestMetadata
  ) => {
    if (sendMessageMutation.isPending) {
      return;
    }

    let attachments: Attachment[] = [];
    
    // Upload files if present
    if (files && files.length > 0) {
      try {
        const uploadPromises = files.map(async (fileAttachment) => {
          const { file } = fileAttachment;
          
          // Convert file to base64
          const arrayBuffer = await file.arrayBuffer();
          const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
          
          // Upload to backend
          const response = await apiRequest('POST', '/api/uploads', {
            name: file.name,
            mimeType: file.type,
            data: base64Data,
          });
          
          return await response.json();
        });
        
        attachments = await Promise.all(uploadPromises);
      } catch (error) {
        console.error('Failed to upload files:', error);
        toast({
          title: 'Upload Error',
          description: 'Failed to upload one or more files.',
          variant: 'destructive',
        });
        return;
      }
    }
    
    // If no active chat, create a new one first
    if (!activeChat) {
      try {
        const newChat = await createChatMutation.mutateAsync({
          title: content.slice(0, 50) + (content.length > 50 ? '...' : ''),
          model: selectedModel,
        });
        
        // Send message to the new chat
        sendMessageMutation.mutate({
          chatId: newChat.id,
          content,
          model: selectedModel,
          expertId: selectedExpert,
          attachments: attachments.length > 0 ? attachments : undefined,
          metadata,
          history: [],
        });
      } catch (error) {
        console.error('Failed to create chat and send message:', error);
      }
    } else {
      // Send to existing chat
      sendMessageMutation.mutate({
        chatId: activeChat,
        content,
        model: selectedModel,
        expertId: selectedExpert,
        attachments: attachments.length > 0 ? attachments : undefined,
        metadata,
        history: messages,
      });
    }
  };

  const handleCopyMessage = (content: string) => {
    toast({
      title: 'Copied!',
      description: 'Message copied to clipboard.',
    });
  };

  const handleRegenerateResponse = (messageId: string) => {
    console.log('Regenerating response for message:', messageId);
    toast({
      title: 'Regenerating...',
      description: 'Creating a new response.',
    });
  };

  const handleOpenKnowledgeDialog = () => {
    setTriggerKnowledgeDialog(true);
  };

  const handleOpenNewProjectDialog = () => {
    setTriggerNewProjectDialog(true);
  };

  return (
    <div className="relative flex h-dvh max-h-dvh w-full overflow-hidden bg-background">
      {/* Sidebar */}
      <div className={cn(
        'transition-all duration-300 ease-in-out',
        'fixed inset-y-0 left-0 z-50 lg:static lg:z-auto',
        'bg-sidebar text-sidebar-foreground shadow-lg lg:shadow-none',
        isSidebarOpen ? 'w-[280px] sm:w-[320px]' : 'w-0',
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        <ChatSidebar
          isOpen={isSidebarOpen}
          onNewChat={() => handleNewChat(null)}
          chats={chats.map((chat: Chat) => ({
            id: chat.id,
            title: chat.title,
            updatedAt: chat.updatedAt || chat.createdAt,
            projectId: chat.projectId ?? null,
          }))}
          activeChat={activeChat}
          onChatSelect={handleChatSelect}
          onChatArchive={handleChatArchive}
          onChatDelete={handleChatDelete}
          triggerOpenKnowledgeDialog={triggerKnowledgeDialog}
          onKnowledgeDialogOpened={() => setTriggerKnowledgeDialog(false)}
          triggerOpenNewProjectDialog={triggerNewProjectDialog}
          onNewProjectDialogOpened={() => setTriggerNewProjectDialog(false)}
          triggerOpenSettings={settingsTrigger}
          onSettingsTriggerHandled={() => setSettingsTrigger(null)}
        />
      </div>

      {/* Mobile sidebar backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex min-h-0 flex-1 flex-col min-w-0">
        <ChatHeader
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          availableModels={availableModels}
          onHomeClick={handleScrollToTop}
          showNewChatButton={!isSidebarOpen}
          onNewChat={() => handleNewChat(null)}
          isCreatingNewChat={createChatMutation.isPending}
          chatTitle={currentChat?.title ?? 'New Conversation'}
          capabilityNotice={capabilityNotice}
        />

        <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
          <ChatMessages
            ref={chatMessagesRef}
            messages={messages}
            pendingUserMessage={pendingUserMessage ?? undefined}
            streamingAssistantMessage={streamingAssistantMessage}
            isLoading={sendMessageMutation.isPending && !streamingAssistantMessage}
            onCopyMessage={handleCopyMessage}
            onRegenerateResponse={handleRegenerateResponse}
            isDarkMode={isDarkMode}
            streamingActivity={streamingActivity}
            bottomOffset={inputHeight}
          />
        </div>

        <ChatInput
          key={activeChat ?? 'new-chat'}
          onSendMessage={handleSendMessage}
          isLoading={sendMessageMutation.isPending}
          placeholder="Ask anything"
          selectedModel={selectedModel}
          selectedExpert={selectedExpert}
          onExpertChange={setSelectedExpert}
          onOpenKnowledgeDialog={handleOpenKnowledgeDialog}
          onOpenNewProjectDialog={handleOpenNewProjectDialog}
          maxFileSizeBytes={maxFileSizeBytes}
          enabledFeatures={enabledFeatures}
          onHeightChange={handleInputHeightChange}
        />
      </div>
    </div>
  );
}
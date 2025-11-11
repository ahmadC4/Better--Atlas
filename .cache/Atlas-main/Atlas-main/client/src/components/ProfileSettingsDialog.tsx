import { useState, useEffect, useRef, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { X, User, Settings, Link2, CreditCard, Trash2, Plus, Brain, History, Cloud, Upload, Camera, Crown, LogOut, Book, FileText, ExternalLink, Type, Loader2, ChevronDown, Infinity, Mail, Calendar, Workflow, Building2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { useDeleteN8nAgent } from '@/hooks/use-delete-n8n-agent';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { AI_MODELS, FEATURE_TOGGLES, DEFAULT_FILE_UPLOAD_LIMITS_MB, formatFileUploadLimitLabel } from '@shared/schema';
import type {
  ApiProvider,
  ProviderSettings,
  KnowledgeBaseSettings,
  MemorySettings,
  AgentSettings,
  TemplateSettings,
  ProjectSettings,
  FeatureToggle,
  N8nAgent,
  UserPlan,
} from '@shared/schema';
import { cn, getUserBadge, getUserBadgeLabel } from '@/lib/utils';
import { useTheme } from '@/components/ThemeProvider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ProfileSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user?: {
    id: string;
    username: string;
    email?: string;
    plan?: string;
  };
  defaultTab?: string;
  focusProvider?: ApiProvider | null;
}

interface UserPreferences {
  personalizationEnabled: boolean;
  customInstructions: string;
  name: string;
  occupation: string;
  bio: string;
  profileImageUrl?: string;
  memories: string[];
  chatHistoryEnabled: boolean;
  autonomousCodeExecution: boolean;
  lastArea?: 'user' | 'admin';
}

interface OAuthToken {
  provider: string;
  createdAt: string;
  scopes?: string[];
}

interface KnowledgeItem {
  id: string;
  type: 'file' | 'url' | 'text';
  title: string;
  content: string;
  createdAt?: string;
}

interface ApiKeyStatus {
  provider: ApiProvider;
  configured: boolean;
  lastFour?: string;
  updatedAt?: string | null;
  createdAt?: string | null;
}

interface N8nWorkflowSummary {
  id: string;
  name: string;
  active: boolean;
  versionId: string | null;
  tags: string[];
  description: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  webhookUrls: string[];
}

interface AllowedModelDetail {
  id: string;
  name: string;
  description: string;
  provider: string;
  capabilities: string[];
  isLegacy: boolean;
}

interface UserLimits {
  plan: UserPlan;
  messageLimitPerDay: number | null;
  allowedModels: string[];
  legacyModels?: string[];
  features: string[];
  fileUploadLimitMb?: number | null;
  chatHistoryEnabled?: boolean;
  knowledgeBase: KnowledgeBaseSettings;
  memory: MemorySettings;
  aiAgents: AgentSettings;
  templates: TemplateSettings;
  projects: ProjectSettings;
  apiProviders: Record<string, ProviderSettings>;
}

const API_KEY_CONFIGS: Array<{
  provider: ApiProvider;
  label: string;
  description: string;
  models: string[];
  docsUrl: string;
}> = [
  {
    provider: 'openai',
    label: 'OpenAI',
    description: 'Required for GPT-5, GPT-4o, o4 Mini, and legacy GPT-4 series models.',
    models: ['GPT-5', 'GPT-5 Mini', 'GPT-4o', 'OpenAI o4 Mini', 'GPT-4.1 Mini', 'GPT-4o Mini'],
    docsUrl: 'https://platform.openai.com/account/api-keys',
  },
  {
    provider: 'anthropic',
    label: 'Anthropic',
    description: 'Required for Claude 4.5 Sonnet, Claude 3.5 Sonnet, Claude 3.5 Haiku, and Claude 3 Opus.',
    models: ['Claude 4.5 Sonnet', 'Claude 3.5 Sonnet', 'Claude 3.5 Haiku', 'Claude 3 Opus'],
    docsUrl: 'https://console.anthropic.com/',
  },
  {
    provider: 'groq',
    label: 'Groq',
    description: 'Required for Titan-V, OSS 120B, Llama 3.1 8B Instant, and other Groq accelerators.',
    models: ['Titan-V', 'Llama 3.1 8B Instant', 'OSS 120B', 'OSS 20B'],
    docsUrl: 'https://console.groq.com/keys',
  },
  {
    provider: 'perplexity',
    label: 'Perplexity',
    description: 'Required for Sonar Pro and Sonar Deep Research.',
    models: ['Sonar Pro', 'Sonar Deep Research'],
    docsUrl: 'https://www.perplexity.ai/settings/api',
  },
  {
    provider: 'n8n',
    label: 'n8n',
    description: 'Required to sync your Atlas automations and list n8n webhook workflows.',
    models: ['Webhook workflows'],
    docsUrl: 'https://docs.n8n.io/hosting/authentication/api-authentication/',
  },
  {
    provider: 'notion',
    label: 'Notion',
    description: 'Required to sync your Notion workspace and databases with Atlas.',
    models: ['Workspace sync'],
    docsUrl: 'https://developers.notion.com/docs/create-a-notion-integration',
  },
];

const themeOptions: Array<{ value: 'light' | 'dark' | 'system'; label: string; helper: string }> = [
  {
    value: 'system',
    label: 'Match system',
    helper: 'Follow your device appearance settings automatically.',
  },
  {
    value: 'light',
    label: 'Light',
    helper: 'Bright background with higher contrast for daylight environments.',
  },
  {
    value: 'dark',
    label: 'Dark',
    helper: 'Dimmed interface that is easier on the eyes at night.',
  },
];

export function ProfileSettingsDialog({ isOpen, onClose, user, defaultTab, focusProvider }: ProfileSettingsDialogProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('personalization');
  const { theme, setTheme } = useTheme();
  const selectedThemeOption = themeOptions.find((option) => option.value === theme) ?? themeOptions[0];

  // Form state
  const [preferences, setPreferences] = useState<UserPreferences>({
    personalizationEnabled: false,
    customInstructions: '',
    name: '',
    occupation: '',
    bio: '',
    profileImageUrl: '',
    memories: [],
    chatHistoryEnabled: true,
    autonomousCodeExecution: true,
    lastArea: 'user',
  });
  
  const [newMemory, setNewMemory] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isPasswordChangeExpanded, setIsPasswordChangeExpanded] = useState(false);
  
  // Archived chats state
  const [isArchivedChatsExpanded, setIsArchivedChatsExpanded] = useState(false);
  const [proModelListOpen, setProModelListOpen] = useState(false);
  const [freeModelListOpen, setFreeModelListOpen] = useState(false);
  const [enterpriseModelListOpen, setEnterpriseModelListOpen] = useState(false);
  
  // Downgrade confirmation dialog state
  const [showDowngradeConfirm, setShowDowngradeConfirm] = useState(false);
  
  // Knowledge tab state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [knowledgeUrl, setKnowledgeUrl] = useState('');
  const [knowledgeUrlTitle, setKnowledgeUrlTitle] = useState('');
  const [knowledgeTextTitle, setKnowledgeTextTitle] = useState('');
  const [knowledgeTextContent, setKnowledgeTextContent] = useState('');
  const [uploadFileOpen, setUploadFileOpen] = useState(false);
  const [addUrlOpen, setAddUrlOpen] = useState(false);
  const [addTextOpen, setAddTextOpen] = useState(false);
  const knowledgeFileInputRef = useRef<HTMLInputElement>(null);

  const [apiKeyInputs, setApiKeyInputs] = useState<Record<ApiProvider, string>>({
    openai: '',
    anthropic: '',
    groq: '',
    perplexity: '',
    n8n: '',
    notion: '',
  });
  const [activeSaveProvider, setActiveSaveProvider] = useState<ApiProvider | null>(null);
  const [activeDeleteProvider, setActiveDeleteProvider] = useState<ApiProvider | null>(null);
  const notionApiKeySectionRef = useRef<HTMLDivElement | null>(null);
  const [highlightedProvider, setHighlightedProvider] = useState<{ provider: ApiProvider; token: number } | null>(null);
  const highlightedProviderId = highlightedProvider?.provider ?? null;
  const [isN8nCardOpen, setIsN8nCardOpen] = useState(false);
  const [n8nCardActivated, setN8nCardActivated] = useState(false);
  const [n8nBaseUrl, setN8nBaseUrl] = useState<string | null>(null);
  const [n8nWorkflows, setN8nWorkflows] = useState<N8nWorkflowSummary[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('');
  const [workflowIdInput, setWorkflowIdInput] = useState('');
  const [agentNameInput, setAgentNameInput] = useState('');
  const [webhookUrlInput, setWebhookUrlInput] = useState('');
  const [webhookDirty, setWebhookDirty] = useState(false);
  const [agentFormErrors, setAgentFormErrors] = useState<{
    workflowId?: string;
    name?: string;
    webhookUrl?: string;
    general?: string;
  }>({});
  const [lastSavedAgentId, setLastSavedAgentId] = useState<string | null>(null);
  const deleteN8nAgentMutation = useDeleteN8nAgent();
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);

  const getAgentErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
      const message = error.message ?? 'An unexpected error occurred';
      const separatorIndex = message.indexOf(':');
      if (separatorIndex >= 0) {
        const potentialPayload = message.slice(separatorIndex + 1).trim();
        try {
          const parsed = JSON.parse(potentialPayload);
          if (parsed && typeof parsed.error === 'string') {
            return parsed.error;
          }
        } catch {
          if (potentialPayload) {
            return potentialPayload;
          }
        }
      }
      return message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'An unexpected error occurred';
  };

  const highlightProvider = (provider: ApiProvider | null) => {
    if (!provider) {
      setHighlightedProvider(null);
      return;
    }
    setHighlightedProvider({ provider, token: Date.now() });
  };

  const activateN8nCard = () => {
    setN8nCardActivated(true);
  };

  const handleN8nCardOpenChange = (open: boolean) => {
    setIsN8nCardOpen(open);
    if (open) {
      activateN8nCard();
    }
  };

  const focusApiKeyProvider = (provider: ApiProvider) => {
    setActiveTab('integrations');
    if (provider === 'n8n') {
      setIsN8nCardOpen(true);
      activateN8nCard();
    }
    highlightProvider(provider);
  };

  useEffect(() => {
    if (isOpen && activeTab === 'integrations') {
      activateN8nCard();
    }
  }, [activeTab, isOpen]);

  useEffect(() => {
    if (isOpen && defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [defaultTab, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      highlightProvider(null);
      return;
    }
    if (focusProvider) {
      focusApiKeyProvider(focusProvider);
    }
  }, [focusProvider, isOpen]);

  useEffect(() => {
    if (!isOpen || !highlightedProvider) {
      return;
    }

    const { provider } = highlightedProvider;
    const timer = window.setTimeout(() => {
      const section = document.querySelector<HTMLElement>(`[data-api-provider-section="${provider}"]`);
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const input = section.querySelector<HTMLInputElement>('input[data-api-provider]');
        if (input) {
          input.focus();
          input.select();
        }
      }
    }, 200);

    return () => window.clearTimeout(timer);
  }, [highlightedProvider, isOpen]);

  useEffect(() => {
    if (highlightedProviderId === 'n8n') {
      setIsN8nCardOpen(true);
      activateN8nCard();
    }
  }, [highlightedProviderId]);

  // Fetch user preferences
  const { data: fetchedPreferences, isLoading: prefsLoading } = useQuery<UserPreferences>({
    queryKey: ['/api/user/preferences'],
    enabled: isOpen,
  });

  const { data: userLimits, isLoading: userLimitsLoading } = useQuery<UserLimits>({
    queryKey: ['user-limits'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/users/me/limits');
      return response.json() as Promise<UserLimits>;
    },
    enabled: isOpen,
  });
  
  // Fetch Google Drive connection status
  const { data: googleDriveStatus } = useQuery<{ connected: boolean; needsAuth?: boolean; error?: string }>({
    queryKey: ['/api/integrations/google-drive/status'],
    enabled: isOpen && activeTab === 'integrations',
    retry: false,
  });

  // Fetch Notion connection status
  const { data: notionStatus } = useQuery<{ connected: boolean; needsAuth?: boolean; error?: string }>({
    queryKey: ['/api/integrations/notion/status'],
    enabled: isOpen && activeTab === 'integrations',
  });

  // Fetch Gmail connection status
  const { data: gmailStatus } = useQuery<{ connected: boolean; needsAuth?: boolean }>({
    queryKey: ['/api/integrations/gmail/status'],
    enabled: isOpen && activeTab === 'integrations',
  });

  // Fetch Calendar connection status
  const { data: calendarStatus } = useQuery<{ connected: boolean; needsAuth?: boolean }>({
    queryKey: ['/api/integrations/calendar/status'],
    enabled: isOpen && activeTab === 'integrations',
  });

  const { data: apiKeys, isLoading: apiKeysLoading } = useQuery<ApiKeyStatus[]>({
    queryKey: ['/api/user/api-keys'],
    enabled: isOpen && activeTab === 'integrations',
  });

  const {
    data: n8nWorkflowsResponse,
    isLoading: n8nWorkflowsLoading,
    isFetching: n8nWorkflowsFetching,
    error: n8nWorkflowsError,
  } = useQuery<{ baseUrl: string; workflows: N8nWorkflowSummary[] }>({
    queryKey: ['/api/integrations/n8n/workflows'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/integrations/n8n/workflows');
      return response.json() as Promise<{ baseUrl: string; workflows: N8nWorkflowSummary[] }>;
    },
    enabled: isOpen && activeTab === 'integrations' && n8nCardActivated,
    retry: false,
  });

  const n8nWorkflowsErrorMessage =
    n8nWorkflowsError instanceof Error
      ? n8nWorkflowsError.message
      : n8nWorkflowsError
        ? 'Unable to load n8n workflows.'
        : null;

  useEffect(() => {
    if (n8nWorkflowsResponse) {
      setN8nBaseUrl(n8nWorkflowsResponse.baseUrl);
      setN8nWorkflows(n8nWorkflowsResponse.workflows);
    }
  }, [n8nWorkflowsResponse]);

  const selectedWorkflow = useMemo(() => {
    if (!selectedWorkflowId) {
      return null;
    }
    return n8nWorkflows.find((workflow) => workflow.id === selectedWorkflowId) ?? null;
  }, [n8nWorkflows, selectedWorkflowId]);

  useEffect(() => {
    if (!selectedWorkflow || webhookDirty) {
      return;
    }

    if (selectedWorkflow.webhookUrls.length > 0) {
      setWebhookUrlInput(selectedWorkflow.webhookUrls[0]);
    } else {
      setWebhookUrlInput('');
    }
  }, [selectedWorkflow, webhookDirty]);

  useEffect(() => {
    if (!selectedWorkflowId) {
      setWorkflowIdInput('');
      return;
    }

    if (selectedWorkflow) {
      setWorkflowIdInput(selectedWorkflow.id);
      return;
    }

    if (selectedWorkflowId === 'custom') {
      return;
    }

    setWorkflowIdInput(selectedWorkflowId);
  }, [selectedWorkflow, selectedWorkflowId]);

  const handleWorkflowSelectChange = (value: string) => {
    setAgentFormErrors((prev) => ({ ...prev, workflowId: undefined, general: undefined }));
    if (value === 'custom') {
      setSelectedWorkflowId('custom');
      setWorkflowIdInput('');
      setWebhookDirty(false);
      setWebhookUrlInput('');
      return;
    }

    setSelectedWorkflowId(value);
    setWebhookDirty(false);
    const workflow = n8nWorkflows.find((item) => item.id === value);
    if (workflow) {
      setWebhookUrlInput(workflow.webhookUrls[0] ?? '');
    } else {
      setWebhookUrlInput('');
    }
  };

  const handleWorkflowIdInputChange = (value: string) => {
    setWorkflowIdInput(value);
    setAgentFormErrors((prev) => ({ ...prev, workflowId: undefined, general: undefined }));
    if (!value) {
      setSelectedWorkflowId('custom');
      return;
    }

    const matchingWorkflow = n8nWorkflows.find((workflow) => workflow.id === value);
    if (matchingWorkflow) {
      setSelectedWorkflowId(matchingWorkflow.id);
      setWebhookDirty(false);
      setWebhookUrlInput(matchingWorkflow.webhookUrls[0] ?? '');
    } else {
      setSelectedWorkflowId('custom');
    }
  };

  const {
    data: n8nAgents,
    isLoading: n8nAgentsLoading,
  } = useQuery<N8nAgent[]>({
    queryKey: ['/api/integrations/n8n/agents'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/integrations/n8n/agents');
      return response.json() as Promise<N8nAgent[]>;
    },
    enabled: isOpen && activeTab === 'integrations' && n8nCardActivated,
  });

  const matchingAgentForWorkflow = useMemo(() => {
    const workflowId = workflowIdInput.trim();
    if (!workflowId || !n8nAgents) {
      return null;
    }
    return n8nAgents.find((agent) => agent.workflowId === workflowId) ?? null;
  }, [n8nAgents, workflowIdInput]);
  
  // Fetch knowledge items
  const { data: knowledgeItems, isLoading: knowledgeLoading } = useQuery<KnowledgeItem[]>({
    queryKey: ['/api/knowledge'],
    enabled: isOpen && activeTab === 'knowledge',
  });

  // Fetch archived chats
  const { data: archivedChats, isLoading: archivedLoading } = useQuery<any[]>({
    queryKey: ['/api/chats/archived'],
  });
  
  // Update local state when preferences are fetched
  useEffect(() => {
    if (fetchedPreferences) {
      setPreferences({
        ...fetchedPreferences,
        lastArea: fetchedPreferences.lastArea ?? 'user',
      });
    }
  }, [fetchedPreferences]);
  
  // Save preferences mutation
  const savePreferencesMutation = useMutation({
    mutationFn: async (prefs: UserPreferences) => {
      const response = await apiRequest('POST', '/api/user/preferences', prefs);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/preferences'] });
      toast({
        title: 'Settings saved',
        description: 'Your preferences have been updated successfully.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to save preferences. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    savePreferencesMutation.mutate(preferences);
  };

  const handleSaveApiKey = (provider: ApiProvider) => {
    const keyValue = apiKeyInputs[provider]?.trim();
    if (!keyValue) {
      toast({
        title: 'API key required',
        description: 'Enter an API key before saving.',
        variant: 'destructive',
      });
      return;
    }

    saveApiKeyMutation.mutate({ provider, apiKey: keyValue });
  };

  const handleDeleteApiKey = (provider: ApiProvider) => {
    deleteApiKeyMutation.mutate(provider);
  };

  const saveApiKeyMutation = useMutation({
    mutationFn: async ({ provider, apiKey }: { provider: ApiProvider; apiKey: string }) => {
      const response = await apiRequest('POST', '/api/user/api-keys', { provider, apiKey });
      return await response.json() as ApiKeyStatus;
    },
    onMutate: async ({ provider }) => {
      setActiveSaveProvider(provider);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/notion/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/n8n/workflows'] });
      setApiKeyInputs(prev => ({ ...prev, [variables.provider]: '' }));
      const providerLabel = API_KEY_CONFIGS.find(config => config.provider === variables.provider)?.label || 'Provider';
      toast({
        title: 'API key saved',
        description: `${providerLabel} key has been updated.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to save API key',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setActiveSaveProvider(null);
    },
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: async (provider: ApiProvider) => {
      await apiRequest('DELETE', `/api/user/api-keys/${provider}`);
    },
    onMutate: async (provider) => {
      setActiveDeleteProvider(provider);
    },
    onSuccess: (_, provider) => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/notion/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/n8n/workflows'] });
      const providerLabel = API_KEY_CONFIGS.find(config => config.provider === provider)?.label || 'Provider';
      toast({
        title: 'API key removed',
        description: `${providerLabel} key has been deleted.`,
      });
      if (provider === 'n8n') {
        setN8nBaseUrl(null);
        setN8nWorkflows([]);
        setSelectedWorkflowId('');
        setWorkflowIdInput('');
        setAgentNameInput('');
        setWebhookUrlInput('');
        setWebhookDirty(false);
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to delete API key',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setActiveDeleteProvider(null);
    },
  });

  const createN8nAgentMutation = useMutation({
    mutationFn: async (payload: {
      workflowId: string;
      name: string;
      webhookUrl?: string;
      metadata?: Record<string, unknown>;
    }) => {
      const response = await apiRequest('POST', '/api/integrations/n8n/agents', payload);
      return response.json() as Promise<N8nAgent>;
    },
    onMutate: () => {
      setAgentFormErrors({});
      setLastSavedAgentId(null);
    },
    onSuccess: async (agent) => {
      queryClient.setQueryData(['/api/integrations/n8n/agents'], (previous: N8nAgent[] | undefined) => {
        if (!previous || previous.length === 0) {
          return [agent];
        }
        const filtered = previous.filter((item) => item.workflowId !== agent.workflowId && item.id !== agent.id);
        return [agent, ...filtered];
      });
      await queryClient.invalidateQueries({ queryKey: ['/api/integrations/n8n/agents'] });
      const workflow = n8nWorkflows.find((item) => item.id === agent.workflowId);
      setAgentNameInput('');
      setWebhookDirty(false);
      if (workflow) {
        setSelectedWorkflowId(workflow.id);
        setWebhookUrlInput(workflow.webhookUrls[0] ?? '');
      } else {
        setWebhookUrlInput('');
        setSelectedWorkflowId('custom');
      }
      setWorkflowIdInput(agent.workflowId);
      setLastSavedAgentId(agent.id);
      toast({
        title: 'Agent saved',
        description: `${agent.name} is now linked to workflow ${agent.workflowId}.`,
      });
    },
    onError: (error) => {
      const message = getAgentErrorMessage(error);
      const normalized = message.toLowerCase();
      const fieldErrors: typeof agentFormErrors = {};
      if (normalized.includes('workflow')) {
        fieldErrors.workflowId = message;
      } else if (normalized.includes('name')) {
        fieldErrors.name = message;
      } else if (normalized.includes('webhook')) {
        fieldErrors.webhookUrl = message;
      } else {
        fieldErrors.general = message;
      }
      setAgentFormErrors(fieldErrors);
    },
  });

  const handleCreateN8nAgent = () => {
    const trimmedWorkflowId = workflowIdInput.trim();
    const trimmedName = agentNameInput.trim();
    const trimmedWebhook = webhookUrlInput.trim();
    const nextErrors: typeof agentFormErrors = {};

    if (!trimmedWorkflowId) {
      nextErrors.workflowId = 'Workflow ID is required';
    }

    if (!trimmedName) {
      nextErrors.name = 'Agent name is required';
    }

    if (trimmedWebhook) {
      try {
        new URL(trimmedWebhook);
      } catch {
        nextErrors.webhookUrl = 'Webhook URL must be a valid URL';
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setAgentFormErrors(nextErrors);
      return;
    }

    const metadata: Record<string, unknown> | undefined = selectedWorkflow
      ? {
          workflowName: selectedWorkflow.name,
          workflowActive: selectedWorkflow.active,
          workflowTags: selectedWorkflow.tags,
          workflowDescription: selectedWorkflow.description,
          source: 'profile-settings-dialog',
        }
      : {
          source: 'profile-settings-dialog',
        };

    createN8nAgentMutation.mutate({
      workflowId: trimmedWorkflowId,
      name: trimmedName,
      webhookUrl: trimmedWebhook || undefined,
      metadata,
    });
  };

  const handleDeleteN8nAgent = (agentId: string) => {
    setDeletingAgentId(agentId);
    deleteN8nAgentMutation.mutate(agentId, {
      onSuccess: () => {
        if (lastSavedAgentId === agentId) {
          setLastSavedAgentId(null);
        }
      },
      onSettled: () => {
        setDeletingAgentId(null);
      },
    });
  };

  const isDeletingNotion = activeDeleteProvider === 'notion' && deleteApiKeyMutation.isPending;
  const isSavingNotion = activeSaveProvider === 'notion' && saveApiKeyMutation.isPending;
  
  // Upload file mutation
  const uploadFileMutation = useMutation({
    mutationFn: async (payload: { name: string; mimeType: string; data: string }) => {
      return await apiRequest('POST', '/api/knowledge/file', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/knowledge'] });
      setSelectedFile(null);
      setUploadFileOpen(false);
      if (knowledgeFileInputRef.current) knowledgeFileInputRef.current.value = '';
      toast({
        title: 'File uploaded',
        description: 'Your file has been added to knowledge base.',
      });
    },
    onError: (error: unknown) => {
      const description =
        error instanceof Error ? error.message : 'Failed to upload file. Please try again.';
      toast({
        title: 'Upload failed',
        description,
        variant: 'destructive',
      });
    },
  });
  
  // Add URL mutation
  const addUrlMutation = useMutation({
    mutationFn: async (data: { url: string; title?: string }) => {
      return await apiRequest('POST', '/api/knowledge/url', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/knowledge'] });
      setKnowledgeUrl('');
      setKnowledgeUrlTitle('');
      setAddUrlOpen(false);
      toast({
        title: 'URL added',
        description: 'The URL has been added to knowledge base.',
      });
    },
    onError: () => {
      toast({
        title: 'Failed to add URL',
        description: 'Failed to add URL. Please try again.',
        variant: 'destructive',
      });
    },
  });
  
  // Add text mutation
  const addTextMutation = useMutation({
    mutationFn: async (data: { title: string; content: string; type: 'text' }) => {
      return await apiRequest('POST', '/api/knowledge/text', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/knowledge'] });
      setKnowledgeTextTitle('');
      setKnowledgeTextContent('');
      setAddTextOpen(false);
      toast({
        title: 'Text added',
        description: 'Your text has been added to knowledge base.',
      });
    },
    onError: () => {
      toast({
        title: 'Failed to add text',
        description: 'Failed to add text. Please try again.',
        variant: 'destructive',
      });
    },
  });
  
  // Delete knowledge mutation
  const deleteKnowledgeMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('DELETE', `/api/knowledge/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/knowledge'] });
      toast({
        title: 'Item deleted',
        description: 'The knowledge item has been removed.',
      });
    },
    onError: () => {
      toast({
        title: 'Failed to delete',
        description: 'Failed to delete item. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      return await apiRequest('POST', '/api/auth/change-password', data);
    },
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsPasswordChangeExpanded(false);
      toast({
        title: 'Password changed',
        description: 'Your password has been successfully updated.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to change password',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleChangePassword = () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({
        title: 'Missing information',
        description: 'Please fill in all password fields.',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Passwords do not match',
        description: 'New password and confirm password must match.',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword.length < 8) {
      toast({
        title: 'Password too short',
        description: 'Password must be at least 8 characters.',
        variant: 'destructive',
      });
      return;
    }

    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  // Restore archived chat mutation
  const restoreChatMutation = useMutation({
    mutationFn: async (chatId: string) => {
      return await apiRequest('PATCH', `/api/chats/${chatId}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats/archived'] });
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
      toast({
        title: 'Chat restored',
        description: 'The chat has been restored to your active chats.',
      });
    },
    onError: () => {
      toast({
        title: 'Failed to restore',
        description: 'Failed to restore chat. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Permanently delete chat mutation
  const permanentDeleteChatMutation = useMutation({
    mutationFn: async (chatId: string) => {
      return await apiRequest('DELETE', `/api/chats/${chatId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats/archived'] });
      toast({
        title: 'Chat deleted',
        description: 'The chat has been permanently deleted.',
      });
    },
    onError: () => {
      toast({
        title: 'Delete failed',
        description: 'Failed to delete item. Please try again.',
        variant: 'destructive',
      });
    },
  });
  
  const handleAddMemory = () => {
    if (newMemory.trim()) {
      setPreferences(prev => ({
        ...prev,
        memories: [...prev.memories, newMemory.trim()],
      }));
      setNewMemory('');
    }
  };
  
  const handleDeleteMemory = (index: number) => {
    setPreferences(prev => ({
      ...prev,
      memories: prev.memories.filter((_, i) => i !== index),
    }));
  };
  
  const handleClearAllMemories = () => {
    setPreferences(prev => ({
      ...prev,
      memories: [],
    }));
    toast({
      title: 'Memories cleared',
      description: 'All memories have been removed.',
    });
  };
  
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload an image file.',
        variant: 'destructive',
      });
      return;
    }
    
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload an image smaller than 10MB.',
        variant: 'destructive',
      });
      return;
    }
    
    try {
      setIsUploadingImage(true);
      
      // Compress and resize image
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      img.onload = () => {
        // Calculate new dimensions (max 400x400 while maintaining aspect ratio)
        let width = img.width;
        let height = img.height;
        const maxSize = 400;
        
        if (width > height) {
          if (width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Fill with white background to avoid black background for transparent images
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
        }
        
        // Convert to base64 with compression (0.85 quality)
        const base64String = canvas.toDataURL('image/jpeg', 0.85);
        
        setPreferences(prev => ({
          ...prev,
          profileImageUrl: base64String,
        }));
        setIsUploadingImage(false);
      };
      
      img.onerror = () => {
        toast({
          title: 'Upload failed',
          description: 'Failed to process image file.',
          variant: 'destructive',
        });
        setIsUploadingImage(false);
      };
      
      // Load the image
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = () => {
        toast({
          title: 'Upload failed',
          description: 'Failed to read image file.',
          variant: 'destructive',
        });
        setIsUploadingImage(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Image upload error:', error);
      toast({
        title: 'Upload failed',
        description: 'An error occurred while uploading the image.',
        variant: 'destructive',
      });
      setIsUploadingImage(false);
    }
  };
  
  const handleRemoveImage = () => {
    setPreferences(prev => ({
      ...prev,
      profileImageUrl: '',
    }));
  };
  
  const getInitials = () => {
    if (preferences.name) {
      return preferences.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
    }
    return user?.email?.[0]?.toUpperCase() || '?';
  };
  
  // Knowledge handlers
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload PDF, DOC, or TXT files only.',
        variant: 'destructive',
      });
      return;
    }
    
    setSelectedFile(file);
  };
  
  const handleUploadFile = () => {
    if (!selectedFile) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64Content = e.target?.result as string | undefined;
      if (!base64Content) {
        toast({
          title: 'Upload failed',
          description: 'Failed to process file contents.',
          variant: 'destructive',
        });
        return;
      }

      const commaIndex = base64Content.indexOf(',');
      const base64Data = commaIndex !== -1 ? base64Content.substring(commaIndex + 1) : base64Content;

      if (!base64Data) {
        toast({
          title: 'Upload failed',
          description: 'File data was empty after processing.',
          variant: 'destructive',
        });
        return;
      }

      uploadFileMutation.mutate({
        name: selectedFile.name,
        mimeType: selectedFile.type || 'application/octet-stream',
        data: base64Data,
      });
    };
    reader.onerror = () => {
      toast({
        title: 'Upload failed',
        description: 'Failed to read file.',
        variant: 'destructive',
      });
    };
    reader.readAsDataURL(selectedFile);
  };
  
  const handleAddUrl = () => {
    if (!knowledgeUrl.trim()) return;
    
    try {
      new URL(knowledgeUrl);
      addUrlMutation.mutate({
        url: knowledgeUrl,
        title: knowledgeUrlTitle || undefined,
      });
    } catch {
      toast({
        title: 'Invalid URL',
        description: 'Please enter a valid URL.',
        variant: 'destructive',
      });
    }
  };
  
  const handleAddText = () => {
    if (!knowledgeTextTitle.trim() || !knowledgeTextContent.trim()) return;
    
    addTextMutation.mutate({
      title: knowledgeTextTitle,
      content: knowledgeTextContent,
      type: 'text',
    });
  };
  
  const getKnowledgeIcon = (type: string) => {
    switch (type) {
      case 'file':
        return FileText;
      case 'url':
        return ExternalLink;
      case 'text':
        return Type;
      default:
        return FileText;
    }
  };

  const groupModelsByProvider = (models: AllowedModelDetail[]) => {
    const grouped: Record<string, AllowedModelDetail[]> = {};
    for (const model of models) {
      if (!grouped[model.provider]) {
        grouped[model.provider] = [];
      }
      grouped[model.provider].push(model);
    }
    Object.values(grouped).forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
    return grouped;
  };

  const formatUnknownFeature = (value: string) =>
    value
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());

  const featureLookup = useMemo(
    () => new Map<string, FeatureToggle>(FEATURE_TOGGLES.map((feature) => [feature.id, feature])),
    [],
  );

  const allowedModelIds = userLimits?.allowedModels ?? [];
  const legacyModelIds = userLimits?.legacyModels ?? [];
  const legacyModelSet = useMemo(() => new Set(legacyModelIds), [legacyModelIds]);

  const modelDetails = useMemo<AllowedModelDetail[]>(() => {
    return allowedModelIds.map((id) => {
      const base = AI_MODELS.find((model) => model.id === id);
      return {
        id,
        name: base?.name ?? id,
        description: base?.description ?? 'Custom model available on this plan.',
        provider: base?.provider ?? 'Custom',
        capabilities: base?.capabilities ?? [],
        isLegacy: legacyModelSet.has(id),
      };
    });
  }, [allowedModelIds, legacyModelSet]);

  const currentModelsByProvider = useMemo(
    () => groupModelsByProvider(modelDetails.filter((model) => !model.isLegacy)),
    [modelDetails],
  );

  const legacyModelsByProvider = useMemo(
    () => groupModelsByProvider(modelDetails.filter((model) => model.isLegacy)),
    [modelDetails],
  );

  const formatMessageLimit = (limit: number | null) =>
    limit === null ? 'Unlimited messages per day' : `${limit.toLocaleString()} messages per day`;

  const formatFileSizeLabel = (mb: number | null | undefined) => {
    if (mb === null || mb === undefined) {
      return 'Unlimited per file';
    }
    return `${formatFileUploadLimitLabel(mb)} per file`;
  };

  const formatStorageLabel = (mb: number | null | undefined) => {
    if (mb === null || mb === undefined) {
      return 'Unlimited storage';
    }
    if (mb >= 1024) {
      const gb = mb / 1024;
      return `${gb % 1 === 0 ? gb : gb.toFixed(1)}GB storage`;
    }
    return `${mb}MB storage`;
  };

  const formatItemLimit = (value: number | null | undefined) =>
    value === null || value === undefined ? 'Unlimited items' : `${value} items`;

  const resolvePlan = (value?: string | null): UserPlan => (value === 'pro' || value === 'enterprise' ? value : 'free');
  const planFromUser: UserPlan = resolvePlan(userLimits?.plan ?? user?.plan);
  const isPaidPlan = planFromUser !== 'free';
  const fallbackMessageLimit = isPaidPlan ? null : 50;
  const fallbackFileUploadLimitMb =
    DEFAULT_FILE_UPLOAD_LIMITS_MB[planFromUser] ?? DEFAULT_FILE_UPLOAD_LIMITS_MB.free ?? null;

  const effectiveMessageLimit = userLimits?.messageLimitPerDay ?? fallbackMessageLimit;
  const effectiveFileUploadLimitMb =
    userLimits?.fileUploadLimitMb ?? fallbackFileUploadLimitMb ?? DEFAULT_FILE_UPLOAD_LIMITS_MB.free ?? null;
  const chatHistoryEnabled = userLimits?.chatHistoryEnabled ?? true;
  const knowledgeFileLimitLabel =
    effectiveFileUploadLimitMb === null
      ? 'Unlimited per file'
      : `${formatFileUploadLimitLabel(effectiveFileUploadLimitMb)} per file`;
  const defaultFreeFileLimitLabel = formatFileUploadLimitLabel(DEFAULT_FILE_UPLOAD_LIMITS_MB.free);
  const defaultProFileLimitLabel = formatFileUploadLimitLabel(DEFAULT_FILE_UPLOAD_LIMITS_MB.pro);
  const defaultEnterpriseFileLimitLabel = formatFileUploadLimitLabel(DEFAULT_FILE_UPLOAD_LIMITS_MB.enterprise);
  const paidPlanFileLimitDescription =
    defaultProFileLimitLabel === defaultEnterpriseFileLimitLabel
      ? `${defaultProFileLimitLabel} per file`
      : `${defaultProFileLimitLabel} per file (Pro) / ${defaultEnterpriseFileLimitLabel} per file (Enterprise)`;
  const freePlanFileLimitDescription = `${defaultFreeFileLimitLabel} per file`;
  const knowledgeBaseSummaryLabel = userLimits
    ? `${userLimits.knowledgeBase.allowUploads ? 'Uploads enabled' : 'Uploads disabled'} • ${formatStorageLabel(userLimits.knowledgeBase.maxStorageMb)} • ${formatItemLimit(userLimits.knowledgeBase.maxItems)}`
    : null;

  const featureDetails = useMemo(
    () => (userLimits?.features ?? []).map((id) => {
      const feature = featureLookup.get(id);
      return {
        id,
        label: feature?.label ?? formatUnknownFeature(id),
        description: feature?.description,
      };
    }),
    [featureLookup, userLimits?.features],
  );

  const renderModelGroups = (groups: Record<string, AllowedModelDetail[]>) =>
    Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provider, models]) => (
        <div key={provider} className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{provider}</p>
          <ul className="space-y-1.5">
            {models.map((model) => (
              <li key={model.id} className="rounded-lg border bg-muted/30 p-2">
                <p className="text-sm font-medium leading-none">{model.name}</p>
                <p className="text-xs text-muted-foreground">{model.description}</p>
              </li>
            ))}
          </ul>
        </div>
      ));

  const renderModelCatalog = (plan: UserPlan) => {
    const open =
      plan === 'enterprise'
        ? enterpriseModelListOpen
        : plan === 'pro'
          ? proModelListOpen
          : freeModelListOpen;
    const setOpen =
      plan === 'enterprise'
        ? setEnterpriseModelListOpen
        : plan === 'pro'
          ? setProModelListOpen
          : setFreeModelListOpen;
    const hasCurrentModels = Object.keys(currentModelsByProvider).length > 0;
    const hasLegacyModels = Object.keys(legacyModelsByProvider).length > 0;

    if (!hasCurrentModels && !hasLegacyModels) {
      return (
        <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          No models are enabled for this plan yet.
        </div>
      );
    }

    return (
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between text-xs sm:text-sm"
            data-testid={`button-toggle-models-${plan}`}
          >
            Model catalog
            <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-3">
          {hasCurrentModels && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current models</p>
              <div className="space-y-3">
                {renderModelGroups(currentModelsByProvider)}
              </div>
            </div>
          )}
          {hasLegacyModels && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Legacy models</p>
              <div className="space-y-3">
                {renderModelGroups(legacyModelsByProvider)}
              </div>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const planSummaryItems = [
    { label: 'Daily message limit', value: formatMessageLimit(effectiveMessageLimit) },
    { label: 'File upload limit', value: formatFileSizeLabel(effectiveFileUploadLimitMb) },
    { label: 'Chat history', value: chatHistoryEnabled ? 'Enabled' : 'Disabled' },
  ];

  if (knowledgeBaseSummaryLabel) {
    planSummaryItems.push({ label: 'Knowledge base', value: knowledgeBaseSummaryLabel });
  }

  const planSummaryContent = userLimitsLoading ? (
    <div className="flex items-center justify-center py-6">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  ) : userLimits ? (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {planSummaryItems.map((item) => (
          <div key={item.label} className="rounded-lg border bg-muted/40 p-3">
            <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
            <p className="text-sm font-semibold text-foreground">{item.value}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Features</h5>
        {featureDetails.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {featureDetails.map((feature) => (
              <Badge key={feature.id} variant="outline" className="text-[11px] font-medium">
                {feature.label}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No additional features enabled.</p>
        )}
      </div>
      {renderModelCatalog(planFromUser)}
    </div>
  ) : (
    <p className="text-xs text-muted-foreground">Unable to load plan details at this time.</p>
  );

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[90vh] sm:max-h-[80vh] p-0 rounded-2xl">
        <DialogHeader className="p-3 sm:p-6 pb-2">
          <DialogTitle className="text-lg sm:text-2xl font-semibold">Settings</DialogTitle>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="px-4 sm:px-6 grid grid-cols-4 w-auto text-xs sm:text-sm">
            <TabsTrigger value="personalization" className="gap-1 sm:gap-2">
              <User className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Personalization</span>
              <span className="sm:hidden text-[10px]">Profile</span>
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="gap-1 sm:gap-2">
              <Book className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Knowledge</span>
              <span className="sm:hidden text-[10px]">Know</span>
            </TabsTrigger>
            <TabsTrigger value="integrations" className="gap-1 sm:gap-2">
              <Link2 className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Integrations</span>
              <span className="sm:hidden text-[10px]">Connect</span>
            </TabsTrigger>
            <TabsTrigger value="account" className="gap-1 sm:gap-2">
              <CreditCard className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Account</span>
              <span className="sm:hidden text-[10px]">Account</span>
            </TabsTrigger>
          </TabsList>
          
          <ScrollArea className="h-[calc(90vh-180px)] sm:h-[calc(80vh-180px)]">
            <TabsContent value="personalization" className="px-4 sm:px-6 pb-6 space-y-4 sm:space-y-6 mt-4 sm:mt-6">
              {/* Personalization Toggle */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2 sm:gap-3">
                    <div>
                      <CardTitle className="text-sm sm:text-lg">Enable Personalization</CardTitle>
                      <CardDescription className="mt-1 text-xs sm:text-sm">
                        Allow Atlas AI to remember information about you to provide personalized responses
                      </CardDescription>
                    </div>
                    <Switch
                      checked={preferences.personalizationEnabled}
                      onCheckedChange={(checked) => 
                        setPreferences(prev => ({ ...prev, personalizationEnabled: checked }))}
                      data-testid="switch-personalization"
                    />
                  </div>
                </CardHeader>
              </Card>
              
              {/* Custom Instructions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm sm:text-lg flex items-center gap-2">
                    <Brain className="h-3 w-3 sm:h-4 sm:w-4" />
                    Custom Instructions
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    How would you like Atlas AI to respond? (e.g., "Be concise", "Explain like I'm a developer")
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4">
                  <Textarea
                    placeholder="I prefer detailed technical explanations with code examples..."
                    value={preferences.customInstructions}
                    onChange={(e) => setPreferences(prev => ({ ...prev, customInstructions: e.target.value }))}
                    className="min-h-[100px]"
                    data-testid="textarea-custom-instructions"
                  />
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Infinity className="h-3 w-3" />
                    <span>No character limit</span>
                  </div>
                </CardContent>
              </Card>
              
              {/* Profile Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm sm:text-lg">Profile Information</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Help Atlas AI understand your background and context
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4">
                  {/* Profile Picture Upload */}
                  <div>
                    <Label>Profile Picture</Label>
                    <div className="flex items-center gap-4 mt-2">
                      <Avatar className="h-20 w-20">
                        <AvatarImage src={preferences.profileImageUrl} />
                        <AvatarFallback className="text-xl">{getInitials()}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                          data-testid="input-profile-image"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploadingImage}
                          data-testid="button-upload-image"
                        >
                          <Camera className="h-4 w-4 mr-2" />
                          {isUploadingImage ? 'Uploading...' : 'Upload photo'}
                        </Button>
                        {preferences.profileImageUrl && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleRemoveImage}
                            className="text-destructive"
                            data-testid="button-remove-image"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Maximum file size: 10MB. Images will be optimized automatically.
                    </p>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <Label htmlFor="name" className="text-xs sm:text-sm">Name</Label>
                    <Input
                      id="name"
                      placeholder="Your name"
                      value={preferences.name}
                      onChange={(e) => setPreferences(prev => ({ ...prev, name: e.target.value }))}
                      className="mt-1"
                      data-testid="input-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="occupation" className="text-xs sm:text-sm">Occupation</Label>
                    <Input
                      id="occupation"
                      placeholder="e.g., Software Engineer, Data Scientist, Student"
                      value={preferences.occupation}
                      onChange={(e) => setPreferences(prev => ({ ...prev, occupation: e.target.value }))}
                      className="mt-1"
                      data-testid="input-occupation"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="about-me" className="text-xs sm:text-sm">About Me</Label>
                    <Textarea
                      id="about-me"
                      placeholder="Tell us about your interests, goals, or anything else that helps personalize your experience..."
                      value={preferences.bio}
                      onChange={(e) => setPreferences(prev => ({ ...prev, bio: e.target.value }))}
                      className="mt-1 min-h-[80px]"
                      data-testid="textarea-about-me"
                    />
                    <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
                      <Infinity className="h-3 w-3" />
                      <span>No character limit</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Memory Management */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm sm:text-lg">Manage Memories</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Things Atlas AI has learned about you
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4">
                  <div className="flex items-center justify-between gap-2 sm:gap-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={preferences.chatHistoryEnabled}
                        onCheckedChange={(checked) => 
                          setPreferences(prev => ({ ...prev, chatHistoryEnabled: checked }))}
                        data-testid="switch-chat-history"
                      />
                      <Label htmlFor="chat-history" className="cursor-pointer text-xs sm:text-sm">
                        <div className="flex items-center gap-2">
                          <History className="h-3 w-3 sm:h-4 sm:w-4" />
                          Reference chat history
                        </div>
                      </Label>
                    </div>
                    {preferences.memories.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearAllMemories}
                        className="text-destructive text-xs sm:text-sm"
                        data-testid="button-clear-memories"
                      >
                        Clear all
                      </Button>
                    )}
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 sm:gap-3">
                      <Label className="text-xs sm:text-sm">Saved Memories ({preferences.memories.length})</Label>
                      <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
                        <Infinity className="h-3 w-3" />
                        <span>No limit</span>
                      </div>
                    </div>
                    <ScrollArea className="h-[150px] rounded-lg border p-3">
                      {preferences.memories.length === 0 ? (
                        <p className="text-xs sm:text-sm text-muted-foreground">No memories saved yet</p>
                      ) : (
                        <div className="space-y-2">
                          {preferences.memories.map((memory, index) => (
                            <div key={index} className="flex items-start justify-between gap-2 p-2 rounded-lg bg-muted/50">
                              <p className="text-xs sm:text-sm flex-1">{memory}</p>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteMemory(index)}
                                className="h-6 w-6 p-0"
                                data-testid={`button-delete-memory-${index}`}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                    
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add a new memory..."
                        value={newMemory}
                        onChange={(e) => setNewMemory(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddMemory()}
                        data-testid="input-new-memory"
                      />
                      <Button
                        onClick={handleAddMemory}
                        size="sm"
                        disabled={!newMemory.trim()}
                        data-testid="button-add-memory"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="integrations" className="px-4 sm:px-6 pb-6 space-y-4 sm:space-y-6 mt-4 sm:mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm sm:text-lg">API Keys (BYOK)</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Provide your own API keys to unlock each provider. Atlas AI uses your keys only for requests you make.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4">
                  {apiKeysLoading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Loading API key status...</span>
                    </div>
                  ) : (
                    API_KEY_CONFIGS.map((config) => {
                      const status = apiKeys?.find(key => key.provider === config.provider);
                      const inputValue = apiKeyInputs[config.provider];
                      const isSaving = activeSaveProvider === config.provider && saveApiKeyMutation.isPending;
                      const isDeleting = activeDeleteProvider === config.provider && deleteApiKeyMutation.isPending;

                      return (
                    <div
                      key={config.provider}
                      ref={config.provider === 'notion' ? notionApiKeySectionRef : undefined}
                      data-api-provider-section={config.provider}
                      className={cn(
                        'space-y-3 rounded-lg border p-3 sm:p-4 transition-shadow',
                        highlightedProviderId === config.provider &&
                          'border-primary/60 ring-2 ring-primary/50 shadow-lg'
                      )}
                    >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium text-xs sm:text-sm">{config.label}</h4>
                                <Badge variant={status?.configured ? 'default' : 'outline'} className="text-[10px] sm:text-xs">
                                  {status?.configured ? `Saved${status?.lastFour ? ` • ends ${status.lastFour}` : ''}` : 'Not configured'}
                                </Badge>
                              </div>
                              <p className="text-[10px] sm:text-xs text-muted-foreground">{config.description}</p>
                              <p className="text-[10px] sm:text-xs text-muted-foreground">Models: {config.models.join(', ')}</p>
                            </div>
                            <Button variant="ghost" size="sm" asChild className="px-0 text-xs">
                              <a href={config.docsUrl} target="_blank" rel="noreferrer" className="text-primary">
                                Get key
                              </a>
                            </Button>
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <Input
                              type="password"
                              autoComplete="off"
                              value={inputValue}
                              onChange={(e) => setApiKeyInputs(prev => ({ ...prev, [config.provider]: e.target.value }))}
                              placeholder="Paste API key..."
                              data-api-provider={config.provider}
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleSaveApiKey(config.provider)}
                                disabled={isSaving}
                              >
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                              </Button>
                              {status?.configured && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteApiKey(config.provider)}
                                  disabled={isDeleting}
                                >
                                  {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Remove'}
                                </Button>
                              )}
                            </div>
                          </div>
                          {status?.updatedAt && (
                            <p className="text-[10px] sm:text-xs text-muted-foreground">
                              Last updated {new Date(status.updatedAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
              </CardContent>
            </Card>

            <Card
              data-testid="card-n8n-workflows"
              className={cn(
                'transition-shadow',
                isN8nCardOpen && 'border-primary/60 shadow-lg ring-1 ring-primary/40'
              )}
            >
              <Collapsible open={isN8nCardOpen} onOpenChange={handleN8nCardOpenChange}>
                <CardHeader className="space-y-2">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary sm:h-10 sm:w-10">
                        <Workflow className="h-4 w-4 sm:h-5 sm:w-5" />
                      </div>
                      <div className="space-y-1">
                        <CardTitle className="text-sm sm:text-lg">n8n automations</CardTitle>
                        <CardDescription className="text-xs sm:text-sm">
                          Discover webhook workflows from your n8n workspace once an API key is saved.
                        </CardDescription>
                      </div>
                    </div>
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" size="sm" className="inline-flex items-center gap-1">
                        {isN8nCardOpen ? 'Hide details' : 'View workflows'}
                        <ChevronDown className={cn('h-4 w-4 transition-transform', isN8nCardOpen && 'rotate-180')} />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                </CardHeader>
                <CollapsibleContent asChild>
                  <CardContent className="space-y-4">
                    {n8nWorkflowsLoading || n8nWorkflowsFetching ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Loading workflows…</span>
                      </div>
                    ) : n8nWorkflowsErrorMessage ? (
                      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                        {n8nWorkflowsErrorMessage}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {n8nBaseUrl && (
                          <div className="rounded-lg border bg-muted/40 p-3">
                            <p className="text-xs font-medium sm:text-sm">Workspace base URL</p>
                            <p className="mt-1 break-all text-[11px] text-muted-foreground sm:text-xs">{n8nBaseUrl}</p>
                          </div>
                        )}

                        {n8nWorkflows.length > 0 ? (
                          <div className="space-y-3">
                            {n8nWorkflows.map((workflow) => (
                              <div key={workflow.id} className="space-y-2 rounded-lg border bg-muted/30 p-3 sm:p-4">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="space-y-1">
                                    <p className="text-sm font-medium leading-tight sm:text-base">{workflow.name}</p>
                                    {workflow.description && (
                                      <p className="text-[11px] text-muted-foreground sm:text-xs">{workflow.description}</p>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant={workflow.active ? 'default' : 'outline'} className="text-[10px] sm:text-xs">
                                      {workflow.active ? 'Active' : 'Inactive'}
                                    </Badge>
                                    {workflow.tags.slice(0, 3).map((tag) => (
                                      <Badge key={tag} variant="outline" className="text-[10px] sm:text-xs">
                                        {tag}
                                      </Badge>
                                    ))}
                                    {workflow.tags.length > 3 && (
                                      <Badge variant="outline" className="text-[10px] sm:text-xs">
                                        +{workflow.tags.length - 3} more
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                {workflow.webhookUrls.length > 0 && (
                                  <div className="space-y-1">
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
                                      Webhook URLs
                                    </p>
                                    <div className="space-y-1.5">
                                      {workflow.webhookUrls.map((url) => (
                                        <div
                                          key={url}
                                          className="break-all rounded-md border border-dashed border-muted-foreground/40 bg-background/70 px-2 py-1 text-[10px] font-mono text-muted-foreground sm:text-xs"
                                        >
                                          {url}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed bg-muted/40 p-4 text-center text-xs text-muted-foreground">
                            No workflows detected yet. Save your n8n API key and ensure at least one workflow is active.
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>

            <Card data-testid="card-n8n-agents" className="transition-shadow">
              <CardHeader className="space-y-2">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary sm:h-10 sm:w-10">
                    <Brain className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <div className="space-y-1">
                    <CardTitle className="text-sm sm:text-lg">n8n Agents</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      Link Atlas agents to n8n workflows and optionally override the webhook URL.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="n8n-agent-workflow-select" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Workflow
                    </Label>
                    <Select
                      value={selectedWorkflowId === '' ? undefined : selectedWorkflowId}
                      onValueChange={handleWorkflowSelectChange}
                    >
                      <SelectTrigger id="n8n-agent-workflow-select" className="h-10 text-sm sm:h-11">
                        <SelectValue
                          placeholder={
                            n8nWorkflowsLoading || n8nWorkflowsFetching
                              ? 'Loading workflows…'
                              : 'Choose a workflow or use a custom ID'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {n8nWorkflows.length > 0 && (
                          <SelectItem value="">
                            <span className="text-sm text-muted-foreground">Clear selection</span>
                          </SelectItem>
                        )}
                        {n8nWorkflows.map((workflow) => (
                          <SelectItem key={workflow.id} value={workflow.id} className="text-sm">
                            {workflow.name} {workflow.active ? '(Active)' : '(Inactive)'}
                          </SelectItem>
                        ))}
                        <SelectItem value="custom" className="text-sm">
                          Use custom workflow ID
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {agentFormErrors.workflowId && (
                      <p className="text-[11px] text-destructive sm:text-xs">{agentFormErrors.workflowId}</p>
                    )}
                    {n8nWorkflowsErrorMessage && (
                      <p className="text-[11px] text-muted-foreground sm:text-xs">
                        Unable to load workflows automatically. You can still paste a workflow ID below.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="n8n-agent-workflow-id" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Workflow ID
                    </Label>
                    <Input
                      id="n8n-agent-workflow-id"
                      value={workflowIdInput}
                      onChange={(event) => handleWorkflowIdInputChange(event.target.value)}
                      placeholder="e.g. 123 or webhook-workflow"
                    />
                    <p className="text-[11px] text-muted-foreground sm:text-xs">
                      Select a workflow to prefill this value or paste a custom ID manually.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="n8n-agent-name" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Agent name
                    </Label>
                    <Input
                      id="n8n-agent-name"
                      value={agentNameInput}
                      onChange={(event) => {
                        setAgentNameInput(event.target.value);
                        setAgentFormErrors((prev) => ({ ...prev, name: undefined, general: undefined }));
                      }}
                      placeholder="Atlas Support Bot"
                    />
                    {agentFormErrors.name && (
                      <p className="text-[11px] text-destructive sm:text-xs">{agentFormErrors.name}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="n8n-agent-webhook" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Webhook URL (optional)
                    </Label>
                    <Input
                      id="n8n-agent-webhook"
                      value={webhookUrlInput}
                      onChange={(event) => {
                        setWebhookUrlInput(event.target.value);
                        setWebhookDirty(true);
                        setAgentFormErrors((prev) => ({ ...prev, webhookUrl: undefined, general: undefined }));
                      }}
                      placeholder="https://example.com/webhook"
                    />
                    <p className="text-[11px] text-muted-foreground sm:text-xs">
                      Prefilled with the first detected webhook when available. Override to target a different URL.
                    </p>
                    {agentFormErrors.webhookUrl && (
                      <p className="text-[11px] text-destructive sm:text-xs">{agentFormErrors.webhookUrl}</p>
                    )}
                  </div>
                </div>

                {agentFormErrors.general && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                    {agentFormErrors.general}
                  </div>
                )}

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-[11px] text-muted-foreground sm:text-xs">
                    Agents default to an inactive status. Activate them within n8n after verifying the mapping.
                  </div>
                  <Button
                    type="button"
                    onClick={handleCreateN8nAgent}
                    disabled={createN8nAgentMutation.isPending}
                  >
                    {createN8nAgentMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                      </>
                    ) : (
                      'Save agent'
                    )}
                  </Button>
                </div>

                {selectedWorkflow && (
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium leading-tight sm:text-base">{selectedWorkflow.name}</p>
                        <p className="text-[11px] text-muted-foreground sm:text-xs">Workflow ID: {selectedWorkflow.id}</p>
                      </div>
                      <Badge variant={selectedWorkflow.active ? 'default' : 'outline'} className="text-[10px] sm:text-xs">
                        {selectedWorkflow.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    {selectedWorkflow.webhookUrls.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
                          Discovered webhooks
                        </p>
                        {selectedWorkflow.webhookUrls.map((url) => (
                          <div
                            key={url}
                            className="break-all rounded-md border border-dashed border-muted-foreground/40 bg-background/70 px-2 py-1 text-[10px] font-mono text-muted-foreground sm:text-xs"
                          >
                            {url}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-xs font-medium">Saved agent mapping</p>
                  {n8nAgentsLoading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Loading agents…</span>
                    </div>
                  ) : matchingAgentForWorkflow ? (
                    <div
                      className={cn(
                        'space-y-2 rounded-lg border bg-muted/30 p-4 text-sm',
                        matchingAgentForWorkflow.id === lastSavedAgentId && 'border-primary/60 shadow-sm ring-1 ring-primary/40'
                      )}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <p className="font-medium leading-tight">{matchingAgentForWorkflow.name}</p>
                          <p className="text-[11px] text-muted-foreground sm:text-xs">Workflow ID: {matchingAgentForWorkflow.workflowId}</p>
                        </div>
                        <div className="flex flex-col items-start gap-2 sm:items-end">
                          <Badge
                            variant={matchingAgentForWorkflow.status === 'active' ? 'default' : 'outline'}
                            className="w-fit text-[10px] sm:text-xs"
                          >
                            {matchingAgentForWorkflow.status === 'active' ? 'Active' : 'Inactive'}
                          </Badge>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="gap-2 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteN8nAgent(matchingAgentForWorkflow.id)}
                            disabled={deleteN8nAgentMutation.isPending && deletingAgentId === matchingAgentForWorkflow.id}
                            aria-label={`Remove webhook mapping for ${matchingAgentForWorkflow.name}`}
                          >
                            {deleteN8nAgentMutation.isPending && deletingAgentId === matchingAgentForWorkflow.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                            Remove
                          </Button>
                        </div>
                      </div>
                      {matchingAgentForWorkflow.webhookUrl && (
                        <p className="break-all text-[11px] text-muted-foreground sm:text-xs">
                          Webhook: {matchingAgentForWorkflow.webhookUrl}
                        </p>
                      )}
                    </div>
                  ) : workflowIdInput.trim() ? (
                    <div className="rounded-lg border border-dashed bg-muted/40 p-4 text-xs text-muted-foreground">
                      No webhook connected. Paste your n8n webhook URL to test this agent.
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-xs text-muted-foreground">
                      Select or enter a workflow ID to view the saved mapping.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm sm:text-lg">Connected Services</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Manage your connected accounts and integrations
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4">
                  {/* Google Drive Integration */}
                  <div className="flex items-center justify-between gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg border">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Cloud className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium text-xs sm:text-sm">Google Drive</h4>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">
                          {googleDriveStatus?.connected ? 'Connected' : 'Not connected'}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant={googleDriveStatus?.connected ? "outline" : "default"}
                      size="sm"
                      onClick={async () => {
                        if (googleDriveStatus?.connected) {
                          // Disconnect logic
                          try {
                            const response = await fetch('/api/google-drive/disconnect', { method: 'DELETE' });
                            if (!response.ok) {
                              throw new Error('Failed to disconnect');
                            }

                            // Invalidate and refetch all Google-related queries
                            await Promise.all([
                              queryClient.invalidateQueries({ queryKey: ['/api/integrations/google-drive/status'] }),
                              queryClient.invalidateQueries({ queryKey: ['/api/google-drive/files'] }),
                              queryClient.invalidateQueries({ queryKey: ['/api/integrations/gmail/status'] }),
                              queryClient.invalidateQueries({ queryKey: ['/api/integrations/calendar/status'] })
                            ]);

                            // Force immediate refetch
                            await Promise.all([
                              queryClient.refetchQueries({ queryKey: ['/api/integrations/google-drive/status'] }),
                              queryClient.refetchQueries({ queryKey: ['/api/google-drive/files'] }),
                              queryClient.refetchQueries({ queryKey: ['/api/integrations/gmail/status'] }),
                              queryClient.refetchQueries({ queryKey: ['/api/integrations/calendar/status'] })
                            ]);

                            toast({
                              title: 'Disconnected',
                              description: 'Google Drive has been disconnected.',
                            });
                          } catch (error) {
                            toast({
                              title: 'Error',
                              description: 'Failed to disconnect Google Drive. Please try again.',
                              variant: 'destructive',
                            });
                          }
                        } else {
                          window.location.href = '/google-drive';
                        }
                      }}
                      data-testid="button-google-drive-integration"
                    >
                      {googleDriveStatus?.connected ? 'Disconnect' : 'Connect'}
                    </Button>
                  </div>

                  {/* Notion Integration */}
                  <div className="flex items-center justify-between gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg border">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Book className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium text-xs sm:text-sm">Notion</h4>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">
                          {notionStatus?.connected ? 'Connected' : 'Not connected'}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant={notionStatus?.connected ? 'outline' : 'default'}
                      size="sm"
                      onClick={() => {
                        if (notionStatus?.connected) {
                          handleDeleteApiKey('notion');
                        } else {
                          highlightProvider(null);
                          focusApiKeyProvider('notion');
                          requestAnimationFrame(() => {
                            notionApiKeySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          });
                        }
                      }}
                      disabled={isDeletingNotion || isSavingNotion}
                      data-testid="button-notion-integration"
                    >
                      {isDeletingNotion ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Disconnecting...
                        </span>
                      ) : notionStatus?.connected ? 'Disconnect' : 'Connect'}
                    </Button>
                  </div>
                  {!notionStatus?.connected && notionStatus?.error && (
                    <p className="mt-2 text-[10px] sm:text-xs text-destructive">
                      {notionStatus.error}
                    </p>
                  )}

                  {/* Gmail Integration */}
                  <div className="flex items-center justify-between gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg border">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Mail className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium text-xs sm:text-sm">Gmail</h4>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">
                          {gmailStatus?.connected ? 'Connected' : 'Not connected'}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant={gmailStatus?.connected ? "outline" : "default"}
                      size="sm"
                      onClick={async () => {
                        if (!gmailStatus?.connected) {
                          window.location.href = '/google-drive';
                        } else {
                          // Disconnect Gmail (uses same Google OAuth)
                          try {
                            const response = await fetch('/api/google-drive/disconnect', { method: 'DELETE' });
                            if (!response.ok) {
                              throw new Error('Failed to disconnect');
                            }
                            
                            // Invalidate and refetch all Google-related queries
                            await Promise.all([
                              queryClient.invalidateQueries({ queryKey: ['/api/integrations/google-drive/status'] }),
                              queryClient.invalidateQueries({ queryKey: ['/api/google-drive/files'] }),
                              queryClient.invalidateQueries({ queryKey: ['/api/integrations/gmail/status'] }),
                              queryClient.invalidateQueries({ queryKey: ['/api/integrations/calendar/status'] })
                            ]);

                            // Force immediate refetch
                            await Promise.all([
                              queryClient.refetchQueries({ queryKey: ['/api/integrations/google-drive/status'] }),
                              queryClient.refetchQueries({ queryKey: ['/api/google-drive/files'] }),
                              queryClient.refetchQueries({ queryKey: ['/api/integrations/gmail/status'] }),
                              queryClient.refetchQueries({ queryKey: ['/api/integrations/calendar/status'] })
                            ]);
                            
                            toast({
                              title: 'Disconnected',
                              description: 'Gmail has been disconnected.',
                            });
                          } catch (error) {
                            toast({
                              title: 'Error',
                              description: 'Failed to disconnect Gmail. Please try again.',
                              variant: 'destructive',
                            });
                          }
                        }
                      }}
                      data-testid="button-gmail-integration"
                    >
                      {gmailStatus?.connected ? 'Disconnect' : 'Connect'}
                    </Button>
                  </div>

                  {/* Google Calendar Integration */}
                  <div className="flex items-center justify-between gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg border">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium text-xs sm:text-sm">Google Calendar</h4>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">
                          {calendarStatus?.connected ? 'Connected' : 'Not connected'}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant={calendarStatus?.connected ? "outline" : "default"}
                      size="sm"
                      onClick={async () => {
                        if (!calendarStatus?.connected) {
                          window.location.href = '/google-drive';
                        } else {
                          // Disconnect Calendar (uses same Google OAuth)
                          try {
                            const response = await fetch('/api/google-drive/disconnect', { method: 'DELETE' });
                            if (!response.ok) {
                              throw new Error('Failed to disconnect');
                            }
                            
                            // Invalidate and refetch all Google-related queries
                            await Promise.all([
                              queryClient.invalidateQueries({ queryKey: ['/api/integrations/google-drive/status'] }),
                              queryClient.invalidateQueries({ queryKey: ['/api/google-drive/files'] }),
                              queryClient.invalidateQueries({ queryKey: ['/api/integrations/gmail/status'] }),
                              queryClient.invalidateQueries({ queryKey: ['/api/integrations/calendar/status'] })
                            ]);

                            // Force immediate refetch
                            await Promise.all([
                              queryClient.refetchQueries({ queryKey: ['/api/integrations/google-drive/status'] }),
                              queryClient.refetchQueries({ queryKey: ['/api/google-drive/files'] }),
                              queryClient.refetchQueries({ queryKey: ['/api/integrations/gmail/status'] }),
                              queryClient.refetchQueries({ queryKey: ['/api/integrations/calendar/status'] })
                            ]);
                            
                            toast({
                              title: 'Disconnected',
                              description: 'Google Calendar has been disconnected.',
                            });
                          } catch (error) {
                            toast({
                              title: 'Error',
                              description: 'Failed to disconnect Google Calendar. Please try again.',
                              variant: 'destructive',
                            });
                          }
                        }
                      }}
                      data-testid="button-calendar-integration"
                    >
                      {calendarStatus?.connected ? 'Disconnect' : 'Connect'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="account" className="px-4 sm:px-6 pb-6 space-y-4 sm:space-y-6 mt-4 sm:mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm sm:text-lg">Account Details</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Your account information and subscription
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between gap-2 sm:gap-3">
                      <span className="text-xs sm:text-sm text-muted-foreground">Username</span>
                      <span className="text-xs sm:text-sm font-medium">{user?.username || 'Not set'}</span>
                    </div>
                    <div className="flex justify-between gap-2 sm:gap-3">
                      <span className="text-xs sm:text-sm text-muted-foreground">Email</span>
                      <span className="text-xs sm:text-sm font-medium">{user?.email || 'Not set'}</span>
                    </div>
                  </div>
                  <div className="flex items-start justify-between gap-4 rounded-lg border border-border/50 bg-muted/30 p-3 sm:p-4">
                    <div className="space-y-1">
                      <Label htmlFor="open-admin-default" className="text-xs sm:text-sm font-medium">
                        Open to Admin by default
                      </Label>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">
                        Start from the admin area after signing in when your role allows it.
                      </p>
                    </div>
                    <Switch
                      id="open-admin-default"
                      checked={preferences.lastArea === 'admin'}
                      onCheckedChange={(checked) =>
                        setPreferences((prev) => ({
                          ...prev,
                          lastArea: checked ? 'admin' : 'user',
                        }))
                      }
                      data-testid="switch-open-admin-default"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm sm:text-lg">Change Password</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Update your password to keep your account secure
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4">
                  {!isPasswordChangeExpanded ? (
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      onClick={() => setIsPasswordChangeExpanded(true)}
                      data-testid="button-show-change-password"
                    >
                      <Settings className="h-4 w-4" />
                      Change Password
                    </Button>
                  ) : (
                    <div className="space-y-3 sm:space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="current-password" className="text-xs sm:text-sm">Current Password</Label>
                        <Input
                          id="current-password"
                          type="password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="Enter current password"
                          data-testid="input-current-password"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-password" className="text-xs sm:text-sm">New Password</Label>
                        <Input
                          id="new-password"
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Enter new password"
                          data-testid="input-new-password-settings"
                        />
                        <p className="text-[10px] sm:text-xs text-muted-foreground">
                          Password must be at least 8 characters with uppercase, lowercase, and number
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirm-password" className="text-xs sm:text-sm">Confirm New Password</Label>
                        <Input
                          id="confirm-password"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Confirm new password"
                          data-testid="input-confirm-password-settings"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setIsPasswordChangeExpanded(false);
                            setCurrentPassword('');
                            setNewPassword('');
                            setConfirmPassword('');
                          }}
                          className="flex-1"
                          data-testid="button-cancel-change-password"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleChangePassword}
                          disabled={changePasswordMutation.isPending}
                          className="flex-1"
                          data-testid="button-change-password"
                        >
                          {changePasswordMutation.isPending ? (
                            <>
                              <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 mr-2 animate-spin" />
                              <span className="text-xs sm:text-sm">Changing...</span>
                            </>
                          ) : (
                            <span className="text-xs sm:text-sm">Change Password</span>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm sm:text-lg">View Archived Chats</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Restore or permanently delete archived conversations
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4">
                  {!isArchivedChatsExpanded ? (
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      onClick={() => setIsArchivedChatsExpanded(true)}
                      data-testid="button-show-archived-chats"
                    >
                      <History className="h-4 w-4" />
                      View Archived Chats
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2 sm:gap-3 mb-2">
                        <span className="text-xs sm:text-sm font-medium">
                          {archivedChats?.length || 0} archived chat{archivedChats?.length !== 1 ? 's' : ''}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setIsArchivedChatsExpanded(false)}
                          data-testid="button-hide-archived-chats"
                        >
                          Hide
                        </Button>
                      </div>
                      {archivedLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-muted-foreground" />
                        </div>
                      ) : archivedChats && archivedChats.length > 0 ? (
                        <div className="space-y-2">
                          {archivedChats.map((chat) => (
                            <div
                              key={chat.id}
                              className="flex items-center justify-between gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border hover-elevate"
                              data-testid={`archived-chat-${chat.id}`}
                            >
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium truncate text-xs sm:text-sm">{chat.title}</h4>
                                <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                                  {new Date(chat.updatedAt).toLocaleDateString()}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => restoreChatMutation.mutate(chat.id)}
                                  disabled={restoreChatMutation.isPending}
                                  data-testid={`button-restore-chat-${chat.id}`}
                                  title="Restore chat"
                                >
                                  <Upload className="h-3 w-3 sm:h-4 sm:w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    if (confirm('Are you sure you want to permanently delete this chat? This action cannot be undone.')) {
                                      permanentDeleteChatMutation.mutate(chat.id);
                                    }
                                  }}
                                  disabled={permanentDeleteChatMutation.isPending}
                                  data-testid={`button-delete-chat-${chat.id}`}
                                  title="Delete permanently"
                                >
                                  <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-6 sm:py-8">
                          <History className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-muted-foreground/50 mb-2 sm:mb-3" />
                          <p className="text-xs sm:text-sm text-muted-foreground">No archived chats</p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                            Archive chats from the chat list to see them here
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm sm:text-lg">Subscription Plan</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Your current plan and features
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4">
                  {(() => {
                    const badgeType = getUserBadge(user);
                    
                    if (badgeType === 'super_admin') {
                      return (
                        <div className="p-3 sm:p-4 rounded-lg border bg-purple-500/10">
                          <div className="flex items-center justify-between gap-2 sm:gap-3 mb-2 sm:mb-3">
                            <div className="flex items-center gap-1 sm:gap-2">
                              <Crown className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
                              <h4 className="font-semibold text-sm sm:text-lg">Super Admin</h4>
                            </div>
                            <Badge variant="default" className="gap-1 bg-purple-600 hover:bg-purple-700 rounded-full" data-testid="badge-current-plan">
                              <Crown className="h-3 w-3" />
                              <span className="text-[10px] sm:text-xs">Active</span>
                            </Badge>
                          </div>
                          <div className="space-y-2 text-xs sm:text-sm text-muted-foreground">
                            <p>✓ Unlimited access to all features and models</p>
                            <p>✓ Full administrative privileges</p>
                            <p>✓ No usage limits</p>
                          </div>
                        </div>
                      );
                    } else if (badgeType === 'pro') {
                      return (
                        <>
                          <div className="p-3 sm:p-4 rounded-lg border bg-primary/5">
                            <div className="flex items-center justify-between gap-2 sm:gap-3 mb-2 sm:mb-3">
                              <div className="flex items-center gap-1 sm:gap-2">
                                <Crown className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                                <h4 className="font-semibold text-sm sm:text-lg">Pro Plan</h4>
                              </div>
                              <Badge variant="default" className="gap-1" data-testid="badge-current-plan">
                                <Crown className="h-3 w-3" />
                                <span className="text-[10px] sm:text-xs">Active</span>
                              </Badge>
                            </div>
                            {planSummaryContent}
                          </div>

                          <Separator />

                          <div className="space-y-2 sm:space-y-3">
                            <Button
                              variant="outline"
                              className="w-full text-xs sm:text-sm"
                              onClick={() => setShowDowngradeConfirm(true)}
                              data-testid="button-downgrade-plan"
                            >
                              Downgrade to Free
                            </Button>
                            <p className="text-[10px] sm:text-xs text-muted-foreground text-center">
                              Plan changes take effect at the start of your next billing cycle
                            </p>
                          </div>
                        </>
                      );
                    } else if (badgeType === 'enterprise') {
                      return (
                        <>
                          <div className="p-3 sm:p-4 rounded-lg border bg-amber-500/10">
                            <div className="flex items-center justify-between gap-2 sm:gap-3 mb-2 sm:mb-3">
                              <div className="flex items-center gap-1 sm:gap-2">
                                <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
                                <h4 className="font-semibold text-sm sm:text-lg">Enterprise Plan</h4>
                              </div>
                              <Badge variant="secondary" className="gap-1" data-testid="badge-current-plan">
                                <span className="text-[10px] sm:text-xs">Active</span>
                              </Badge>
                            </div>
                            {planSummaryContent}
                          </div>

                          <Separator />

                          <div className="space-y-2 sm:space-y-3">
                            <p className="text-xs sm:text-sm text-muted-foreground">
                              Enterprise subscriptions are managed by your account team. Reach out if you need to adjust seats or features.
                            </p>
                            <Button
                              variant="outline"
                              className="w-full gap-2 text-xs sm:text-sm"
                              onClick={() => {
                                window.location.href = 'mailto:support@atlas.app?subject=Enterprise%20plan%20help';
                              }}
                              data-testid="button-contact-enterprise-support"
                            >
                              <Mail className="h-3 w-3 sm:h-4 sm:w-4" />
                              Contact support
                            </Button>
                          </div>
                        </>
                      );
                    } else {
                      return (
                        <>
                          <div className="p-3 sm:p-4 rounded-lg border bg-primary/5">
                            <div className="flex items-center justify-between gap-2 sm:gap-3 mb-2 sm:mb-3">
                              <h4 className="font-semibold text-sm sm:text-lg">Free Plan</h4>
                              <Badge variant="secondary" data-testid="badge-current-plan" className="text-[10px] sm:text-xs">Current</Badge>
                            </div>
                            {planSummaryContent}
                          </div>

                          <Separator />

                          <div className="space-y-2 sm:space-y-3">
                            <h4 className="font-medium text-xs sm:text-sm">Upgrade to Pro</h4>
                            <p className="text-xs sm:text-sm text-muted-foreground">
                              Unlock unlimited messages, premium models, higher upload limits, and full chat history.
                            </p>
                            <Button
                              variant="default"
                              className="w-full gap-2 text-xs sm:text-sm"
                              onClick={() => {
                                window.location.href = '/upgrade';
                              }}
                              data-testid="button-upgrade-plan"
                            >
                              <Crown className="h-3 w-3 sm:h-4 sm:w-4" />
                              Upgrade to Pro
                            </Button>
                            <p className="text-[10px] sm:text-xs text-muted-foreground text-center">
                              Plan changes take effect at the start of your next billing cycle
                            </p>
                          </div>
                        </>
                      );
                    }
                  })()}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">AI Preferences</CardTitle>
                  <CardDescription>
                    Control how Atlas AI behaves with code execution
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4">
                  <div className="flex items-center justify-between gap-2 sm:gap-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="autonomous-code" className="text-sm font-medium">
                        Autonomous Code Execution
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Allow AI to run code automatically when Code Bytes is enabled
                      </p>
                    </div>
                    <Switch
                      id="autonomous-code"
                      checked={preferences.autonomousCodeExecution}
                      onCheckedChange={(checked) => 
                        setPreferences(prev => ({ ...prev, autonomousCodeExecution: checked }))}
                      data-testid="switch-autonomous-code-execution"
                    />
                  </div>
                  <div className="text-xs text-muted-foreground p-3 rounded-lg bg-muted/50">
                    <p>
                      When enabled, the AI can execute Python code automatically to help with calculations, data analysis, and other tasks. 
                      When disabled, the AI will describe what code it would run but won't execute it.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm sm:text-lg">Account Actions</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Manage your account settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label htmlFor="theme-select" className="text-sm font-medium">
                        Appearance
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Choose how Atlas AI looks across this device.
                      </p>
                    </div>
                    <Select
                      value={theme}
                      onValueChange={(value) => setTheme(value as 'light' | 'dark' | 'system')}
                    >
                      <SelectTrigger id="theme-select" className="w-full" data-testid="select-theme">
                        <SelectValue placeholder="Select theme" />
                      </SelectTrigger>
                      <SelectContent>
                        {themeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value} className="text-sm">
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] sm:text-xs text-muted-foreground">
                      {selectedThemeOption.helper}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={async () => {
                      try {
                        await apiRequest('POST', '/api/auth/logout');
                        queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
                        window.location.href = '/';
                      } catch (error) {
                        console.error('Logout error:', error);
                      }
                    }}
                    data-testid="button-logout-settings"
                  >
                    <LogOut className="h-3 w-3 sm:h-4 sm:w-4" />
                    <span className="text-xs sm:text-sm">Log out</span>
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="knowledge" className="px-4 sm:px-6 pb-6 space-y-4 sm:space-y-6 mt-4 sm:mt-6">
              {/* Knowledge Items List */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm sm:text-lg">Knowledge Base</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Manage your knowledge items to provide context to Atlas AI
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {knowledgeLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : knowledgeItems && knowledgeItems.length > 0 ? (
                    <div className="space-y-2">
                      {knowledgeItems.map((item) => {
                        const Icon = getKnowledgeIcon(item.type);
                        return (
                          <div key={item.id} className="flex items-start gap-1.5 p-2 rounded-lg border">
                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <Icon className="h-4 w-4 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-[11px] sm:text-sm font-medium truncate">{item.title}</h4>
                              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 line-clamp-2 break-words">
                                {item.content.substring(0, 80)}
                                {item.content.length > 80 ? '...' : ''}
                              </p>
                            </div>
                            <Badge variant="secondary" className="text-[10px] flex-shrink-0 h-fit">
                              {item.type}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteKnowledgeMutation.mutate(item.id)}
                              disabled={deleteKnowledgeMutation.isPending}
                              className="flex-shrink-0 h-8 w-8"
                              data-testid={`button-delete-knowledge-${item.id}`}
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <p className="text-sm">No knowledge added yet. Add files, URLs, or text to provide context.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
              
              {/* Upload File */}
              <Card>
                <Collapsible open={uploadFileOpen} onOpenChange={setUploadFileOpen}>
                  <CardHeader>
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between gap-2 sm:gap-3 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <Upload className="h-4 w-4 text-primary" />
                          <CardTitle className="text-sm sm:text-lg">Upload File</CardTitle>
                        </div>
                        <ChevronDown className={`h-4 w-4 transition-transform ${uploadFileOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </CollapsibleTrigger>
                    <CardDescription className="text-xs sm:text-sm">
                      Upload PDF, DOC, or TXT files to add to knowledge base
                      {' '}({knowledgeFileLimitLabel})
                    </CardDescription>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="space-y-3 sm:space-y-4">
                      <input
                        ref={knowledgeFileInputRef}
                        type="file"
                        accept=".pdf,.doc,.docx,.txt"
                        onChange={handleFileSelect}
                        className="hidden"
                        data-testid="input-knowledge-file"
                      />
                      {selectedFile ? (
                        <div className="p-3 rounded-lg border bg-muted/50">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {(selectedFile.size / 1024).toFixed(2)} KB
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedFile(null);
                                if (knowledgeFileInputRef.current) knowledgeFileInputRef.current.value = '';
                              }}
                              className="flex-shrink-0"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => knowledgeFileInputRef.current?.click()}
                          disabled={uploadFileMutation.isPending}
                          className="flex-1"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Choose File
                        </Button>
                        <Button
                          onClick={handleUploadFile}
                          disabled={!selectedFile || uploadFileMutation.isPending}
                          data-testid="button-upload-knowledge-file"
                        >
                          {uploadFileMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Uploading...
                            </>
                          ) : (
                            'Upload'
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
              
              {/* Add URL */}
              <Card>
                <Collapsible open={addUrlOpen} onOpenChange={setAddUrlOpen}>
                  <CardHeader>
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between gap-2 sm:gap-3 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <ExternalLink className="h-4 w-4 text-primary" />
                          <CardTitle className="text-sm sm:text-lg">Add URL</CardTitle>
                        </div>
                        <ChevronDown className={`h-4 w-4 transition-transform ${addUrlOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </CollapsibleTrigger>
                    <CardDescription className="text-xs sm:text-sm">
                      Add a URL to fetch and add to knowledge base
                    </CardDescription>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="space-y-3 sm:space-y-4">
                      <div>
                        <Label htmlFor="knowledge-url" className="text-xs sm:text-sm">URL</Label>
                        <Input
                          id="knowledge-url"
                          placeholder="https://example.com"
                          value={knowledgeUrl}
                          onChange={(e) => setKnowledgeUrl(e.target.value)}
                          className="mt-1"
                          data-testid="input-knowledge-url"
                        />
                      </div>
                      <div>
                        <Label htmlFor="knowledge-url-title" className="text-xs sm:text-sm">Title (optional)</Label>
                        <Input
                          id="knowledge-url-title"
                          placeholder="Enter a custom title"
                          value={knowledgeUrlTitle}
                          onChange={(e) => setKnowledgeUrlTitle(e.target.value)}
                          className="mt-1"
                          data-testid="input-knowledge-title"
                        />
                      </div>
                      <Button
                        onClick={handleAddUrl}
                        disabled={!knowledgeUrl.trim() || addUrlMutation.isPending}
                        className="w-full"
                        data-testid="button-add-knowledge-url"
                      >
                        {addUrlMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Adding...
                          </>
                        ) : (
                          'Add URL'
                        )}
                      </Button>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
              
              {/* Add Text */}
              <Card>
                <Collapsible open={addTextOpen} onOpenChange={setAddTextOpen}>
                  <CardHeader>
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between gap-2 sm:gap-3 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <Type className="h-4 w-4 text-primary" />
                          <CardTitle className="text-sm sm:text-lg">Add Text</CardTitle>
                        </div>
                        <ChevronDown className={`h-4 w-4 transition-transform ${addTextOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </CollapsibleTrigger>
                    <CardDescription className="text-xs sm:text-sm">
                      Add custom text or notes to knowledge base
                    </CardDescription>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="space-y-3 sm:space-y-4">
                      <div>
                        <Label htmlFor="knowledge-text-title" className="text-xs sm:text-sm">Title</Label>
                        <Input
                          id="knowledge-text-title"
                          placeholder="Enter a title"
                          value={knowledgeTextTitle}
                          onChange={(e) => setKnowledgeTextTitle(e.target.value)}
                          className="mt-1"
                          data-testid="input-knowledge-text-title"
                        />
                      </div>
                      <div>
                        <Label htmlFor="knowledge-text-content" className="text-xs sm:text-sm">Content</Label>
                        <Textarea
                          id="knowledge-text-content"
                          placeholder="Enter your text content..."
                          value={knowledgeTextContent}
                          onChange={(e) => setKnowledgeTextContent(e.target.value)}
                          className="mt-1 min-h-[100px]"
                          data-testid="textarea-knowledge-text"
                        />
                      </div>
                      <Button
                        onClick={handleAddText}
                        disabled={!knowledgeTextTitle.trim() || !knowledgeTextContent.trim() || addTextMutation.isPending}
                        className="w-full"
                        data-testid="button-add-knowledge-text"
                      >
                        {addTextMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Adding...
                          </>
                        ) : (
                          'Add Text'
                        )}
                      </Button>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            </TabsContent>
          </ScrollArea>
        </Tabs>
        
        <div className="p-3 sm:p-6 pt-0">
          <div className="flex justify-end gap-2 sm:gap-3">
            <Button variant="outline" onClick={onClose} size="sm" className="text-xs sm:text-sm">
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={savePreferencesMutation.isPending}
              data-testid="button-save-settings"
              size="sm"
              className="text-xs sm:text-sm"
            >
              {savePreferencesMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Downgrade Confirmation Dialog */}
    <Dialog open={showDowngradeConfirm} onOpenChange={setShowDowngradeConfirm}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Downgrade to Free Plan?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Your plan will be downgraded to Free at the start of your next billing cycle.
          </p>
          
          <div className="p-4 bg-muted/50 rounded-lg space-y-2">
            <div className="flex justify-between gap-2 sm:gap-3 text-sm">
              <span className="text-muted-foreground">Current Plan</span>
              <span className="font-medium">Pro</span>
            </div>
            <div className="flex justify-between gap-2 sm:gap-3 text-sm">
              <span className="text-muted-foreground">New Plan</span>
              <span className="font-medium">Free</span>
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between gap-2 sm:gap-3 text-sm">
              <span className="text-muted-foreground">Effective Date</span>
              <span className="font-medium">
                {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleDateString('en-US', { 
                  month: 'long', 
                  day: 'numeric', 
                  year: 'numeric' 
                })}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">After downgrading, you'll lose:</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li className="flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-muted-foreground" />
                Unlimited messages (limited to 50/day)
              </li>
              <li className="flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-muted-foreground" />
                Access to premium AI models (GPT-5, Claude 4.5, Perplexity Sonar)
              </li>
              <li className="flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-muted-foreground" />
                Large file uploads ({paidPlanFileLimitDescription} on paid plans, {freePlanFileLimitDescription} on Free)
              </li>
              <li className="flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-muted-foreground" />
                Unlimited chat history (30-day limit)
              </li>
            </ul>
          </div>
        </div>
        
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={() => setShowDowngradeConfirm(false)}
            data-testid="button-cancel-downgrade"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            onClick={() => {
              setShowDowngradeConfirm(false);
              toast({
                title: 'Downgrade Scheduled',
                description: `Your plan will change to Free on ${new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`,
              });
            }}
            data-testid="button-confirm-downgrade"
          >
            Confirm Downgrade
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </>
  );
}
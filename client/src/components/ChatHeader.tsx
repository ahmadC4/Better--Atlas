import { Menu, ChevronDown, Zap, Activity, MessageSquarePlus, Users, Workflow } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { getModelById, type ModelProvider, type AIModel } from '@shared/schema';
import { useAuth } from '@/hooks/useAuth';
import { useEffectiveCapabilities, hasTeamsAccess } from '@/hooks/use-effective-capabilities';

interface ChatHeaderProps {
  onToggleSidebar: () => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
  className?: string;
  availableModels: AIModel[];
  onHomeClick: () => void;
  showNewChatButton?: boolean;
  onNewChat?: () => void;
  isCreatingNewChat?: boolean;
  chatTitle: string;
  capabilityNotice?: string | null;
}

const providerOrder: ModelProvider[] = ['openai', 'anthropic', 'groq', 'perplexity', 'openrouter'];
const providerLabels: Record<ModelProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Claude',
  groq: 'Groq',
  perplexity: 'Perplexity',
  openrouter: 'OpenRouter',
};

export function ChatHeader({
  onToggleSidebar,
  selectedModel,
  onModelChange,
  className,
  availableModels,
  onHomeClick,
  showNewChatButton,
  onNewChat,
  isCreatingNewChat,
  chatTitle,
  capabilityNotice,
}: ChatHeaderProps) {
  const { user } = useAuth();
  const { data: capabilities, isLoading: capabilitiesLoading } = useEffectiveCapabilities();
  const showTeamsButton = hasTeamsAccess(capabilities);
  
  const primaryGroups = useMemo(() => (
    providerOrder
      .map(provider => ({
        provider,
        label: providerLabels[provider],
        models: availableModels
          .filter(model => model.provider === provider && model.status !== 'legacy')
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter(group => group.models.length > 0)
  ), [availableModels]);

  const legacyModels = useMemo(() => (
    availableModels
      .filter(model => model.status === 'legacy')
      .sort((a, b) => a.name.localeCompare(b.name))
  ), [availableModels]);

  const fallbackModel = primaryGroups[0]?.models[0]
    || legacyModels[0]
    || availableModels[0]
    || getModelById(selectedModel);

  const currentModel = availableModels.find(model => model.id === selectedModel)
    || fallbackModel;

  const currentModelNameClass = useMemo(() => {
    const length = currentModel?.name?.length ?? 0;
    if (length > 36) {
      return 'text-[10px] sm:text-xs';
    }
    if (length > 24) {
      return 'text-[11px] sm:text-sm';
    }
    return 'text-xs sm:text-sm';
  }, [currentModel?.name]);

  const renderModelSelector = (triggerClassName?: string, align: 'start' | 'center' | 'end' = 'center') => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'flex w-full min-w-0 items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs shadow-sm sm:text-sm',
            triggerClassName
          )}
          data-testid="button-model-selector"
        >
          <span
            className={cn(
              'flex-1 break-words pr-1 text-left text-pretty font-medium leading-tight',
              currentModelNameClass
            )}
          >
            {currentModel?.name ?? 'Select a model'}
          </span>
          <ChevronDown className="h-3 w-3 flex-shrink-0 sm:h-4 sm:w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-72 rounded-xl border shadow-lg">
        {primaryGroups.map((group, index) => (
          <div key={group.provider}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel data-testid={`section-label-${group.provider.toLowerCase()}`}>
              {group.label}
            </DropdownMenuLabel>
            {group.models.map(model => (
              <DropdownMenuItem
                key={model.id}
                onClick={() => onModelChange(model.id)}
                className={cn(
                  'flex w-full cursor-pointer flex-col items-start gap-1',
                  selectedModel === model.id && 'bg-accent'
                )}
                data-testid={`model-option-${model.id}`}
              >
                <div className="font-medium leading-tight text-sm">{model.name}</div>
                <div className="text-[11px] leading-snug text-muted-foreground">{model.description}</div>
              </DropdownMenuItem>
            ))}
          </div>
        ))}
        {legacyModels.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel data-testid="section-label-legacy">
              Legacy models
            </DropdownMenuLabel>
            {legacyModels.map(model => (
              <DropdownMenuItem
                key={model.id}
                onClick={() => onModelChange(model.id)}
                className={cn(
                  'flex w-full cursor-pointer flex-col items-start gap-1',
                  selectedModel === model.id && 'bg-accent'
                )}
                data-testid={`model-option-${model.id}`}
              >
                <div className="font-medium leading-tight text-sm">{model.name}</div>
                <div className="text-[11px] leading-snug text-muted-foreground">{model.description}</div>
              </DropdownMenuItem>
            ))}
          </>
        )}
        {capabilityNotice && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-[11px] leading-snug text-muted-foreground/90 whitespace-normal">
              {capabilityNotice}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <header
      className={cn(
        'relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:gap-4 p-3 sm:p-6 border-b border-border bg-background shadow-sm',
        className,
      )}
    >
      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 min-w-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 lg:hidden"
          onClick={onToggleSidebar}
          data-testid="button-sidebar-toggle"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-4 w-4" />
        </Button>

        <button
          type="button"
          onClick={onHomeClick}
          title="Scroll to top"
          aria-label="Scroll to top"
          className="flex h-9 items-center gap-1.5 rounded-full px-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          <span className="hidden text-sm font-semibold leading-tight lg:inline" role="heading" aria-level={1}>
            Atlas AI
          </span>
        </button>

        <div className="flex min-w-0 flex-1 lg:hidden">
          {renderModelSelector('w-full max-w-[220px]', 'start')}
        </div>
      </div>

      <div className="flex min-w-0 justify-center">
        <div className="hidden lg:flex min-w-0 w-full max-w-xs justify-center">
          {renderModelSelector('mx-auto max-w-xs', 'center')}
        </div>
        <div className="flex w-full min-w-0 items-center justify-center lg:hidden">
          <span
            className="max-w-full truncate text-sm font-medium text-foreground"
            title={chatTitle}
            aria-label={chatTitle}
          >
            {chatTitle}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5 sm:gap-3">
        <Link href="/n8n">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 rounded-xl"
            data-testid="button-n8n"
            title="Open N8N"
          >
            <Workflow className="h-4 w-4" />
          </Button>
        </Link>
        <Link href="/usage">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 rounded-xl"
            data-testid="button-usage-tracking"
            title="Usage & API Keys"
          >
            <Activity className="h-4 w-4" />
          </Button>
        </Link>

        {showTeamsButton && (
          <Link href="/teams">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 rounded-xl"
              data-testid="button-teams"
              title="Teams"
            >
              <Users className="h-4 w-4" />
            </Button>
          </Link>
        )}

        {showNewChatButton && onNewChat && (
          <Button
            variant="default"
            size="sm"
            className="h-9 w-9 p-0 rounded-xl shadow-sm"
            onClick={onNewChat}
            disabled={isCreatingNewChat}
            aria-label="Start a new chat"
            data-testid="button-new-chat-header"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
        )}
      </div>
    </header>
  );
}

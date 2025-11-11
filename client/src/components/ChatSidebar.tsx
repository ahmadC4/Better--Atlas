import { useState, useEffect, FormEvent } from 'react';
import {
  Plus,
  MessageSquare,
  Bot,
  FileText,
  FolderOpen,
  Search,
  MoreHorizontal,
  Archive,
  Crown,
  Settings,
  Edit2,
  Trash2,
  Shield,
  Download,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useEffectiveCapabilities } from '@/hooks/use-effective-capabilities';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type { User as UserType, Project, ApiProvider, Template, Expert } from '@shared/schema';
import { ProfileSettingsDialog } from '@/components/ProfileSettingsDialog';
import { ProjectSettingsDialog } from '@/components/ProjectSettingsDialog';
import { AgentsPanel } from '@/components/AgentsPanel';

interface UserPreferences {
  personalizationEnabled: boolean;
  customInstructions: string;
  name: string;
  occupation: string;
  bio: string;
  profileImageUrl?: string;
  memories: string[];
  chatHistoryEnabled: boolean;
}
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn, getUserBadge, getUserBadgeLabel } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Chat {
  id: string;
  title: string;
  updatedAt: string;
  projectId?: string | null;
}

interface ChatSidebarProps {
  isOpen: boolean;
  onNewChat: (projectId?: string | null) => void;
  chats: Chat[];
  activeChat: string | null;
  onChatSelect: (chatId: string) => void;
  onChatArchive: (chatId: string) => void;
  onChatDelete: (chatId: string) => void;
  className?: string;
  triggerOpenKnowledgeDialog?: boolean;
  onKnowledgeDialogOpened?: () => void;
  triggerOpenNewProjectDialog?: boolean;
  onNewProjectDialogOpened?: () => void;
  triggerOpenSettings?: { tab?: string; focusProvider?: ApiProvider | null } | null;
  onSettingsTriggerHandled?: () => void;
}

export function ChatSidebar({
  isOpen,
  onNewChat,
  chats,
  activeChat,
  onChatSelect,
  onChatArchive,
  onChatDelete,
  className,
  triggerOpenKnowledgeDialog,
  onKnowledgeDialogOpened,
  triggerOpenNewProjectDialog,
  onNewProjectDialogOpened,
  triggerOpenSettings,
  onSettingsTriggerHandled
}: ChatSidebarProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [defaultSettingsTab, setDefaultSettingsTab] = useState<string | undefined>(undefined);
  const [settingsFocusProvider, setSettingsFocusProvider] = useState<ApiProvider | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    chatId: string;
    chatTitle: string;
    type: 'archive' | 'delete';
  } | null>(null);
  const [showProDialog, setShowProDialog] = useState(false);
  const [proAccessCode, setProAccessCode] = useState('');
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showMoveToProjectDialog, setShowMoveToProjectDialog] = useState(false);
  const [chatToMove, setChatToMove] = useState<string | null>(null);
  const [chatMoveOriginProjectId, setChatMoveOriginProjectId] = useState<string | null>(null);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [chatToRename, setChatToRename] = useState<{ id: string; title: string } | null>(null);
  const [newChatTitle, setNewChatTitle] = useState('');
  const [showProjectRenameDialog, setShowProjectRenameDialog] = useState(false);
  const [projectToRename, setProjectToRename] = useState<Project | null>(null);
  const [projectRenameTitle, setProjectRenameTitle] = useState('');
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isProcessingProjectDeletion, setIsProcessingProjectDeletion] = useState(false);

  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const { data: capabilities } = useEffectiveCapabilities();

  // Watch for trigger to open knowledge dialog
  useEffect(() => {
    if (triggerOpenKnowledgeDialog) {
      setDefaultSettingsTab('knowledge');
      setSettingsFocusProvider(null);
      setSettingsOpen(true);
      onKnowledgeDialogOpened?.();
    }
  }, [triggerOpenKnowledgeDialog, onKnowledgeDialogOpened]);

  // Watch for trigger to open new project dialog
  useEffect(() => {
    if (triggerOpenNewProjectDialog) {
      setShowNewProjectDialog(true);
      onNewProjectDialogOpened?.();
    }
  }, [triggerOpenNewProjectDialog, onNewProjectDialogOpened]);

  useEffect(() => {
    if (!triggerOpenSettings) {
      return;
    }

    if (triggerOpenSettings.tab) {
      setDefaultSettingsTab(triggerOpenSettings.tab);
    }
    if (triggerOpenSettings.focusProvider) {
      setSettingsFocusProvider(triggerOpenSettings.focusProvider);
    }
    setSettingsOpen(true);
    onSettingsTriggerHandled?.();
  }, [triggerOpenSettings, onSettingsTriggerHandled]);

  // Fetch user preferences to get name
  const { data: preferences } = useQuery<UserPreferences>({
    queryKey: ['/api/user/preferences'],
    enabled: !!user,
  });

  // Fetch projects
  const { data: projects } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
    enabled: !!user,
  });

  // Fetch templates
  const { data: templatesData, isLoading: templatesLoading } = useQuery<{ templates: Template[] }>({
    queryKey: ['/api/templates'],
    enabled: !!user,
  });
  const templates = templatesData?.templates ?? [];

  // Fetch experts
  const { data: expertsData, isLoading: expertsLoading } = useQuery<{ experts: Expert[] }>({
    queryKey: ['/api/experts'],
    enabled: !!user,
  });
  const experts = expertsData?.experts ?? [];

  // Create project mutation
  const createProjectMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      return apiRequest('POST', '/api/projects', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({
        title: "Project Created",
        description: "Your new project has been created successfully.",
      });
      setNewProjectName('');
      setNewProjectDescription('');
      setShowNewProjectDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Create Project",
        description: error.message || "An error occurred while creating the project.",
        variant: "destructive",
      });
    }
  });

  const renameProjectMutation = useMutation({
    mutationFn: async ({ projectId, name }: { projectId: string; name: string }) => {
      const response = await apiRequest('PATCH', `/api/projects/${projectId}`, { name });
      return response.json();
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId] });
      setShowProjectRenameDialog(false);
      setProjectToRename(null);
      setProjectRenameTitle('');
      toast({ title: 'Project renamed', description: 'Project has been renamed successfully.' });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to rename project.',
        variant: 'destructive'
      });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      await apiRequest('DELETE', `/api/projects/${projectId}`);
    },
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId] });
      queryClient.invalidateQueries({ queryKey: ['/api/chats', 'default-user'] });
      if (selectedProjectId === projectId) {
        setSelectedProjectId(null);
        setShowProjectSettings(false);
      }
      setProjectToDelete(null);
      toast({ title: 'Project deleted', description: 'Project has been deleted successfully.' });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to delete project.',
        variant: 'destructive'
      });
    },
  });

  const renameChatMutation = useMutation({
    mutationFn: async ({ chatId, title }: { chatId: string; title: string }) => {
      const response = await apiRequest('PATCH', `/api/chats/${chatId}/rename`, { title });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/chats');
        }
      });
      setShowRenameDialog(false);
      setChatToRename(null);
      setNewChatTitle('');
      toast({ title: 'Chat renamed', description: 'Chat has been renamed successfully.' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error?.message || 'Failed to rename chat.',
        variant: 'destructive' 
      });
    },
  });

  const moveChatMutation = useMutation({
    mutationFn: async ({ chatId, projectId }: { chatId: string; projectId: string | null }) => {
      const response = await apiRequest('PATCH', `/api/chats/${chatId}/move-to-project`, { projectId });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.setQueryData<Chat[] | undefined>(['/api/chats', 'default-user'], (existing) => {
        if (!existing) {
          return existing;
        }

        return existing.map((chat) =>
          chat.id === variables.chatId ? { ...chat, projectId: variables.projectId } : chat
        );
      });

      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/chats');
        }
      });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      setShowMoveToProjectDialog(false);
      setChatToMove(null);
      setChatMoveOriginProjectId(null);
      toast({ title: 'Chat moved', description: 'Chat has been moved successfully.' });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'We couldn’t move that chat. Please try again.',
        variant: 'destructive'
      });
    },
  });

  const upgradeMutation = useMutation({
    mutationFn: async (accessCode: string) => {
      return apiRequest('POST', '/api/upgrade-pro', { accessCode });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      toast({
        title: "Success!",
        description: "You've been upgraded to Pro plan with unlimited access.",
      });
      setShowProDialog(false);
      setProAccessCode('');
    },
    onError: (error: any) => {
      toast({
        title: "Upgrade Failed",
        description: error.message || "Invalid access code. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleCreateProject = () => {
    if (newProjectName.trim()) {
      createProjectMutation.mutate({
        name: newProjectName.trim(),
        description: newProjectDescription.trim() || undefined,
      });
    }
  };

  const handleUpgrade = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (proAccessCode.trim()) {
      upgradeMutation.mutate(proAccessCode.trim());
    }
  };

  const handleLogout = async () => {
    try {
      await apiRequest('POST', '/api/auth/logout');
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      window.location.href = '/';
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const unassignedChatsAll = chats.filter((chat) => (chat.projectId ?? null) === null);
  const unassignedChats = normalizedSearch
    ? unassignedChatsAll.filter((chat) => chat.title.toLowerCase().includes(normalizedSearch))
    : unassignedChatsAll;

  const projectChatsAll = chats.reduce<Map<string, Chat[]>>((acc, chat) => {
    const projectId = chat.projectId ?? null;
    if (!projectId) {
      return acc;
    }

    if (!acc.has(projectId)) {
      acc.set(projectId, []);
    }

    acc.get(projectId)!.push(chat);
    return acc;
  }, new Map());

  const projectChats = new Map(
    Array.from(projectChatsAll.entries()).map(([projectId, chatList]) => {
      if (!normalizedSearch) {
        return [projectId, chatList] as const;
      }

      return [
        projectId,
        chatList.filter((chat) => chat.title.toLowerCase().includes(normalizedSearch))
      ] as const;
    })
  );

  const hasUnassignedChats = unassignedChatsAll.length > 0;

  const handleOpenMoveDialog = (chatId: string, originProjectId: string | null) => {
    setChatToMove(chatId);
    setChatMoveOriginProjectId(originProjectId);
    setShowMoveToProjectDialog(true);
  };

  const handleProjectDeletion = async (mode: 'move' | 'delete') => {
    if (!projectToDelete) {
      return;
    }

    setIsProcessingProjectDeletion(true);

    const chatsInProject = chats.filter(
      (chat) => (chat.projectId ?? null) === projectToDelete.id
    );

    try {
      if (mode === 'move' && chatsInProject.length > 0) {
        for (const chat of chatsInProject) {
          await apiRequest('PATCH', `/api/chats/${chat.id}/move-to-project`, { projectId: null });
        }
      }

      if (mode === 'delete' && chatsInProject.length > 0) {
        for (const chat of chatsInProject) {
          await apiRequest('DELETE', `/api/chats/${chat.id}`);
        }
      }

      await deleteProjectMutation.mutateAsync(projectToDelete.id);
    } catch (error) {
      console.error('Project deletion error:', error);
      toast({
        title: 'Error',
        description:
          mode === 'move'
            ? 'We couldn’t move those chats before deleting this project. Please try again.'
            : 'We couldn’t delete those chats before removing this project. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsProcessingProjectDeletion(false);
    }
  };

  const renderChatMenuItems = (chat: Chat, originProjectId: string | null) => (
    <>
      <DropdownMenuItem
        onClick={(e) => {
          e.stopPropagation();
          setChatToRename({ id: chat.id, title: chat.title });
          setNewChatTitle(chat.title);
          setShowRenameDialog(true);
        }}
        data-testid={`button-rename-chat-${chat.id}`}
      >
        <Edit2 className="mr-2 h-4 w-4" />
        Rename
      </DropdownMenuItem>
      {originProjectId !== null && (
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            moveChatMutation.mutate({ chatId: chat.id, projectId: null });
          }}
          data-testid={`button-move-chat-to-unassigned-${chat.id}`}
        >
          <MessageSquare className="mr-2 h-4 w-4" />
          Move to Unassigned
        </DropdownMenuItem>
      )}
      <DropdownMenuItem
        onClick={(e) => {
          e.stopPropagation();
          handleOpenMoveDialog(chat.id, originProjectId);
        }}
        data-testid={`button-move-chat-${chat.id}`}
      >
        <FolderOpen className="mr-2 h-4 w-4" />
        Move to Project
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={(e) => {
          e.stopPropagation();
          setConfirmAction({
            chatId: chat.id,
            chatTitle: chat.title,
            type: 'archive'
          });
        }}
        data-testid={`button-archive-chat-${chat.id}`}
      >
        <Archive className="mr-2 h-4 w-4" />
        Archive
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={(e) => {
          e.stopPropagation();
          setConfirmAction({
            chatId: chat.id,
            chatTitle: chat.title,
            type: 'delete'
          });
        }}
        data-testid={`button-delete-chat-${chat.id}`}
      >
        <Trash2 className="mr-2 h-4 w-4 text-destructive" />
        Delete
      </DropdownMenuItem>
    </>
  );

  const renderChatItem = (chat: Chat, originProjectId: string | null) => (
    <Tooltip key={chat.id}>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'group flex items-center justify-between rounded-xl border border-transparent bg-sidebar/40 p-4 transition-all hover:border-primary/40 hover:bg-sidebar/70',
            activeChat === chat.id && 'border-primary bg-sidebar/80 shadow-sm'
          )}
          onClick={() => onChatSelect(chat.id)}
          data-testid={`chat-item-${chat.id}`}
        >
          <div className="min-w-0 flex-1">
            <p
              className="text-sm font-medium text-sidebar-foreground whitespace-normal leading-snug"
              style={{
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 2,
                overflow: 'hidden',
              }}
            >
              {chat.title}
            </p>
            <p className="text-xs text-muted-foreground">{formatDate(chat.updatedAt)}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 flex-shrink-0 p-0 opacity-100 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
                data-testid={`button-chat-menu-${chat.id}`}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl shadow-lg">
              {renderChatMenuItems(chat, originProjectId)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" align="start" className="max-w-xs whitespace-normal break-words">
        {chat.title}
      </TooltipContent>
    </Tooltip>
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 24 * 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const chatSearchField = (
    <div className="space-y-2">
      <Label
        htmlFor="sidebar-chat-search"
        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Search chats
      </Label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="sidebar-chat-search"
          placeholder="Search chats..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="h-10 rounded-xl pl-9"
          data-testid="input-search-chats"
        />
      </div>
    </div>
  );

  const renderProfileSection = (containerClassName?: string) => {
    if (!user) return null;

    return (
      <div
        className={cn(
          'border-t border-sidebar-border p-4 md:p-6 shrink-0',
          containerClassName,
        )}
      >
        <div className="space-y-3">
          {isAdmin && (
            <Button
              asChild
              variant="outline"
              className="w-full justify-start gap-2 rounded-xl"
            >
              <Link href="/admin" data-testid="button-admin-dashboard">
                <Shield className="h-4 w-4" />
                Admin dashboard
              </Link>
            </Button>
          )}
          <div
            className="hover-elevate flex cursor-pointer items-center gap-2 md:gap-3 rounded-lg p-1.5 md:p-2 transition-all"
            onClick={() => setSettingsOpen(true)}
            data-testid="button-profile"
          >
            <Avatar className="h-8 w-8 md:h-10 md:w-10 flex-shrink-0">
              <AvatarImage
                src={preferences?.profileImageUrl || (user as UserType).profileImageUrl || ''}
                alt="User"
              />
              <AvatarFallback className="text-xs">
                {preferences?.name
                  ? preferences.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2)
                  : (user as UserType).email?.slice(0, 2).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                <p
                  className="truncate text-xs sm:text-sm font-medium text-sidebar-foreground"
                  data-testid="text-user-name"
                >
                  {preferences?.name || (user as UserType).email || 'User'}
                </p>
                {(() => {
                  const badgeType = getUserBadge(user as UserType, capabilities);
                  const badgeLabel = getUserBadgeLabel(badgeType);
                  
                  if (badgeType === 'super_admin') {
                    return (
                      <Badge
                        variant="default"
                        className="h-4 sm:h-5 gap-0.5 sm:gap-1 text-[10px] sm:text-xs self-start sm:self-auto bg-purple-600 hover:bg-purple-700"
                        data-testid="badge-super-admin"
                      >
                        <Crown className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        {badgeLabel}
                      </Badge>
                    );
                  } else if (badgeType === 'pro') {
                    return (
                      <Badge
                        variant="default"
                        className="h-4 sm:h-5 gap-0.5 sm:gap-1 text-[10px] sm:text-xs self-start sm:self-auto"
                        data-testid="badge-pro-plan"
                      >
                        <Crown className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        {badgeLabel}
                      </Badge>
                    );
                  } else {
                    return (
                      <Badge
                        variant="secondary"
                        className="h-4 sm:h-5 text-[10px] sm:text-xs self-start sm:self-auto"
                        data-testid="badge-free-plan"
                      >
                        {badgeLabel}
                      </Badge>
                    );
                  }
                })()}
              </div>
              {preferences?.occupation && (
                <p className="truncate text-[10px] sm:text-xs text-muted-foreground">{preferences.occupation}</p>
              )}
            </div>
            <Settings className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
          </div>

          {getUserBadge(user as UserType, capabilities) === 'free' && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 sm:h-9 w-full gap-1.5 sm:gap-2 text-xs sm:text-sm"
              onClick={() => setShowProDialog(true)}
              data-testid="button-upgrade-pro"
            >
              <Crown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Upgrade to Pro
            </Button>
          )}
        </div>
      </div>
    );
  };

  const renderAccordion = () => (
    <Accordion type="single" defaultValue="chats" collapsible className="space-y-3">
      <AccordionItem value="chats" className="rounded-2xl border border-sidebar-border bg-sidebar/60 px-4">
        <AccordionTrigger className="px-0 text-sm font-semibold text-sidebar-foreground hover:no-underline">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <span>Chats</span>
            {unassignedChats.length > 0 && (
              <Badge variant="secondary" className="ml-auto text-xs">
                {unassignedChats.length}
              </Badge>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-0">
          <div className="space-y-4 pt-2">
            {chatSearchField}
            {unassignedChats.length > 0 ? (
              <TooltipProvider delayDuration={150}>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {unassignedChats.map((chat) => renderChatItem(chat, null))}
                </div>
              </TooltipProvider>
            ) : normalizedSearch && hasUnassignedChats ? (
              <div className="rounded-xl border border-dashed border-sidebar-border/60 p-6 text-center text-sm text-muted-foreground">
                No chats match your search.
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-sidebar-border/60 p-6 text-center text-sm text-muted-foreground space-y-3">
                <p>No unassigned chats yet.</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onNewChat(null)}
                  data-testid="button-new-chat-unassigned"
                >
                  New chat
                </Button>
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="agents" className="rounded-2xl border border-sidebar-border bg-sidebar/60 px-4">
        <AccordionTrigger className="px-0 text-sm font-semibold text-sidebar-foreground hover:no-underline">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <span>AI Agents</span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-0">
          <div className="pt-2 max-h-[400px] overflow-y-auto">
            <AgentsPanel className="md:p-0" />
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="templates" className="rounded-2xl border border-sidebar-border bg-sidebar/60 px-4">
        <AccordionTrigger className="px-0 text-sm font-semibold text-sidebar-foreground hover:no-underline">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <span>Templates</span>
            {templates && templates.length > 0 && (
              <Badge variant="secondary" className="ml-auto text-xs">
                {templates.length}
              </Badge>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-0">
          <div className="space-y-3 pt-2 max-h-[400px] overflow-y-auto">
            {templatesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : templates.length > 0 ? (
              <div className="space-y-2">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className="group relative flex items-start justify-between gap-3 rounded-xl border border-transparent bg-sidebar/40 p-3 transition-all hover:border-primary/40 hover:bg-sidebar/70"
                    data-testid={`template-item-${template.id}`}
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <FileText className="h-4 w-4 flex-shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-sidebar-foreground">{template.name}</p>
                        {template.description && (
                          <p className="truncate text-xs text-muted-foreground">{template.description}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground/70 pt-1">
                          {template.fileName} • {Math.round(template.fileSize / 1024)}KB
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => window.open(`/api/templates/${template.id}/file`, '_blank')}
                      data-testid={`button-download-template-${template.id}`}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-sidebar-border/60 p-6 text-center text-sm text-muted-foreground">
                No templates available yet. {isAdmin && 'Add templates in the admin dashboard.'}
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="experts" className="rounded-2xl border border-sidebar-border bg-sidebar/60 px-4">
        <AccordionTrigger className="px-0 text-sm font-semibold text-sidebar-foreground hover:no-underline">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span>AI Experts</span>
            {experts && experts.length > 0 && (
              <Badge variant="secondary" className="ml-auto text-xs">
                {experts.length}
              </Badge>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-0">
          <div className="space-y-3 pt-2 max-h-[400px] overflow-y-auto">
            {expertsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : experts.length > 0 ? (
              <div className="space-y-2">
                {experts.map((expert) => (
                  <div
                    key={expert.id}
                    className="group relative flex items-start gap-3 rounded-xl border border-transparent bg-sidebar/40 p-3 transition-all hover:border-primary/40 hover:bg-sidebar/70"
                    data-testid={`expert-item-${expert.id}`}
                  >
                    <Shield className="h-4 w-4 flex-shrink-0 text-primary mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-sidebar-foreground">{expert.name}</p>
                      {expert.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{expert.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-sidebar-border/60 p-6 text-center text-sm text-muted-foreground">
                No experts available yet. {isAdmin && 'Add experts in the admin dashboard.'}
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>


      <AccordionItem value="projects" className="rounded-2xl border border-sidebar-border bg-sidebar/60 px-4">
        <AccordionTrigger className="px-0 text-sm font-semibold text-sidebar-foreground hover:no-underline">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-primary" />
            <span>Projects</span>
            {projects && projects.length > 0 && (
              <Badge variant="secondary" className="ml-auto text-xs">
                {projects.length}
              </Badge>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-0">
          <div className="space-y-3 pt-2 max-h-[400px] overflow-y-auto">
            <Button
              onClick={() => setShowNewProjectDialog(true)}
              className="h-10 w-full justify-start gap-3 rounded-xl border border-dashed border-sidebar-border/70 bg-sidebar/30"
              variant="outline"
              data-testid="button-new-project"
            >
              <Plus className="h-4 w-4" />
              New Project
            </Button>

            {projects && projects.length > 0 ? (
              <div className="space-y-3">
                {projects.map((project) => {
                  const totalChats = projectChatsAll.get(project.id)?.length ?? 0;
                  const projectChatList = projectChats.get(project.id) ?? [];
                  const showSearchNoResults = normalizedSearch && totalChats > 0 && projectChatList.length === 0;
                  const isEmpty = totalChats === 0;

                  return (
                    <div
                      key={project.id}
                      className="rounded-2xl border border-sidebar-border/70 bg-sidebar/40 p-4"
                      data-testid={`project-item-${project.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <FolderOpen className="h-5 w-5 flex-shrink-0 text-primary" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-sidebar-foreground">{project.name}</p>
                            {project.description && (
                              <p className="truncate text-xs text-muted-foreground">{project.description}</p>
                            )}
                            {(project.includeGlobalKnowledge === 'true' || project.includeUserMemories === 'true') && (
                              <div className="flex flex-wrap gap-2 pt-2">
                                {project.includeGlobalKnowledge === 'true' && (
                                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                                    Global knowledge
                                  </Badge>
                                )}
                                {project.includeUserMemories === 'true' && (
                                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                                    Memories
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 opacity-60 transition-opacity hover:opacity-100"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-xl shadow-lg">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedProjectId(project.id);
                                setShowProjectSettings(true);
                              }}
                              data-testid={`button-project-settings-${project.id}`}
                            >
                              <Settings className="mr-2 h-4 w-4" />
                              Open settings
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setProjectToRename(project);
                                setProjectRenameTitle(project.name ?? '');
                                setShowProjectRenameDialog(true);
                              }}
                              data-testid={`button-project-rename-${project.id}`}
                            >
                              <Edit2 className="mr-2 h-4 w-4" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setProjectToDelete(project);
                              }}
                              data-testid={`button-project-delete-${project.id}`}
                            >
                              <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="mt-4 space-y-2">
                        {(!isEmpty || normalizedSearch) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-start gap-2 rounded-xl border border-dashed border-sidebar-border/60 bg-sidebar/30"
                            onClick={() => onNewChat(project.id)}
                            data-testid={`button-new-chat-project-${project.id}`}
                          >
                            <Plus className="h-4 w-4" />
                            New chat
                          </Button>
                        )}

                        {projectChatList.length > 0 ? (
                          <TooltipProvider delayDuration={150}>
                            <div className="space-y-2">
                              {projectChatList.map((chat) => renderChatItem(chat, project.id))}
                            </div>
                          </TooltipProvider>
                        ) : showSearchNoResults ? (
                          <div className="rounded-xl border border-dashed border-sidebar-border/60 p-6 text-center text-sm text-muted-foreground">
                            No chats match your search.
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-sidebar-border/60 p-6 text-center text-sm text-muted-foreground space-y-3">
                            <p>No chats in this project yet.</p>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onNewChat(project.id)}
                              data-testid={`button-empty-new-chat-project-${project.id}`}
                            >
                              New chat
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-sidebar-border/60 p-6 text-center text-sm text-muted-foreground">
                Create a project to organize your chats.
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>

   </Accordion>
  );

  const renderAccordionSections = (paddingClass: string) => (
    <div className={cn('space-y-4', paddingClass)}>{renderAccordion()}</div>
  );

  return (
    <div
      className={cn(
        'relative h-screen w-full bg-sidebar overflow-hidden shadow-none lg:border-r lg:border-sidebar-border lg:h-full',
        className
      )}
    >
      <div className="flex h-full w-full flex-col">
        <div className="hidden border-b border-sidebar-border md:block md:p-6">
          <Button
            onClick={() => onNewChat(null)}
            className="h-11 w-full justify-start gap-3 rounded-xl shadow-sm"
            variant="default"
            data-testid="button-new-chat"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>

        {/* Desktop: Profile outside ScrollArea */}
        <ScrollArea className="hidden md:flex md:flex-1">
          {renderAccordionSections('px-4 py-4 md:px-6 md:py-6')}
        </ScrollArea>
        {renderProfileSection('hidden md:block')}

        {/* Mobile: Profile inside ScrollArea to prevent overflow */}
        <ScrollArea className="flex-1 md:hidden">
          <div className="flex flex-col min-h-full">
            <div className="flex-1">
              {renderAccordionSections('px-4 py-4')}
            </div>
            {renderProfileSection('mt-auto')}
          </div>
        </ScrollArea>
      </div>

      {/* Confirmation Dialogs */}
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === 'delete' ? 'Delete chat' : 'Archive chat'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction
                ? confirmAction.type === 'delete'
                  ? `Deleting "${confirmAction.chatTitle}" will permanently remove this chat and all of its messages. This action cannot be undone.`
                  : `Are you sure you want to archive "${confirmAction.chatTitle}"? You can restore it later from archived chats.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cancel-confirm-action">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmAction) {
                  if (confirmAction.type === 'delete') {
                    onChatDelete(confirmAction.chatId);
                  } else {
                    onChatArchive(confirmAction.chatId);
                  }
                  setConfirmAction(null);
                }
              }}
              className={cn(
                confirmAction?.type === 'delete' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
              )}
              data-testid={confirmAction?.type === 'delete' ? 'confirm-delete-chat' : 'confirm-archive-chat'}
            >
              {confirmAction?.type === 'delete' ? 'Delete' : 'Archive'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Project Delete Confirmation */}
      <AlertDialog
        open={!!projectToDelete}
        onOpenChange={(open) => {
          if (!open) {
            setProjectToDelete(null);
            setIsProcessingProjectDeletion(false);
          }
        }}
      >
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project</AlertDialogTitle>
            <AlertDialogDescription>
              {projectToDelete
                ? `Deleting "${projectToDelete.name}" will remove its knowledge, instructions, and chat history. This action cannot be undone.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {projectToDelete ? (
            (() => {
              const projectChatCount = projectChatsAll.get(projectToDelete.id)?.length ?? 0;

              if (projectChatCount > 0) {
                return (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      This project has {projectChatCount} {projectChatCount === 1 ? 'chat' : 'chats'}. Choose what to do with them before deleting the project.
                    </p>
                    <div className="grid gap-2">
                      <Button
                        variant="outline"
                        onClick={() => handleProjectDeletion('move')}
                        disabled={isProcessingProjectDeletion}
                        data-testid="button-delete-project-move"
                      >
                        Move to Unassigned
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => handleProjectDeletion('delete')}
                        disabled={isProcessingProjectDeletion}
                        data-testid="button-delete-project-and-chats"
                      >
                        Delete chats
                      </Button>
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isProcessingProjectDeletion} data-testid="cancel-delete-project">
                        Cancel
                      </AlertDialogCancel>
                    </AlertDialogFooter>
                  </div>
                );
              }

              return (
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isProcessingProjectDeletion} data-testid="cancel-delete-project">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => handleProjectDeletion('delete')}
                    disabled={isProcessingProjectDeletion}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    data-testid="confirm-delete-project"
                  >
                    {isProcessingProjectDeletion ? 'Deleting…' : 'Delete'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              );
            })()
          ) : null}
        </AlertDialogContent>
      </AlertDialog>

      {/* Project Rename Dialog */}
      <Dialog
        open={showProjectRenameDialog}
        onOpenChange={(open) => {
          setShowProjectRenameDialog(open);
          if (!open) {
            setProjectToRename(null);
            setProjectRenameTitle('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Project</DialogTitle>
            <DialogDescription>Give this project a new name.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="project-rename">Project Name</Label>
              <Input
                id="project-rename"
                value={projectRenameTitle}
                onChange={(e) => setProjectRenameTitle(e.target.value)}
                placeholder="Project name"
                maxLength={200}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && projectToRename && projectRenameTitle.trim()) {
                    renameProjectMutation.mutate({
                      projectId: projectToRename.id,
                      name: projectRenameTitle.trim(),
                    });
                  }
                }}
                data-testid="input-project-rename"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowProjectRenameDialog(false);
                setProjectToRename(null);
                setProjectRenameTitle('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (projectToRename && projectRenameTitle.trim()) {
                  renameProjectMutation.mutate({
                    projectId: projectToRename.id,
                    name: projectRenameTitle.trim(),
                  });
                }
              }}
              disabled={!projectRenameTitle.trim() || renameProjectMutation.isPending}
              data-testid="button-project-rename-submit"
            >
              {renameProjectMutation.isPending ? 'Renaming...' : 'Rename'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Profile Settings Dialog */}
      <ProfileSettingsDialog
        isOpen={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          setDefaultSettingsTab(undefined);
          setSettingsFocusProvider(null);
        }}
        user={user ? {
          id: (user as UserType).id,
          username: preferences?.name || (user as UserType).email || '',
          email: (user as UserType).email || undefined,
          plan: (user as UserType).plan || 'free'
        } : undefined}
        defaultTab={defaultSettingsTab}
        focusProvider={settingsFocusProvider}
      />

      {/* Pro Upgrade Dialog */}
      <Dialog open={showProDialog} onOpenChange={setShowProDialog}>
        <DialogContent data-testid="dialog-upgrade-pro">
          <form onSubmit={handleUpgrade} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-primary" />
                Upgrade to Pro
              </DialogTitle>
              <DialogDescription>
                Enter your Pro access code to unlock unlimited features
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="access-code">Access Code</Label>
                <Input
                  id="access-code"
                  type="text"
                  placeholder="Enter your Pro access code"
                  value={proAccessCode}
                  onChange={(e) => setProAccessCode(e.target.value)}
                  data-testid="input-access-code"
                />
              </div>
              <div className="rounded-lg bg-muted p-3 text-sm">
                <p className="font-semibold mb-2">Pro Features:</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Unlimited messages per day</li>
                  <li>• Access to premium AI models (OpenAI, Claude, Perplexity)</li>
                  <li>• 5GB file upload limit</li>
                  <li>• Unlimited chat history</li>
                </ul>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowProDialog(false)}
                data-testid="button-cancel-upgrade"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!proAccessCode.trim() || upgradeMutation.isPending}
                data-testid="button-submit-upgrade"
              >
                {upgradeMutation.isPending ? 'Upgrading...' : 'Upgrade'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* New Project Dialog */}
      <Dialog open={showNewProjectDialog} onOpenChange={setShowNewProjectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Create an isolated workspace with its own knowledge and context
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="My Project"
                data-testid="input-project-name"
              />
            </div>
            <div>
              <Label htmlFor="project-description">Description (optional)</Label>
              <Input
                id="project-description"
                value={newProjectDescription}
                onChange={(e) => setNewProjectDescription(e.target.value)}
                placeholder="Project description..."
                data-testid="input-project-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewProjectDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              disabled={!newProjectName.trim() || createProjectMutation.isPending}
              data-testid="button-create-project"
            >
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Project Settings Dialog */}
      {selectedProjectId && (
        <ProjectSettingsDialog
          open={showProjectSettings}
          onOpenChange={setShowProjectSettings}
          projectId={selectedProjectId}
        />
      )}

      {/* Rename Chat Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Chat</DialogTitle>
            <DialogDescription>
              Enter a new name for this chat
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="chat-title">Chat Title</Label>
              <Input
                id="chat-title"
                value={newChatTitle}
                onChange={(e) => setNewChatTitle(e.target.value)}
                placeholder="Enter chat title"
                maxLength={200}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newChatTitle.trim() && chatToRename) {
                    renameChatMutation.mutate({ chatId: chatToRename.id, title: newChatTitle.trim() });
                  }
                }}
                data-testid="input-chat-title"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (chatToRename && newChatTitle.trim()) {
                  renameChatMutation.mutate({ chatId: chatToRename.id, title: newChatTitle.trim() });
                }
              }}
              disabled={!newChatTitle.trim() || renameChatMutation.isPending}
              data-testid="button-rename-chat-submit"
            >
              {renameChatMutation.isPending ? 'Renaming...' : 'Rename'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Project Dialog */}
      <Dialog
        open={showMoveToProjectDialog}
        onOpenChange={(open) => {
          setShowMoveToProjectDialog(open);
          if (!open) {
            setChatToMove(null);
            setChatMoveOriginProjectId(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Chat to Project</DialogTitle>
            <DialogDescription>Select a project to move this chat into.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-2">
              {projects && projects.length > 0 ? (
                projects.map((project) => (
                  <Button
                    key={project.id}
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() =>
                      chatToMove && moveChatMutation.mutate({ chatId: chatToMove, projectId: project.id })
                    }
                    disabled={
                      moveChatMutation.isPending || chatMoveOriginProjectId === project.id
                    }
                    data-testid={`button-move-to-project-${project.id}`}
                  >
                    <FolderOpen className="h-4 w-4 mr-2" />
                    {project.name}
                  </Button>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-sidebar-border/60 p-4 text-center text-sm text-muted-foreground">
                  Create a project to move this chat.
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

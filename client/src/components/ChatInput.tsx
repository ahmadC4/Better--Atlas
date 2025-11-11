import { useState, useRef, KeyboardEvent, useCallback, useEffect, useMemo } from 'react';
import { Send, Paperclip, Mic, MicOff, X, FileText, Image as ImageIcon, File, Upload, CheckCircle2, AlertCircle, Folder, Plus, Search, FileUp, MessageSquare, Sparkles, Shield, Video, ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { ensureCsrfToken, getCsrfToken } from '@/lib/csrf';
import { AI_MODELS, type AIModel, type Expert } from '@shared/schema';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { 
  useEffectiveCapabilities, 
  canUseExperts as checkCanUseExperts, 
  canUseTemplates as checkCanUseTemplates,
  canAccessExpert,
  canAccessTemplate,
  getMaxFileSizeMb,
  shouldShowUpsell,
  getUpsellMessage
} from '@/hooks/use-effective-capabilities';

// Slash command definitions
interface SlashCommand {
  name: string;
  description: string;
  icon: any;
  action: () => void;
}

const createSlashCommands = (handlers: {
  onAddKnowledge: () => void;
  onGoogleDrive: () => void;
  onNewProject: () => void;
  onSummarize: () => void;
  onSearch: () => void;
  onAttach: () => void;
  onExpert: () => void;
  onTemplate: () => void;
}): SlashCommand[] => [
  {
    name: '/addknowledge',
    description: 'Add knowledge to your knowledge base',
    icon: FileUp,
    action: handlers.onAddKnowledge,
  },
  {
    name: '/googledrive',
    description: 'Access Google Drive files',
    icon: Folder,
    action: handlers.onGoogleDrive,
  },
  {
    name: '/newproject',
    description: 'Create a new project',
    icon: Plus,
    action: handlers.onNewProject,
  },
  {
    name: '/summarize',
    description: 'Summarize the current conversation',
    icon: MessageSquare,
    action: handlers.onSummarize,
  },
  {
    name: '/search',
    description: 'Start a web search query',
    icon: Search,
    action: handlers.onSearch,
  },
  {
    name: '/attach',
    description: 'Attach a file',
    icon: Paperclip,
    action: handlers.onAttach,
  },
  {
    name: '/expert',
    description: 'Select an expert AI assistant',
    icon: Sparkles,
    action: handlers.onExpert,
  },
  {
    name: '/template',
    description: 'Choose an output template',
    icon: FileText,
    action: handlers.onTemplate,
  },
];

interface FileAttachment {
  id: string;
  file: File;
  preview?: string;
  type: 'image' | 'document' | 'video' | 'other';
  uploadStatus: 'pending' | 'uploading' | 'completed' | 'failed';
  uploadProgress?: number;
  analysisResult?: {
    hasAnalysis: boolean;
    contentPreview?: string;
    metadata?: any;
  };
  error?: string;
}

interface OutputTemplateSummary {
  id: string;
  name: string;
  category: string;
  format: string;
  description: string | null;
  instructions: string | null;
  requiredSections: Array<{ key: string; title: string; description?: string | null }>;
}

interface ChatRequestMetadata {
  deepVoyageEnabled?: boolean;
  taskSummary?: string;
  outputTemplateId?: string | null;
}

const OUTPUT_TEMPLATE_CATEGORY_LABELS: Record<string, string> = {
  how_to: 'How-To',
  executive_brief: 'Executive Brief',
  json_report: 'JSON',
};

const formatOutputTemplateCategory = (category: string): string => {
  return OUTPUT_TEMPLATE_CATEGORY_LABELS[category] ?? category;
};

const ADD_FILE_ERROR_MESSAGE = "We couldn’t add that file. Try a smaller file or a different format.";

interface ChatInputProps {
  onSendMessage: (
    message: string,
    files?: FileAttachment[],
    metadata?: ChatRequestMetadata
  ) => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
  selectedModel?: string;
  selectedExpert?: string | null;
  onExpertChange?: (expertId: string | null) => void;
  onOpenKnowledgeDialog?: () => void;
  onOpenNewProjectDialog?: () => void;
  maxFileSizeBytes?: number;
  enabledFeatures?: string[];
  onHeightChange?: (height: number) => void;
}

export function ChatInput({
  onSendMessage,
  isLoading = false,
  placeholder = "Type your message...",
  className,
  selectedModel = 'compound',
  selectedExpert = null,
  onExpertChange,
  onOpenKnowledgeDialog,
  onOpenNewProjectDialog,
  maxFileSizeBytes = 10 * 1024 * 1024,
  enabledFeatures = [],
  onHeightChange,
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [taskSummary, setTaskSummary] = useState('');
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [filteredCommands, setFilteredCommands] = useState<SlashCommand[]>([]);
  const [selectedOutputTemplateId, setSelectedOutputTemplateId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const longPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const [, setLocation] = useLocation();
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [drawerView, setDrawerView] = useState<'root' | 'experts' | 'templates'>('root');
  const [lastAddAction, setLastAddAction] = useState<'files' | 'experts' | 'templates' | null>(null);
  const isMobile = useIsMobile();
  const { toast } = useToast();

  // Feature toggles
  const [deepVoyageEnabled, setDeepVoyageEnabled] = useState(false);

  // Fetch available experts
  const { data: expertsData } = useQuery<{ experts: Expert[] }>({
    queryKey: ['/api/experts'],
    staleTime: 60000, // 1 minute
  });
  const experts = expertsData?.experts ?? [];

  const { data: outputTemplatesData } = useQuery<{ 
    templates: OutputTemplateSummary[];
    planRestricted?: boolean;
    upsellMessage?: string;
  }>({
    queryKey: ['/api/output-templates'],
    staleTime: 300000,
  });

  const outputTemplates = outputTemplatesData?.templates ?? [];
  const templatesPlanRestricted = outputTemplatesData?.planRestricted ?? false;
  const templatesUpsellMessage = outputTemplatesData?.upsellMessage ?? '';
  const selectedOutputTemplate = selectedOutputTemplateId
    ? outputTemplates.find(template => template.id === selectedOutputTemplateId) ?? null
    : null;

  // Get effective capabilities from the single source of truth
  const { data: capabilities, isLoading: capabilitiesLoading } = useEffectiveCapabilities();

  const maxFileSizeLabel = useMemo(() => {
    const effectiveSize = capabilities
      ? getMaxFileSizeMb(capabilities) * 1024 * 1024
      : maxFileSizeBytes;
    const gb = 1024 * 1024 * 1024;
    const mb = 1024 * 1024;
    if (effectiveSize >= gb) {
      const gbValue = effectiveSize / gb;
      return gbValue % 1 === 0 ? `${gbValue}GB` : `${gbValue.toFixed(1)}GB`;
    }
    const mbValue = effectiveSize / mb;
    return mbValue % 1 === 0 ? `${mbValue}MB` : `${mbValue.toFixed(1)}MB`;
  }, [capabilities, maxFileSizeBytes]);

  // Get current model capabilities
  const currentModel = AI_MODELS.find(m => m.id === selectedModel);
  const supportsThinking = currentModel?.capabilities.includes('thinking') ?? false;
  const supportsSearch = currentModel?.capabilities.includes('search') ?? false;
  const featureSet = useMemo(() => new Set(enabledFeatures), [enabledFeatures]);
  
  // Use the new capabilities hook for feature checking
  const canUseExperts = checkCanUseExperts(capabilities);
  const canUseTemplates = checkCanUseTemplates(capabilities);
  const expertsRestricted = !canUseExperts;
  const templatesRestricted = !canUseTemplates;
  const deepVoyageAvailable = featureSet.has('deep-research') && supportsThinking && supportsSearch;
  
  // Update max file size based on capabilities
  const effectiveMaxFileSizeBytes = capabilities 
    ? getMaxFileSizeMb(capabilities) * 1024 * 1024 
    : maxFileSizeBytes;

  const closeAddMenu = useCallback(() => {
    setIsAddMenuOpen(false);
    setDrawerView('root');
  }, []);

  const handleAddMenuOpenChange = useCallback((open: boolean) => {
    setIsAddMenuOpen(open);
    if (!open) {
      setDrawerView('root');
    }
  }, []);

  const showAddItemError = useCallback((message: string = ADD_FILE_ERROR_MESSAGE) => {
    toast({
      title: message,
      variant: 'destructive',
    });
  }, [toast]);

  const handleExpertSelection = useCallback((expertId: string | null) => {
    setLastAddAction('experts');
    if (onExpertChange) {
      onExpertChange(expertId);
    }
    closeAddMenu();
  }, [onExpertChange, closeAddMenu]);

  const handleTemplateSelection = useCallback((templateId: string | null) => {
    setLastAddAction('templates');
    setSelectedOutputTemplateId(templateId);
    closeAddMenu();
  }, [closeAddMenu]);

  // Reset toggles when model changes to prevent state leakage
  useEffect(() => {
    if (!supportsThinking) setDeepVoyageEnabled(false);
  }, [selectedModel, supportsThinking]);

  useEffect(() => {
    if (!deepVoyageAvailable && deepVoyageEnabled) {
      setDeepVoyageEnabled(false);
    }
  }, [deepVoyageAvailable, deepVoyageEnabled]);

  // Slash command handlers
  const commandHandlers = {
    onAddKnowledge: () => {
      if (onOpenKnowledgeDialog) {
        onOpenKnowledgeDialog();
      } else {
        console.log('Knowledge dialog handler not provided');
      }
      setMessage('');
      setShowAutocomplete(false);
    },
    onGoogleDrive: () => {
      setLocation('/google-drive');
      setMessage('');
      setShowAutocomplete(false);
    },
    onNewProject: () => {
      if (onOpenNewProjectDialog) {
        onOpenNewProjectDialog();
      } else {
        console.log('New project dialog handler not provided');
      }
      setMessage('');
      setShowAutocomplete(false);
    },
    onSummarize: () => {
      setMessage('Please summarize our conversation so far.');
      setShowAutocomplete(false);
      textareaRef.current?.focus();
    },
    onSearch: () => {
      // Set message to prompt for web search
      setMessage('Search: ');
      setShowAutocomplete(false);
      textareaRef.current?.focus();
    },
    onAttach: () => {
      handleFileSelect();
      setMessage('');
      setShowAutocomplete(false);
    },
    onExpert: () => {
      setIsAddMenuOpen(true);
      setDrawerView('experts');
      setMessage('');
      setShowAutocomplete(false);
    },
    onTemplate: () => {
      setIsAddMenuOpen(true);
      setDrawerView('templates');
      setMessage('');
      setShowAutocomplete(false);
    },
  };

  const slashCommands = createSlashCommands(commandHandlers);

  // Check if audio recording is supported
  useEffect(() => {
    const checkAudioSupport = async () => {
      try {
        if (
          navigator.mediaDevices && 
          typeof navigator.mediaDevices.getUserMedia === 'function' &&
          typeof MediaRecorder !== 'undefined'
        ) {
          setSpeechSupported(true);
        }
      } catch {
        setSpeechSupported(false);
      }
    };
    checkAudioSupport();
  }, []);

  const handleVoiceInput = useCallback(async () => {
    if (!speechSupported) {
      console.warn('Audio recording not supported');
      return;
    }

    if (isRecording && mediaRecorderRef.current) {
      // Stop recording
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    } else {
      try {
        // Start recording
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus'
        });
        
        audioChunksRef.current = [];
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };
        
        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          
          // Convert blob to base64
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64Audio = (reader.result as string).split(',')[1];
            
            try {
              // Send to backend for transcription
              const response = await fetch('/api/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  audio: base64Audio,
                  format: 'webm'
                })
              });
              
              if (!response.ok) {
                throw new Error('Transcription failed');
              }
              
              const result = await response.json();
              
              // Add transcribed text to message
              setMessage(prev => prev + (prev ? ' ' : '') + result.text);
              
              // Auto-resize textarea
              if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
                textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
              }
            } catch (error) {
              console.error('Transcription error:', error);
            }
          };
          reader.readAsDataURL(audioBlob);
        };
        
        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start();
        setIsRecording(true);
      } catch (error) {
        console.error('Error starting recording:', error);
        setIsRecording(false);
      }
    }
  }, [speechSupported, isRecording]);

  const handleSend = () => {
    if ((message.trim() || attachments.length > 0) && !isLoading) {
      // Prepare metadata with toggle states (only for supported capabilities)
      const trimmedTaskSummary = taskSummary.trim();
      const metadata: ChatRequestMetadata = {};

      if (deepVoyageAvailable && deepVoyageEnabled) {
        metadata.deepVoyageEnabled = true;
      }

      if (trimmedTaskSummary) {
        metadata.taskSummary = trimmedTaskSummary;
      }

      if (selectedOutputTemplateId) {
        metadata.outputTemplateId = selectedOutputTemplateId;
      }

      const metadataPayload = Object.keys(metadata).length > 0 ? metadata : undefined;

      onSendMessage(
        message.trim(),
        attachments.length > 0 ? attachments : undefined,
        metadataPayload
      );
      
      // Revoke object URLs to prevent memory leaks
      attachments.forEach(attachment => {
        if (attachment.preview) {
          URL.revokeObjectURL(attachment.preview);
        }
      });
      
      setMessage('');
      setAttachments([]);
      setSelectedOutputTemplateId(null);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle autocomplete navigation
    if (showAutocomplete && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCommandIndex(prev => 
          prev < filteredCommands.length - 1 ? prev + 1 : prev
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCommandIndex(prev => prev > 0 ? prev - 1 : prev);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const selectedCommand = filteredCommands[selectedCommandIndex];
        if (selectedCommand) {
          selectedCommand.action();
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowAutocomplete(false);
        return;
      }
    }
    
    // Allow Enter to create new lines (removed auto-send behavior)
    // Only the Send button triggers message send
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessage(value);
    
    // Detect slash commands
    const trimmedValue = value.trim();
    if (trimmedValue.startsWith('/')) {
      const query = trimmedValue.toLowerCase();
      const filtered = slashCommands.filter(cmd => 
        cmd.name.toLowerCase().startsWith(query)
      );
      setFilteredCommands(filtered);
      setShowAutocomplete(filtered.length > 0);
      setSelectedCommandIndex(0);
    } else {
      setShowAutocomplete(false);
      setFilteredCommands([]);
    }
    
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const getFileType = (file: File): 'image' | 'document' | 'video' | 'other' => {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.includes('pdf') || file.type.includes('document') || file.type.includes('text')) return 'document';
    return 'other';
  };

  // File type validation
  const validateFileType = (file: File): { valid: boolean; error?: string } => {
    const maxSize = effectiveMaxFileSizeBytes;
    if (file.size > maxSize) {
      return { valid: false, error: `File too large (max ${maxFileSizeLabel})` };
    }
    
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'text/csv',
      'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      return { valid: false, error: 'Unsupported file type' };
    }
    
    return { valid: true };
  };

  // Upload file to backend
  const uploadFile = async (attachment: FileAttachment): Promise<void> => {
    setAttachments(prev => prev.map(a => 
      a.id === attachment.id 
        ? { ...a, uploadStatus: 'uploading', uploadProgress: 0 }
        : a
    ));

    try {
      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]); // Remove data:type;base64, prefix
        };
        reader.onerror = reject;
        reader.readAsDataURL(attachment.file);
      });

      // Simulate upload progress
      setAttachments(prev => prev.map(a => 
        a.id === attachment.id ? { ...a, uploadProgress: 50 } : a
      ));

      // Upload to backend
      const csrfToken = getCsrfToken() || await ensureCsrfToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }

      const response = await fetch('/api/uploads', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          name: attachment.file.name,
          mimeType: attachment.file.type,
          data: base64,
          analyze: true
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      // Update attachment with server response
      setAttachments(prev => prev.map(a => 
        a.id === attachment.id 
          ? { 
              ...a, 
              uploadStatus: 'completed',
              uploadProgress: 100,
              id: result.id, // Use server-generated ID
              analysisResult: {
                hasAnalysis: result.hasAnalysis || false,
                contentPreview: result.contentPreview,
                metadata: result.metadata
              }
            }
          : a
      ));
    } catch (error) {
      console.error('Upload failed:', error);
      setAttachments(prev => prev.map(a =>
        a.id === attachment.id
          ? {
              ...a,
              uploadStatus: 'failed',
              error: ADD_FILE_ERROR_MESSAGE
            }
          : a
      ));
      showAddItemError();
    }
  };

  const processFiles = useCallback(async (files: FileList) => {
    const newAttachments: FileAttachment[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Validate file
      const validation = validateFileType(file);
      if (!validation.valid) {
        console.warn(`File ${file.name} rejected: ${validation.error}`);
        showAddItemError();
        continue;
      }

      const fileType = getFileType(file);

      // Generate unique ID
      const id = `temp-${Date.now()}-${i}`;

      // Create preview for images/videos
      let preview: string | undefined;
      if (fileType === 'image' || fileType === 'video') {
        preview = URL.createObjectURL(file);
      }
      
      const attachment: FileAttachment = {
        id,
        file,
        preview,
        type: fileType,
        uploadStatus: 'pending'
      };
      
      newAttachments.push(attachment);
    }
    
    if (newAttachments.length > 0) {
      setLastAddAction('files');
      setAttachments(prev => [...prev, ...newAttachments]);

      // Auto-upload files
      for (const attachment of newAttachments) {
        uploadFile(attachment);
      }
    }
  }, [setLastAddAction, showAddItemError]);

  const handleFileSelect = useCallback(() => {
    setLastAddAction('files');
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      processFiles(files);
    }
    // Reset input to allow selecting the same file again
    e.target.value = '';
  }, [processFiles]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => {
      const attachment = prev.find(a => a.id === id);
      if (attachment?.preview) {
        URL.revokeObjectURL(attachment.preview);
      }
      return prev.filter(a => a.id !== id);
    });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFiles(files);
    }
  }, [processFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const getFileIcon = (type: FileAttachment['type']) => {
    switch (type) {
      case 'image': return ImageIcon;
      case 'document': return FileText;
      case 'video': return Video;
      default: return File;
    }
  };

  useEffect(() => {
    if (!onHeightChange || !containerRef.current) {
      return;
    }

    const notify = () => {
      if (containerRef.current) {
        onHeightChange(containerRef.current.offsetHeight);
      }
    };

    notify();

    const observer = new ResizeObserver(() => {
      notify();
    });

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [onHeightChange]);

  const selectedExpertDetails = canUseExperts && selectedExpert
    ? experts.find(e => e.id === selectedExpert) ?? null
    : null;

  const noExpertsAvailable = canUseExperts && experts.length === 0;
  const templatesAvailable = canUseTemplates ? outputTemplates : [];
  const noTemplatesAvailable = canUseTemplates && templatesAvailable.length === 0;

  const addMenuTriggerClasses = 'flex-shrink-0 h-11 w-11 rounded-lg p-0 sm:h-10 sm:w-10';

  const openAddMenuWithView = useCallback((view: 'root' | 'experts' | 'templates') => {
    setDrawerView(view);
    setIsAddMenuOpen(true);
  }, []);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimeoutRef.current !== null) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, []);

  const handleAddButtonPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!isMobile || event.pointerType !== 'touch' || !lastAddAction) {
      longPressTriggeredRef.current = false;
      return;
    }
    longPressTriggeredRef.current = false;
    clearLongPressTimer();
    longPressTimeoutRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      openAddMenuWithView(lastAddAction === 'files' ? 'root' : lastAddAction);
    }, 500);
  }, [clearLongPressTimer, isMobile, lastAddAction, openAddMenuWithView]);

  const handleAddButtonPointerEnd = useCallback(() => {
    if (!isMobile) {
      return;
    }
    clearLongPressTimer();
  }, [clearLongPressTimer, isMobile]);

  const handleAddButtonClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (!isMobile) {
      return;
    }
    if (longPressTriggeredRef.current) {
      event.preventDefault();
      longPressTriggeredRef.current = false;
      return;
    }
    openAddMenuWithView('root');
  }, [isMobile, openAddMenuWithView]);

  const mobileActionClass = 'flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60';

  const mobileAddMenu = (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={addMenuTriggerClasses}
        aria-label="Add to message"
        data-testid="button-add-to-message"
        onClick={handleAddButtonClick}
        onPointerDown={handleAddButtonPointerDown}
        onPointerUp={handleAddButtonPointerEnd}
        onPointerLeave={handleAddButtonPointerEnd}
        onPointerCancel={handleAddButtonPointerEnd}
      >
        <Plus className="h-5 w-5" />
      </Button>
      <Drawer open={isAddMenuOpen} onOpenChange={handleAddMenuOpenChange}>
        <DrawerContent className="pb-4">
          {drawerView === 'root' && (
            <>
              <DrawerHeader className="px-4 pb-2 pt-4 text-left">
                <DrawerTitle>Add to message</DrawerTitle>
              </DrawerHeader>
              <div className="space-y-2 px-4 pb-2">
                <button
                  type="button"
                  className={mobileActionClass}
                  onClick={() => {
                    closeAddMenu();
                    setTimeout(() => handleFileSelect(), 300);
                  }}
                >
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">Add files</span>
                    <span className="text-xs text-muted-foreground">Upload documents, images, or videos</span>
                  </div>
                </button>
                <button
                  type="button"
                  className={mobileActionClass}
                  onClick={() => {
                    if (canUseExperts) {
                      setDrawerView('experts');
                    }
                  }}
                  disabled={!canUseExperts}
                >
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">Choose Expert</span>
                    <span className="text-xs text-muted-foreground">
                      {expertsRestricted
                        ? 'Admin only'
                        : noExpertsAvailable
                          ? 'No experts available. Ask your admin to enable experts.'
                          : 'Assign a specialist for this conversation'}
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  className={mobileActionClass}
                  onClick={() => {
                    if (canUseTemplates) {
                      setDrawerView('templates');
                    }
                  }}
                  disabled={!canUseTemplates}
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">Choose Template</span>
                    <span className="text-xs text-muted-foreground">
                      {templatesRestricted
                        ? 'Admin only'
                        : noTemplatesAvailable
                          ? 'No templates yet. Create or import one to get started.'
                          : 'Structure your next reply'}
                    </span>
                  </div>
                </button>
              </div>
            </>
          )}
          {drawerView === 'experts' && (
            <div>
              <DrawerHeader className="flex items-center gap-2 px-4 pb-2 pt-4 text-left">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setDrawerView('root')}
                  aria-label="Back to Add to message"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <DrawerTitle>Choose Expert</DrawerTitle>
              </DrawerHeader>
              <div className="space-y-2 px-4 pb-4">
                <button
                  type="button"
                  className={mobileActionClass}
                  onClick={() => handleExpertSelection(null)}
                >
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">No expert</span>
                    <span className="text-xs text-muted-foreground">Use the default assistant</span>
                  </div>
                </button>
                {experts.length > 0 ? (
                  experts.map(expert => (
                    <button
                      key={expert.id}
                      type="button"
                      className={mobileActionClass}
                      onClick={() => handleExpertSelection(expert.id)}
                    >
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">{expert.name}</span>
                        {expert.description && (
                          <span className="text-xs text-muted-foreground">{expert.description}</span>
                        )}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-muted-foreground/40 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    No experts available. Ask your admin to enable experts.
                  </div>
                )}
              </div>
            </div>
          )}
          {drawerView === 'templates' && (
            <div>
              <DrawerHeader className="flex items-center gap-2 px-4 pb-2 pt-4 text-left">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setDrawerView('root')}
                  aria-label="Back to Add to message"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <DrawerTitle>Choose Template</DrawerTitle>
              </DrawerHeader>
              <div className="space-y-2 px-4 pb-4">
                <button
                  type="button"
                  className={mobileActionClass}
                  onClick={() => handleTemplateSelection(null)}
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">No template</span>
                    <span className="text-xs text-muted-foreground">Send without a template</span>
                  </div>
                </button>
                {templatesAvailable.length > 0 ? (
                  templatesAvailable.map(template => (
                    <button
                      key={template.id}
                      type="button"
                      className={mobileActionClass}
                      onClick={() => handleTemplateSelection(template.id)}
                    >
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">{template.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatOutputTemplateCategory(template.category)}
                        </span>
                        {template.description && (
                          <span className="text-xs text-muted-foreground/80">{template.description}</span>
                        )}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-muted-foreground/40 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    No templates yet. Create or import one to get started.
                  </div>
                )}
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );

  const desktopAddMenu = (
    <DropdownMenu open={isAddMenuOpen} onOpenChange={handleAddMenuOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={addMenuTriggerClasses}
          aria-label="Add to message"
          data-testid="button-add-to-message"
        >
          <Plus className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuLabel>Add to message</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            handleFileSelect();
            closeAddMenu();
          }}
          className="gap-3"
        >
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          Add files
        </DropdownMenuItem>
        {canUseExperts ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-3">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Choose Expert
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-72">
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  handleExpertSelection(null);
                }}
                className="flex-col items-start gap-1"
              >
                <span className="text-sm font-medium text-foreground">No expert</span>
                <span className="text-xs text-muted-foreground">Use the default assistant</span>
              </DropdownMenuItem>
              {experts.length > 0 ? (
                experts.map(expert => (
                  <DropdownMenuItem
                    key={expert.id}
                    onSelect={(event) => {
                      event.preventDefault();
                      handleExpertSelection(expert.id);
                    }}
                    className="flex-col items-start gap-1"
                  >
                    <span className="text-sm font-medium text-foreground">{expert.name}</span>
                    {expert.description && (
                      <span className="text-xs text-muted-foreground">{expert.description}</span>
                    )}
                  </DropdownMenuItem>
                ))
              ) : (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  No experts available. Ask your admin to enable experts.
                </div>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : (
          <DropdownMenuItem disabled className="flex-col items-start gap-1">
            <div className="flex items-center gap-3">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Choose Expert
            </div>
            <span className="text-xs text-muted-foreground">Admin only</span>
          </DropdownMenuItem>
        )}
        {canUseTemplates ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-3">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Choose Template
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-72">
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  handleTemplateSelection(null);
                }}
                className="flex-col items-start gap-1"
              >
                <span className="text-sm font-medium text-foreground">No template</span>
                <span className="text-xs text-muted-foreground">Send without a template</span>
              </DropdownMenuItem>
              {templatesAvailable.length > 0 ? (
                templatesAvailable.map(template => (
                  <DropdownMenuItem
                    key={template.id}
                    onSelect={(event) => {
                      event.preventDefault();
                      handleTemplateSelection(template.id);
                    }}
                    className="flex-col items-start gap-1"
                  >
                    <span className="text-sm font-medium text-foreground">{template.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatOutputTemplateCategory(template.category)}
                    </span>
                    {template.description && (
                      <span className="text-xs text-muted-foreground/80">{template.description}</span>
                    )}
                  </DropdownMenuItem>
                ))
              ) : (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  No templates yet. Create or import one to get started.
                </div>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : (
          <DropdownMenuItem disabled className="flex-col items-start gap-1">
            <div className="flex items-center gap-3">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Choose Template
            </div>
            <span className="text-xs text-muted-foreground">Admin only</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const addMenu = isMobile ? mobileAddMenu : desktopAddMenu;

  return (
    <div
      ref={containerRef}
      className={cn(
        'sticky bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:backdrop-blur-md',
        className
      )}
    >
      <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-2 px-3 py-1.5 sm:gap-3 sm:px-4 sm:py-2">
        {(selectedExpertDetails || selectedOutputTemplate) && (
          <div className="flex flex-wrap items-center gap-2">
            {selectedExpertDetails && (
              <div
                className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground"
                data-testid="chip-expert"
              >
                <Shield className="h-3 w-3 text-muted-foreground" />
                <span>Expert: {selectedExpertDetails.name}</span>
                <button
                  type="button"
                  className="ml-1 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={() => onExpertChange?.(null)}
                  aria-label="Remove Expert"
                  data-testid="button-clear-expert"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            {selectedOutputTemplate && (
              <div
                className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground"
                data-testid="chip-template"
              >
                <FileText className="h-3 w-3 text-muted-foreground" />
                <span>Template: {selectedOutputTemplate.name}</span>
                <button
                  type="button"
                  className="ml-1 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={() => setSelectedOutputTemplateId(null)}
                  aria-label="Remove Template"
                  data-testid="button-clear-template"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        )}

        {showAutocomplete && filteredCommands.length > 0 && (
          <div
            className="absolute bottom-full left-0 right-0 mb-2 z-50 overflow-hidden rounded-lg border bg-card shadow-lg"
            data-testid="slash-command-autocomplete"
          >
            <div className="border-b bg-muted/50 p-2">
              <p className="text-xs font-medium text-muted-foreground">Slash Commands</p>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filteredCommands.map((command, index) => {
                const Icon = command.icon;
                const isSelected = index === selectedCommandIndex;
                return (
                  <button
                    key={command.name}
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                      isSelected ? 'bg-accent' : 'hover-elevate'
                    )}
                    onClick={() => {
                      command.action();
                    }}
                    data-testid={`slash-command-${command.name.slice(1)}`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{command.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{command.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="border-t bg-muted/50 p-2">
              <p className="text-xs text-muted-foreground">Use ↑↓ to navigate, Enter to select, Esc to close</p>
            </div>
          </div>
        )}

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((attachment) => {
              const IconComponent = getFileIcon(attachment.type);
              const getStatusIcon = () => {
                switch (attachment.uploadStatus) {
                  case 'completed':
                    return <CheckCircle2 className="h-3 w-3 text-green-600" />;
                  case 'failed':
                    return <AlertCircle className="h-3 w-3 text-red-600" />;
                  case 'uploading':
                    return <Upload className="h-3 w-3 animate-pulse text-blue-600" />;
                  default:
                    return null;
                }
              };

              return (
                <div
                  key={attachment.id}
                  className={cn(
                    'relative flex max-w-xs flex-col gap-1.5 rounded-lg border bg-card p-2',
                    attachment.uploadStatus === 'failed' && 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20'
                  )}
                  data-testid={`attachment-${attachment.id}`}
                >
                  <div className="flex items-center gap-2">
                    {attachment.type === 'image' && attachment.preview ? (
                      <img src={attachment.preview} alt={attachment.file.name} className="h-12 w-12 rounded object-cover" />
                    ) : attachment.type === 'video' && attachment.preview ? (
                      <video
                        src={attachment.preview}
                        className="h-12 w-12 rounded object-cover"
                        muted
                        playsInline
                        loop
                      />
                    ) : (
                      <IconComponent className="h-6 w-6 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <p className="truncate text-xs font-medium">{attachment.file.name}</p>
                        {getStatusIcon()}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {(attachment.file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => removeAttachment(attachment.id)}
                      data-testid={`remove-attachment-${attachment.id}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>

                  {attachment.uploadStatus === 'uploading' && (
                    <div className="space-y-1">
                      <Progress
                        value={attachment.uploadProgress || 0}
                        className="h-1"
                        data-testid={`upload-progress-${attachment.id}`}
                      />
                      <p className="text-[11px] text-muted-foreground">Uploading and analyzing...</p>
                    </div>
                  )}

                  {attachment.uploadStatus === 'failed' && attachment.error && (
                    <p className="text-[11px] text-red-600 dark:text-red-400">{attachment.error}</p>
                  )}

                  {attachment.uploadStatus === 'completed' && attachment.analysisResult?.hasAnalysis && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                          Analyzed
                        </Badge>
                        {attachment.analysisResult.metadata?.pages && (
                          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                            {attachment.analysisResult.metadata.pages} pages
                          </Badge>
                        )}
                      </div>
                      {attachment.analysisResult.contentPreview && (
                        <p className="line-clamp-2 text-[11px] text-muted-foreground">{attachment.analysisResult.contentPreview}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div
          className={cn(
            'relative flex w-full items-end gap-2 rounded-xl border bg-card/95 px-2 py-1.5 shadow-sm transition-colors sm:gap-3 sm:px-3 sm:py-2',
            isDragOver && 'border-primary bg-primary/5'
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,video/mp4,video/quicktime,video/webm,video/x-m4v,video/3gpp"
            onChange={handleFileInputChange}
            className="hidden"
            data-testid="file-input"
          />

          {addMenu}

          {deepVoyageAvailable && (
            <Button
              variant={deepVoyageEnabled ? 'default' : 'outline'}
              size="sm"
              className={cn(
                'flex-shrink-0 gap-1 px-2 transition-colors h-11 sm:h-10 sm:px-3 sm:gap-1.5',
                deepVoyageEnabled && 'bg-indigo-600 text-white hover:bg-indigo-700'
              )}
              onClick={() => setDeepVoyageEnabled(!deepVoyageEnabled)}
              data-testid="toggle-deep-voyage"
              aria-pressed={deepVoyageEnabled}
              aria-label="Toggle Deep Voyage mode"
              title="Deep Voyage"
            >
              <Sparkles className="h-5 w-5" />
              <span className="sr-only sm:hidden">Deep Voyage</span>
              <span className="hidden text-xs font-medium sm:inline">Deep Voyage</span>
            </Button>
          )}

          <Textarea
            ref={textareaRef}
            value={message}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyPress}
            placeholder={placeholder}
            disabled={isLoading}
            className="flex-1 resize-none border-0 bg-transparent px-0 py-1 text-sm leading-5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 scrollbar-thin min-h-[1.75rem] max-h-[160px] sm:text-[15px]"
            style={{ height: 'auto' }}
            rows={1}
            data-testid="textarea-message-input"
          />

          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'flex-shrink-0 rounded-lg p-0 h-11 w-11 sm:h-10 sm:w-10',
              isRecording && 'bg-red-500/20 text-red-600 hover:bg-red-500/30'
            )}
            disabled={isLoading || !speechSupported}
            data-testid="button-voice-input"
            onClick={handleVoiceInput}
          >
            {isRecording ? (
              <MicOff className="h-5 w-5" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </Button>

          <Button
            onClick={handleSend}
            disabled={(!message.trim() && attachments.length === 0) || isLoading}
            className="flex-shrink-0 rounded-lg p-0 h-11 w-11 sm:h-10 sm:w-10"
            data-testid="button-send-message"
          >
            <Send className="h-5 w-5" />
          </Button>

          {isDragOver && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10">
              <p className="text-sm font-medium text-primary">Drop files here to attach</p>
            </div>
          )}
        </div>

        <div className="hidden text-center sm:block">
          <p className="text-xs text-muted-foreground">Atlas makes mistakes. Verify important info.</p>
        </div>
      </div>
      <div className="safe-area-spacer" aria-hidden="true" />
    </div>
  );

}

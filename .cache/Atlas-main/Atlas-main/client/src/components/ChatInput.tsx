import { useState, useRef, KeyboardEvent, useCallback, useEffect, useMemo } from 'react';
import { Send, Paperclip, X, FileText, Image as ImageIcon, File, Upload, CheckCircle2, AlertCircle, Folder, Plus, Search, FileUp, MessageSquare, Sparkles, Shield } from 'lucide-react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { ensureCsrfToken, getCsrfToken } from '@/lib/csrf';
import { AI_MODELS, type AIModel, type Expert, formatFileUploadLimitLabel } from '@shared/schema';
import { AtlasVoiceIcon } from './icons/AtlasVoiceIcon';

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
];

interface FileAttachment {
  id: string;
  file: File;
  preview?: string;
  type: 'image' | 'document' | 'other';
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
  voiceMode?: boolean;
  preferredModelId?: string;
}

const OUTPUT_TEMPLATE_CATEGORY_LABELS: Record<string, string> = {
  how_to: 'How-To',
  executive_brief: 'Executive Brief',
  json_report: 'JSON',
};

const formatOutputTemplateCategory = (category: string): string => {
  return OUTPUT_TEMPLATE_CATEGORY_LABELS[category] ?? category;
};

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
  const [, setLocation] = useLocation();

  const maxFileSizeLabel = useMemo(() => {
    if (!Number.isFinite(maxFileSizeBytes)) {
      return 'Unlimited';
    }
    const limitMb = maxFileSizeBytes / (1024 * 1024);
    return `${formatFileUploadLimitLabel(limitMb)} per file`;
  }, [maxFileSizeBytes]);
  
  // Feature toggles
  const [deepVoyageEnabled, setDeepVoyageEnabled] = useState(false);

  // Fetch available experts
  const { data: experts = [] } = useQuery<Expert[]>({
    queryKey: ['/api/experts'],
    staleTime: 60000, // 1 minute
  });

  const { data: outputTemplatesData } = useQuery<{ templates: OutputTemplateSummary[] }>({
    queryKey: ['/api/output-templates'],
    staleTime: 300000,
  });

  const outputTemplates = outputTemplatesData?.templates ?? [];
  const selectedOutputTemplate = selectedOutputTemplateId
    ? outputTemplates.find(template => template.id === selectedOutputTemplateId) ?? null
    : null;

  // Get current model capabilities
  const currentModel = AI_MODELS.find(m => m.id === selectedModel);
  const supportsThinking = currentModel?.capabilities.includes('thinking') ?? false;
  const supportsSearch = currentModel?.capabilities.includes('search') ?? false;
  const featureSet = useMemo(() => new Set(enabledFeatures), [enabledFeatures]);
  const deepVoyageAvailable = featureSet.has('deep-research') && supportsThinking && supportsSearch;

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

  const VOICE_MODEL_ID = 'llama-3.1-8b-instant';

  const buildMetadataPayload = useCallback(
    (additional?: Partial<ChatRequestMetadata>) => {
      const metadata: ChatRequestMetadata = {};

      if (deepVoyageAvailable && deepVoyageEnabled) {
        metadata.deepVoyageEnabled = true;
      }

      const trimmedTaskSummary = taskSummary.trim();
      if (trimmedTaskSummary) {
        metadata.taskSummary = trimmedTaskSummary;
      }

      if (selectedOutputTemplateId) {
        metadata.outputTemplateId = selectedOutputTemplateId;
      }

      if (additional) {
        Object.assign(metadata, additional);
      }

      return Object.keys(metadata).length > 0 ? metadata : undefined;
    },
    [deepVoyageAvailable, deepVoyageEnabled, selectedOutputTemplateId, taskSummary],
  );

  const handleVoiceToggle = useCallback(async () => {
    if (!speechSupported) {
      console.warn('Audio recording not supported');
      return;
    }

    if (isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setIsRecording(false);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        mediaRecorderRef.current = null;

        const reader = new FileReader();
        reader.onloadend = async () => {
          const resultString = reader.result as string | null;
          if (!resultString) {
            return;
          }
          const base64Audio = resultString.split(',')[1];

          try {
            const response = await fetch('/api/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audio: base64Audio,
                format: 'webm',
              }),
            });

            if (!response.ok) {
              throw new Error('Transcription failed');
            }

            const transcription = await response.json();
            const transcriptText = typeof transcription.text === 'string' ? transcription.text.trim() : '';

            if (transcriptText) {
              const metadataPayload = buildMetadataPayload({
                voiceMode: true,
                preferredModelId: VOICE_MODEL_ID,
              });
              onSendMessage(transcriptText, undefined, metadataPayload);
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
  }, [buildMetadataPayload, isRecording, onSendMessage, speechSupported]);

  const handleSend = () => {
    if ((message.trim() || attachments.length > 0) && !isLoading) {
      const metadataPayload = buildMetadataPayload();

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
    
    // Normal enter to send
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
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

  const getFileType = (file: File): 'image' | 'document' | 'other' => {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.includes('pdf') || file.type.includes('document') || file.type.includes('text')) return 'document';
    return 'other';
  };

  // File type validation
  const validateFileType = (file: File): { valid: boolean; error?: string } => {
    const maxSize = maxFileSizeBytes;
    if (file.size > maxSize) {
      return { valid: false, error: `File too large (max ${maxFileSizeLabel})` };
    }
    
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'text/csv'
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
              error: error instanceof Error ? error.message : 'Upload failed'
            }
          : a
      ));
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
        continue;
      }
      
      const fileType = getFileType(file);
      
      // Generate unique ID
      const id = `temp-${Date.now()}-${i}`;
      
      // Create preview for images
      let preview: string | undefined;
      if (fileType === 'image') {
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
      setAttachments(prev => [...prev, ...newAttachments]);
      
      // Auto-upload files
      for (const attachment of newAttachments) {
        uploadFile(attachment);
      }
    }
  }, []);

  const handleFileSelect = useCallback(() => {
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

  return (
    <div
      ref={containerRef}
      className={cn(
        'sticky bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:backdrop-blur-md',
        className
      )}
    >
      <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-3 px-3 py-1.5 sm:px-4 sm:py-2">
        {/* Expert Selection */}
        {experts.length > 0 && onExpertChange && (
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <Select
              value={selectedExpert || 'none'}
              onValueChange={(value) => onExpertChange(value === 'none' ? null : value)}
            >
              <SelectTrigger className="h-9 w-full sm:w-[280px]" data-testid="select-expert">
                <SelectValue placeholder="Choose expert (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No expert</SelectItem>
                {experts.map((expert) => (
                  <SelectItem key={expert.id} value={expert.id} data-testid={`expert-option-${expert.id}`}>
                    {expert.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {outputTemplates.length > 0 && (
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-medium text-muted-foreground">
              Output template <span className="font-normal text-muted-foreground/80">(optional)</span>
            </Label>
            <Select
              value={selectedOutputTemplateId ?? 'none'}
              onValueChange={(value) => setSelectedOutputTemplateId(value === 'none' ? null : value)}
            >
              <SelectTrigger className="h-9 w-full sm:w-[280px]" data-testid="select-output-template">
                <SelectValue placeholder="No template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No template</SelectItem>
                {outputTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id} data-testid={`output-template-${template.id}`}>
                    {template.name} • {formatOutputTemplateCategory(template.category)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedOutputTemplate && (
              <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground" data-testid="output-template-details">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-foreground text-xs">{selectedOutputTemplate.name}</p>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{selectedOutputTemplate.format}</span>
                </div>
                {selectedOutputTemplate.description && (
                  <p className="text-xs leading-snug text-muted-foreground/90">{selectedOutputTemplate.description}</p>
                )}
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground/90">Required sections</p>
                  <ul className="ml-4 list-disc space-y-0.5 text-xs">
                    {selectedOutputTemplate.requiredSections.map((section) => (
                      <li key={section.key} className="text-muted-foreground">
                        <span className="text-foreground font-medium">{section.title}</span>
                        {section.description ? <span className="text-muted-foreground/80"> — {section.description}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <Label htmlFor="chat-task-summary" className="sr-only">
            Add a goal (optional)
          </Label>
          <Input
            id="chat-task-summary"
            value={taskSummary}
            onChange={(event) => setTaskSummary(event.target.value)}
            placeholder="Add a goal (optional)"
            disabled={isLoading}
            maxLength={240}
            className="h-9 text-sm"
            data-testid="input-task-summary"
          />
        </div>

        {/* Slash Command Autocomplete */}
        {showAutocomplete && filteredCommands.length > 0 && (
          <div
            className="absolute bottom-full left-0 right-0 mb-2 bg-card border rounded-lg shadow-lg overflow-hidden z-50"
            data-testid="slash-command-autocomplete"
          >
            <div className="p-2 border-b bg-muted/50">
              <p className="text-xs text-muted-foreground font-medium">Slash Commands</p>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filteredCommands.map((command, index) => {
                const Icon = command.icon;
                const isSelected = index === selectedCommandIndex;
                return (
                  <button
                    key={command.name}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                      isSelected ? "bg-accent" : "hover-elevate"
                    )}
                    onClick={() => {
                      command.action();
                    }}
                    data-testid={`slash-command-${command.name.slice(1)}`}
                  >
                    <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{command.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {command.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="p-2 border-t bg-muted/50">
              <p className="text-xs text-muted-foreground">
                Use ↑↓ to navigate, Enter to select, Esc to close
              </p>
            </div>
          </div>
        )}

        {/* File Attachments Preview */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((attachment) => {
              const IconComponent = getFileIcon(attachment.type);
              const getStatusIcon = () => {
                switch (attachment.uploadStatus) {
                  case 'completed': return <CheckCircle2 className="h-3 w-3 text-green-600" />;
                  case 'failed': return <AlertCircle className="h-3 w-3 text-red-600" />;
                  case 'uploading': return <Upload className="h-3 w-3 text-blue-600 animate-pulse" />;
                  default: return null;
                }
              };
              
              return (
                <div
                  key={attachment.id}
                  className={cn(
                    "relative flex flex-col gap-2 p-3 bg-card border rounded-lg max-w-xs",
                    attachment.uploadStatus === 'failed' && "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20"
                  )}
                  data-testid={`attachment-${attachment.id}`}
                >
                  {/* Header with file info and status */}
                  <div className="flex items-center gap-2">
                    {attachment.type === 'image' && attachment.preview ? (
                      <img
                        src={attachment.preview}
                        alt={attachment.file.name}
                        className="w-8 h-8 object-cover rounded"
                      />
                    ) : (
                      <IconComponent className="w-6 h-6 text-muted-foreground" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="text-xs font-medium truncate">{attachment.file.name}</p>
                        {getStatusIcon()}
                      </div>
                      <p className="text-xs text-muted-foreground">
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

                  {/* Upload Progress */}
                  {attachment.uploadStatus === 'uploading' && (
                    <div className="space-y-1">
                      <Progress 
                        value={attachment.uploadProgress || 0} 
                        className="h-1"
                        data-testid={`upload-progress-${attachment.id}`}
                      />
                      <p className="text-xs text-muted-foreground">
                        Uploading and analyzing...
                      </p>
                    </div>
                  )}

                  {/* Error Message */}
                  {attachment.uploadStatus === 'failed' && attachment.error && (
                    <p className="text-xs text-red-600 dark:text-red-400">
                      {attachment.error}
                    </p>
                  )}

                  {/* Analysis Result Preview */}
                  {attachment.uploadStatus === 'completed' && attachment.analysisResult?.hasAnalysis && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="text-xs px-1 py-0">
                          Analyzed
                        </Badge>
                        {attachment.analysisResult.metadata?.pages && (
                          <Badge variant="outline" className="text-xs px-1 py-0">
                            {attachment.analysisResult.metadata.pages} pages
                          </Badge>
                        )}
                      </div>
                      {attachment.analysisResult.contentPreview && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {attachment.analysisResult.contentPreview}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Active Selections Chips */}
        {(selectedExpert || selectedOutputTemplateId) && (
          <div className="flex flex-wrap items-center gap-2">
            {selectedExpert && (
              <Badge 
                variant="secondary" 
                className="flex items-center gap-1 pl-2 pr-1 py-1"
                data-testid="chip-expert"
              >
                <Shield className="h-3 w-3" />
                <span className="text-xs">Expert: {experts.find(e => e.id === selectedExpert)?.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 p-0 hover:bg-transparent"
                  onClick={() => onExpertChange?.(null)}
                  data-testid="button-clear-expert"
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            )}
            {selectedOutputTemplateId && selectedOutputTemplate && (
              <Badge 
                variant="secondary" 
                className="flex items-center gap-1 pl-2 pr-1 py-1"
                data-testid="chip-template"
              >
                <FileText className="h-3 w-3" />
                <span className="text-xs">Template: {selectedOutputTemplate.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 p-0 hover:bg-transparent"
                  onClick={() => setSelectedOutputTemplateId(null)}
                  data-testid="button-clear-template"
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            )}
          </div>
        )}

        <div
          className={cn(
            'relative flex w-full items-center gap-2 rounded-xl border bg-card/95 px-2 py-1.5 shadow-sm transition-colors sm:gap-3 sm:px-3 sm:py-2',
            isDragOver && 'border-primary bg-primary/5'
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
            onChange={handleFileInputChange}
            className="hidden"
            data-testid="file-input"
          />

          {/* Attachment button */}
          <Button
            variant="ghost"
            size="sm"
            className="flex-shrink-0 rounded-lg p-0 h-11 w-11 sm:h-10 sm:w-10"
            disabled={isLoading}
            data-testid="button-attach-file"
            onClick={handleFileSelect}
          >
            <Paperclip className="h-5 w-5" />
          </Button>

          {/* Deep Voyage toggle inline */}
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

          {/* Text input */}
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyPress}
            placeholder={placeholder}
            disabled={isLoading}
            className="flex-1 resize-none border-0 bg-transparent px-0 py-1.5 text-sm leading-6 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 scrollbar-thin min-h-[1.75rem] max-h-[160px] sm:text-[15px]"
            style={{ height: 'auto' }}
            rows={1}
            data-testid="textarea-message-input"
          />

          {/* Voice input button */}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'flex-shrink-0 rounded-lg p-0 h-11 w-11 sm:h-10 sm:w-10 text-muted-foreground transition-colors',
              isRecording
                ? 'bg-primary/15 text-primary hover:bg-primary/25 animate-pulse'
                : 'hover:text-primary'
            )}
            disabled={isLoading || !speechSupported}
            data-testid="button-voice-input"
            onClick={handleVoiceToggle}
            aria-pressed={isRecording}
            aria-label={isRecording ? 'Stop voice recording' : 'Start voice recording'}
          >
            <AtlasVoiceIcon className="h-5 w-5" />
          </Button>

          {/* Send button */}
          <Button
            onClick={handleSend}
            disabled={(!message.trim() && attachments.length === 0) || isLoading}
            className="flex-shrink-0 rounded-lg p-0 h-11 w-11 sm:h-10 sm:w-10"
            data-testid="button-send-message"
          >
            <Send className="h-5 w-5" />
          </Button>

          {/* Drag overlay */}
          {isDragOver && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10">
              <p className="text-sm font-medium text-primary">Drop files here to attach</p>
            </div>
          )}
        </div>

        {/* Footer text */}
        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Atlas makes mistakes. Verify important info.
          </p>
        </div>
      </div>
      <div className="safe-area-spacer" aria-hidden="true" />
    </div>
  );
}

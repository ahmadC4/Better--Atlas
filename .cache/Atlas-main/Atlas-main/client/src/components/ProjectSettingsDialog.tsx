import { useState, useEffect, useRef, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Settings,
  FileText,
  Share2,
  Trash2,
  Upload,
  Link2,
  Type,
  Copy,
  Check,
  Loader2,
  ExternalLink,
  X,
  BookOpen,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
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
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import type { Project, ProjectKnowledge, UserPlan } from '@shared/schema';
import { useAuth } from '@/hooks/useAuth';

interface ProjectSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function ProjectSettingsDialog({
  open,
  onOpenChange,
  projectId,
}: ProjectSettingsDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const plan: UserPlan = user?.plan === 'enterprise' ? 'enterprise' : user?.plan === 'pro' ? 'pro' : 'free';
  const maxFileSizeBytes = plan === 'enterprise'
    ? 10 * 1024 * 1024 * 1024
    : plan === 'pro'
      ? 5 * 1024 * 1024 * 1024
      : 10 * 1024 * 1024;
  const maxFileSizeLabel = useMemo(() => {
    const gb = 1024 * 1024 * 1024;
    const mb = 1024 * 1024;
    if (maxFileSizeBytes >= gb) {
      const value = maxFileSizeBytes / gb;
      return value % 1 === 0 ? `${value}GB` : `${value.toFixed(1)}GB`;
    }
    const value = maxFileSizeBytes / mb;
    return value % 1 === 0 ? `${value}MB` : `${value.toFixed(1)}MB`;
  }, [maxFileSizeBytes]);
  const [activeTab, setActiveTab] = useState('general');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // General tab state
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [includeGlobalKnowledge, setIncludeGlobalKnowledge] = useState(false);
  const [includeUserMemories, setIncludeUserMemories] = useState(false);

  // Instructions tab state
  const [customInstructions, setCustomInstructions] = useState('');

  // Knowledge tab state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [knowledgeUrl, setKnowledgeUrl] = useState('');
  const [knowledgeUrlTitle, setKnowledgeUrlTitle] = useState('');
  const [knowledgeTextTitle, setKnowledgeTextTitle] = useState('');
  const [knowledgeTextContent, setKnowledgeTextContent] = useState('');
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [showAddUrl, setShowAddUrl] = useState(false);
  const [showAddText, setShowAddText] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Share tab state
  const [isPublic, setIsPublic] = useState(false);

  // Fetch project data
  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ['/api/projects', projectId],
    enabled: open && !!projectId,
  });

  // Fetch project knowledge
  const { data: knowledgeItems, isLoading: knowledgeLoading } = useQuery<ProjectKnowledge[]>({
    queryKey: ['/api/projects', projectId, 'knowledge'],
    enabled: open && !!projectId && activeTab === 'knowledge',
  });

  // Update local state when project data is fetched
  useEffect(() => {
    if (project) {
      setProjectName(project.name || '');
      setProjectDescription(project.description || '');
      setCustomInstructions(project.customInstructions || '');
      setIsPublic(project.isPublic === 'true');
      setIncludeGlobalKnowledge(project.includeGlobalKnowledge === 'true');
      setIncludeUserMemories(project.includeUserMemories === 'true');
    }
  }, [project]);

  // Update project mutation
  const updateProjectMutation = useMutation({
    mutationFn: async (data: {
      name?: string;
      description?: string;
      customInstructions?: string;
      includeGlobalKnowledge?: string;
      includeUserMemories?: string;
    }) => {
      return await apiRequest('PATCH', `/api/projects/${projectId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({
        title: 'Success',
        description: 'Your changes have been saved successfully.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'We couldn\'t save these settings. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Delete project mutation
  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('DELETE', `/api/projects/${projectId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({
        title: 'Project deleted',
        description: 'The project has been permanently deleted.',
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to delete project. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Generate share link mutation
  const generateShareMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', `/api/projects/${projectId}/share`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId] });
      setIsPublic(true);
      toast({
        title: 'Share link generated',
        description: 'Anyone with the link can now view this project.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to generate share link. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Revoke share link mutation
  const revokeShareMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('DELETE', `/api/projects/${projectId}/share`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId] });
      setIsPublic(false);
      toast({
        title: 'Share link revoked',
        description: 'The project is no longer publicly accessible.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to revoke share link. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Add knowledge file mutation
  const addFileMutation = useMutation({
    mutationFn: async (data: { name: string; mimeType: string; data: string }) => {
      return await apiRequest('POST', `/api/projects/${projectId}/knowledge/file`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'knowledge'] });
      setSelectedFile(null);
      setShowFileUpload(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast({
        title: 'File uploaded',
        description: 'Your file has been added to the knowledge base.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Upload failed',
        description: error?.message || 'Failed to upload file. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Add knowledge URL mutation
  const addUrlMutation = useMutation({
    mutationFn: async (data: { url: string; title?: string }) => {
      return await apiRequest('POST', `/api/projects/${projectId}/knowledge/url`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'knowledge'] });
      setKnowledgeUrl('');
      setKnowledgeUrlTitle('');
      setShowAddUrl(false);
      toast({
        title: 'URL added',
        description: 'The URL has been added to the knowledge base.',
      });
    },
    onError: () => {
      toast({
        title: 'Failed to add URL',
        description: 'Please check the URL and try again.',
        variant: 'destructive',
      });
    },
  });

  // Add knowledge text mutation
  const addTextMutation = useMutation({
    mutationFn: async (data: { title: string; content: string }) => {
      return await apiRequest('POST', `/api/projects/${projectId}/knowledge/text`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'knowledge'] });
      setKnowledgeTextTitle('');
      setKnowledgeTextContent('');
      setShowAddText(false);
      toast({
        title: 'Text added',
        description: 'Your text has been added to the knowledge base.',
      });
    },
    onError: () => {
      toast({
        title: 'Failed to add text',
        description: 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Delete knowledge mutation
  const deleteKnowledgeMutation = useMutation({
    mutationFn: async (knowledgeId: string) => {
      return await apiRequest('DELETE', `/api/projects/${projectId}/knowledge/${knowledgeId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'knowledge'] });
      toast({
        title: 'Item deleted',
        description: 'The knowledge item has been removed.',
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

  // Handlers
  const handleSaveGeneral = () => {
    if (!projectName.trim()) {
      toast({
        title: 'Validation error',
        description: 'Project name is required.',
        variant: 'destructive',
      });
      return;
    }

    updateProjectMutation.mutate({
      name: projectName,
      description: projectDescription,
      includeGlobalKnowledge: includeGlobalKnowledge ? 'true' : 'false',
      includeUserMemories: includeUserMemories ? 'true' : 'false',
    });
  };

  const handleSaveInstructions = () => {
    updateProjectMutation.mutate({
      customInstructions,
    });
  };

  const handleDeleteProject = () => {
    setShowDeleteConfirm(false);
    deleteProjectMutation.mutate();
  };

  const handleTogglePublic = (checked: boolean) => {
    if (checked) {
      generateShareMutation.mutate();
    } else {
      revokeShareMutation.mutate();
    }
  };

  const handleCopyShareLink = () => {
    if (!project?.shareToken) return;

    const shareUrl = `${window.location.origin}/projects/${projectId}?token=${project.shareToken}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
    toast({
      title: 'Link copied',
      description: 'Share link has been copied to clipboard.',
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size based on plan
    if (file.size > maxFileSizeBytes) {
      toast({
        title: 'File too large',
        description: `Please upload files smaller than ${maxFileSizeLabel}.`,
        variant: 'destructive',
      });
      return;
    }

    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
    ];

    if (!allowedTypes.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload PDF, DOC, TXT, or MD files only.',
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
      const dataUrl = e.target?.result as string;
      // Extract base64 data from data URL (remove data:mime;base64, prefix)
      const base64Data = dataUrl.split(',')[1];
      
      addFileMutation.mutate({
        name: selectedFile.name,
        mimeType: selectedFile.type,
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
    if (!knowledgeUrl.trim()) {
      toast({
        title: 'Validation error',
        description: 'URL is required.',
        variant: 'destructive',
      });
      return;
    }

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
    if (!knowledgeTextTitle.trim() || !knowledgeTextContent.trim()) {
      toast({
        title: 'Validation error',
        description: 'Title and content are required.',
        variant: 'destructive',
      });
      return;
    }

    addTextMutation.mutate({
      title: knowledgeTextTitle,
      content: knowledgeTextContent,
    });
  };

  const formatFileSize = (bytes: string) => {
    const size = parseInt(bytes);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
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

  const shareUrl = project?.shareToken
    ? `${window.location.origin}/projects/${projectId}?token=${project.shareToken}`
    : '';

  const getSaveButtonText = () => {
    switch (activeTab) {
      case 'general':
        return 'Save';
      case 'instructions':
        return 'Save Instructions';
      case 'knowledge':
        return null; // No global save button for knowledge
      case 'share':
        return null; // No save button for share
      default:
        return 'Save';
    }
  };

  const handleSave = () => {
    switch (activeTab) {
      case 'general':
        handleSaveGeneral();
        break;
      case 'instructions':
        handleSaveInstructions();
        break;
      default:
        break;
    }
  };

  const showSaveButton = activeTab === 'general' || activeTab === 'instructions';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[min(720px,calc(100vw-2rem))] p-0 gap-0 max-h-[90vh] flex flex-col">
          {/* Sticky Header */}
          <div className="flex-shrink-0 border-b bg-background">
            <div className="p-6 pb-4">
              <h2 className="text-xl font-semibold">Project Settings</h2>
            </div>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="mx-6 mb-4 grid grid-cols-4 w-auto">
                <TabsTrigger value="general" className="gap-2 text-sm" data-testid="tab-general">
                  <Settings className="h-4 w-4" />
                  <span className="hidden sm:inline">General</span>
                </TabsTrigger>
                <TabsTrigger value="instructions" className="gap-2 text-sm" data-testid="tab-instructions">
                  <BookOpen className="h-4 w-4" />
                  <span className="hidden sm:inline">Instructions</span>
                </TabsTrigger>
                <TabsTrigger value="knowledge" className="gap-2 text-sm" data-testid="tab-knowledge">
                  <FileText className="h-4 w-4" />
                  <span className="hidden sm:inline">Knowledge</span>
                </TabsTrigger>
                <TabsTrigger value="share" className="gap-2 text-sm" data-testid="tab-share">
                  <Share2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Share</span>
                </TabsTrigger>
              </TabsList>

              {/* Scrollable Content Area */}
              <ScrollArea className="h-[calc(90vh-200px)] px-6">
                {/* General Tab */}
                <TabsContent value="general" className="mt-0 space-y-4 pb-4">
                  {projectLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="project-name" className="text-sm">Project Name</Label>
                        <Input
                          id="project-name"
                          value={projectName}
                          onChange={(e) => setProjectName(e.target.value)}
                          placeholder="Enter project name"
                          className="text-base"
                          data-testid="input-project-name"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="project-description" className="text-sm">Description</Label>
                        <Textarea
                          id="project-description"
                          value={projectDescription}
                          onChange={(e) => setProjectDescription(e.target.value)}
                          placeholder="Enter project description (optional)"
                          rows={4}
                          className="text-base resize-none"
                          data-testid="input-project-description"
                        />
                      </div>

                      <div className="space-y-4 rounded-xl border border-border bg-muted/40 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <p className="text-sm font-medium">Use global knowledge base</p>
                            <p className="text-xs text-muted-foreground">
                              When enabled, this project can reference knowledge items that live in your personal workspace in addition to project knowledge.
                            </p>
                          </div>
                          <Switch
                            checked={includeGlobalKnowledge}
                            onCheckedChange={setIncludeGlobalKnowledge}
                            data-testid="switch-include-global-knowledge"
                          />
                        </div>

                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <p className="text-sm font-medium">Use trained memories & chat history</p>
                            <p className="text-xs text-muted-foreground">
                              Allow the assistant to bring in personal memories, profile details, and long-term chat context that you've trained outside of this project.
                            </p>
                          </div>
                          <Switch
                            checked={includeUserMemories}
                            onCheckedChange={setIncludeUserMemories}
                            data-testid="switch-include-user-memories"
                          />
                        </div>
                      </div>

                      <Separator className="my-6" />

                      <div className="space-y-2">
                        <h3 className="text-base font-semibold text-destructive">Danger Zone</h3>
                        <p className="text-sm text-muted-foreground">
                          Once you delete a project, there is no going back. Please be certain.
                        </p>
                        <Button
                          variant="destructive"
                          onClick={() => setShowDeleteConfirm(true)}
                          disabled={deleteProjectMutation.isPending}
                          data-testid="button-delete-project"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Project
                        </Button>
                      </div>
                    </>
                  )}
                </TabsContent>

                {/* Instructions Tab */}
                <TabsContent value="instructions" className="mt-0 space-y-4 pb-4">
                  <div className="space-y-2">
                    <Label htmlFor="custom-instructions" className="text-sm">Custom Instructions</Label>
                    <p className="text-xs text-muted-foreground">
                      Provide project-specific context and instructions for the AI assistant.
                    </p>
                    <Textarea
                      id="custom-instructions"
                      value={customInstructions}
                      onChange={(e) => setCustomInstructions(e.target.value)}
                      placeholder="e.g., This project is a web application built with React and TypeScript..."
                      rows={12}
                      className="text-base resize-none"
                      data-testid="input-custom-instructions"
                    />
                    <div className="flex justify-end">
                      <p className="text-xs text-muted-foreground">
                        {customInstructions.length} characters
                      </p>
                    </div>
                  </div>
                </TabsContent>

                {/* Knowledge Tab */}
                <TabsContent value="knowledge" className="mt-0 space-y-4 pb-4">
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowFileUpload(!showFileUpload)}
                      data-testid="button-upload-file"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload File
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddUrl(!showAddUrl)}
                      data-testid="button-add-url"
                    >
                      <Link2 className="h-4 w-4 mr-2" />
                      Add URL
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddText(!showAddText)}
                      data-testid="button-add-text"
                    >
                      <Type className="h-4 w-4 mr-2" />
                      Add Text
                    </Button>
                  </div>

                  {/* File Upload Form */}
                  {showFileUpload && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Upload File</CardTitle>
                        <CardDescription className="text-sm">
                          Upload PDF, DOC, TXT, or MD files (max {maxFileSizeLabel})
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <Input
                          ref={fileInputRef}
                          type="file"
                          onChange={handleFileSelect}
                          accept=".pdf,.doc,.docx,.txt,.md"
                          className="text-sm"
                          data-testid="input-file-upload"
                        />
                        {selectedFile && (
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            <span className="text-sm">{selectedFile.name}</span>
                            <Badge variant="secondary" className="text-xs">
                              {formatFileSize(selectedFile.size.toString())}
                            </Badge>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={handleUploadFile}
                            disabled={!selectedFile || addFileMutation.isPending}
                            data-testid="button-confirm-upload-file"
                          >
                            {addFileMutation.isPending && (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            )}
                            Upload
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setShowFileUpload(false);
                              setSelectedFile(null);
                              if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                            data-testid="button-cancel-upload-file"
                          >
                            Cancel
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Add URL Form */}
                  {showAddUrl && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Add URL</CardTitle>
                        <CardDescription className="text-sm">
                          Add a web page or document URL to the knowledge base
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="url-title" className="text-sm">Title (Optional)</Label>
                          <Input
                            id="url-title"
                            value={knowledgeUrlTitle}
                            onChange={(e) => setKnowledgeUrlTitle(e.target.value)}
                            placeholder="Enter a title for this URL"
                            className="text-base"
                            data-testid="input-url-title"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="url" className="text-sm">URL</Label>
                          <Input
                            id="url"
                            value={knowledgeUrl}
                            onChange={(e) => setKnowledgeUrl(e.target.value)}
                            placeholder="https://example.com"
                            className="text-base"
                            data-testid="input-url"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={handleAddUrl}
                            disabled={!knowledgeUrl.trim() || addUrlMutation.isPending}
                            data-testid="button-confirm-add-url"
                          >
                            {addUrlMutation.isPending && (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            )}
                            Add URL
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setShowAddUrl(false);
                              setKnowledgeUrl('');
                              setKnowledgeUrlTitle('');
                            }}
                            data-testid="button-cancel-add-url"
                          >
                            Cancel
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Add Text Form */}
                  {showAddText && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Add Text</CardTitle>
                        <CardDescription className="text-sm">
                          Add custom text or notes to the knowledge base
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="text-title" className="text-sm">Title</Label>
                          <Input
                            id="text-title"
                            value={knowledgeTextTitle}
                            onChange={(e) => setKnowledgeTextTitle(e.target.value)}
                            placeholder="Enter a title"
                            className="text-base"
                            data-testid="input-text-title"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="text-content" className="text-sm">Content</Label>
                          <Textarea
                            id="text-content"
                            value={knowledgeTextContent}
                            onChange={(e) => setKnowledgeTextContent(e.target.value)}
                            placeholder="Enter your text content"
                            rows={6}
                            className="text-base resize-none"
                            data-testid="input-text-content"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={handleAddText}
                            disabled={
                              !knowledgeTextTitle.trim() ||
                              !knowledgeTextContent.trim() ||
                              addTextMutation.isPending
                            }
                            data-testid="button-confirm-add-text"
                          >
                            {addTextMutation.isPending && (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            )}
                            Add Text
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setShowAddText(false);
                              setKnowledgeTextTitle('');
                              setKnowledgeTextContent('');
                            }}
                            data-testid="button-cancel-add-text"
                          >
                            Cancel
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Knowledge Items List */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Knowledge Items</h3>
                    {knowledgeLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    ) : knowledgeItems && knowledgeItems.length > 0 ? (
                      <div className="space-y-2 max-h-[300px] overflow-y-auto rounded-md border p-3">
                        {knowledgeItems.map((item) => {
                          const Icon = getKnowledgeIcon(item.type);
                          return (
                            <Card key={item.id} data-testid={`knowledge-item-${item.id}`}>
                              <CardContent className="p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-start gap-2 flex-1 min-w-0">
                                    <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate">{item.title}</p>
                                      <div className="flex gap-2 mt-1">
                                        <Badge variant="secondary" className="text-xs">{item.type}</Badge>
                                        {item.type === 'file' && item.fileSize && (
                                          <Badge variant="secondary" className="text-xs">
                                            {formatFileSize(item.fileSize)}
                                          </Badge>
                                        )}
                                        {item.type === 'file' && item.fileType && (
                                          <Badge variant="secondary" className="text-xs">
                                            {item.fileType.split('/').pop()}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => deleteKnowledgeMutation.mutate(item.id)}
                                    disabled={deleteKnowledgeMutation.isPending}
                                    data-testid={`button-delete-knowledge-${item.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <p className="text-sm">No knowledge items yet</p>
                        <p className="text-xs">Upload files, add URLs, or add text to get started</p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Share Tab */}
                <TabsContent value="share" className="mt-0 space-y-4 pb-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Public Access</CardTitle>
                      <CardDescription className="text-sm">
                        Allow anyone with the link to view this project
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <Label htmlFor="public-toggle" className="text-sm">Enable Public Access</Label>
                          <p className="text-xs text-muted-foreground">
                            Generate a shareable link for this project
                          </p>
                        </div>
                        <Switch
                          id="public-toggle"
                          checked={isPublic}
                          onCheckedChange={handleTogglePublic}
                          disabled={generateShareMutation.isPending || revokeShareMutation.isPending}
                          data-testid="switch-public-access"
                        />
                      </div>

                      {isPublic && shareUrl && (
                        <>
                          <Separator />
                          <div className="space-y-2">
                            <Label className="text-sm">Share Link</Label>
                            <div className="flex gap-2">
                              <Input
                                value={shareUrl}
                                readOnly
                                className="text-sm"
                                data-testid="input-share-link"
                              />
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={handleCopyShareLink}
                                data-testid="button-copy-share-link"
                              >
                                {copiedLink ? (
                                  <Check className="h-4 w-4" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                            <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
                              <span className="text-yellow-600 dark:text-yellow-500 text-xs">
                                ⚠️ Anyone with this link can view this project
                              </span>
                            </div>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </div>

          {/* Sticky Footer */}
          {showSaveButton && (
            <div className="flex-shrink-0 border-t bg-background px-6 py-4">
              <div className="flex justify-end">
                <Button
                  onClick={handleSave}
                  disabled={updateProjectMutation.isPending}
                  data-testid="button-save"
                >
                  {updateProjectMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  {getSaveButtonText()}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent data-testid="dialog-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the project
              and all of its associated data, including chats, knowledge items, and files.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

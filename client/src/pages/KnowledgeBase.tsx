import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useLastAreaPreference } from '@/hooks/useLastAreaPreference';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  FileText,
  Upload,
  Link2,
  Type,
  Trash2,
  Loader2,
  Globe,
  Users,
  User,
  Lock,
  Shield,
  AlertCircle,
  Plus,
  X,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { useEffectiveCapabilities } from '@/hooks/use-effective-capabilities';
import type { KnowledgeItem, Team } from '@shared/schema';
import { cn } from '@/lib/utils';

type KnowledgeType = 'file' | 'url' | 'text';
type KnowledgeScope = 'system' | 'team' | 'user';

interface KnowledgeItemWithScope extends KnowledgeItem {
  scope?: KnowledgeScope;
  scopeId?: string | null;
  createdBy?: string | null;
}

export default function KnowledgeBase() {
  useLastAreaPreference('user');
  const { user } = useAuth();
  const { data: capabilities } = useEffectiveCapabilities();
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState<KnowledgeScope>('user');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [addType, setAddType] = useState<KnowledgeType>('text');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<KnowledgeItemWithScope | null>(null);
  
  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  
  // Determine available scopes based on plan
  const availableScopes = useMemo(() => {
    if (!capabilities) return ['user'] as KnowledgeScope[];

    const { system, team, user: userKb } = capabilities.features.kb;

    return [
      ...(system ? ['system'] : []),
      ...(team ? ['team'] : []),
      ...(userKb ? ['user'] : []),
    ] as KnowledgeScope[];
  }, [capabilities]);

  useEffect(() => {
    if (!availableScopes.includes(activeTab) && availableScopes.length > 0) {
      setActiveTab(availableScopes[0]);
    }
  }, [activeTab, availableScopes]);
  
  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = user?.role === 'admin' || isSuperAdmin;
  
  // Fetch user's teams
  const { data: teamsData } = useQuery<Team[]>({
    queryKey: ['/api/teams'],
    enabled: availableScopes.includes('team'),
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/teams');
      return res.json();
    },
  });
  const teams = teamsData || [];

  // Fetch knowledge items based on active tab
  const knowledgeQueryKey = useMemo(() => {
    if (activeTab === 'team') {
      return selectedTeamId ? ['/api/knowledge/team', selectedTeamId] : ['/api/knowledge/team'];
    }

    if (activeTab === 'system') {
      return ['/api/knowledge/system'];
    }

    return ['/api/knowledge/user'];
  }, [activeTab, selectedTeamId]);

  const knowledgeQueryFn = useCallback(async () => {
    if (activeTab === 'team') {
      if (!selectedTeamId) {
        return [];
      }

      const res = await apiRequest('GET', `/api/knowledge/team/${selectedTeamId}`);
      return res.json();
    }

    if (activeTab === 'system') {
      const res = await apiRequest('GET', '/api/knowledge/system');
      return res.json();
    }

    const res = await apiRequest('GET', '/api/knowledge/user');
    return res.json();
  }, [activeTab, selectedTeamId]);

  const { data: knowledgeData, isLoading } = useQuery<KnowledgeItemWithScope[]>({
    queryKey: knowledgeQueryKey,
    queryFn: knowledgeQueryFn,
    enabled:
      availableScopes.includes(activeTab) &&
      (activeTab !== 'team' || !!selectedTeamId || teams.length === 0),
  });
  
  const knowledgeItems = knowledgeData || [];
  
  // Create knowledge item mutation
  const createKnowledgeMutation = useMutation({
    mutationFn: async (data: { type: KnowledgeType; title: string; content: string; url?: string }) => {
      let endpoint = '/api/knowledge/text';
      let body: any = { title: data.title, content: data.content };
      
      if (data.type === 'url') {
        endpoint = '/api/knowledge/url';
        body = { url: data.url, title: data.title };
      }
      
      // Add scope-specific endpoints
      if (activeTab === 'system' && isSuperAdmin) {
        endpoint = '/api/knowledge/system';
        body = { ...body, type: data.type };
        if (data.type === 'url') body.sourceUrl = data.url;
      } else if (activeTab === 'team' && selectedTeamId) {
        endpoint = `/api/knowledge/team/${selectedTeamId}`;
        body = { ...body, type: data.type };
        if (data.type === 'url') body.sourceUrl = data.url;
      }
      
      return apiRequest('POST', endpoint, body);
    },
    onSuccess: () => {
      toast({ description: 'Knowledge item added successfully' });
      queryClient.invalidateQueries({ queryKey: knowledgeQueryKey });
      setAddDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        description: error.message || 'Failed to add knowledge item',
      });
    },
  });
  
  // Delete knowledge item mutation
  const deleteKnowledgeMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/knowledge/${id}`),
    onSuccess: () => {
      toast({ description: 'Knowledge item deleted' });
      queryClient.invalidateQueries({ queryKey: knowledgeQueryKey });
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        description: error.message || 'Failed to delete knowledge item',
      });
    },
  });
  
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploadingFile(true);
    
    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        const base64Data = base64.split(',')[1];
        
        let endpoint = '/api/knowledge/file';
        let body: any = {
          name: file.name,
          mimeType: file.type,
          data: base64Data,
        };
        
        // Add scope-specific endpoints for file upload
        if (activeTab === 'system' && isSuperAdmin) {
          endpoint = '/api/knowledge/system';
          body = {
            type: 'file',
            title: file.name,
            content: '(File content will be extracted)',
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size.toString(),
          };
        } else if (activeTab === 'team' && selectedTeamId) {
          endpoint = `/api/knowledge/team/${selectedTeamId}`;
          body = {
            type: 'file',
            title: file.name,
            content: '(File content will be extracted)',
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size.toString(),
          };
        }
        
        await apiRequest('POST', endpoint, body);

        toast({ description: 'File uploaded successfully' });
        queryClient.invalidateQueries({ queryKey: knowledgeQueryKey });
        setAddDialogOpen(false);
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        description: error.message || 'Failed to upload file',
      });
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [activeTab, isSuperAdmin, knowledgeQueryKey, selectedTeamId, toast]);
  
  const handleAddKnowledge = useCallback(() => {
    if (addType === 'text') {
      createKnowledgeMutation.mutate({ type: 'text', title, content });
    } else if (addType === 'url') {
      createKnowledgeMutation.mutate({ type: 'url', title: title || url, content: '', url });
    }
  }, [addType, title, content, url, createKnowledgeMutation]);
  
  const resetForm = useCallback(() => {
    setTitle('');
    setContent('');
    setUrl('');
    setAddType('text');
  }, []);
  
  const canEditScope = useCallback((scope: KnowledgeScope) => {
    if (scope === 'system') return isSuperAdmin;
    if (scope === 'team') {
      // Check if user is admin/owner of selected team
      // This would need team member info to be fully accurate
      return true; // For now, allow if they can view the team
    }
    return scope === 'user';
  }, [isSuperAdmin]);
  
  // Auto-select first team if available
  useEffect(() => {
    if (activeTab === 'team' && teams.length > 0 && !selectedTeamId) {
      setSelectedTeamId(teams[0].id);
    }
  }, [activeTab, teams, selectedTeamId]);
  
  const getScopeIcon = (scope: KnowledgeScope) => {
    switch (scope) {
      case 'system': return <Globe className="h-4 w-4" />;
      case 'team': return <Users className="h-4 w-4" />;
      case 'user': return <User className="h-4 w-4" />;
    }
  };
  
  const getScopeLabel = (scope: KnowledgeScope) => {
    switch (scope) {
      case 'system': return 'System';
      case 'team': return 'Team';
      case 'user': return 'Personal';
    }
  };
  
  return (
    <div className="container mx-auto py-6 px-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Knowledge Base</h1>
        <p className="text-muted-foreground mt-2">
          Manage your knowledge base items across different scopes
        </p>
      </div>
      
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as KnowledgeScope)}>
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          {availableScopes.includes('system') && (
            <TabsTrigger value="system" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              System
            </TabsTrigger>
          )}
          {availableScopes.includes('team') && (
            <TabsTrigger value="team" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team
            </TabsTrigger>
          )}
          {availableScopes.includes('user') && (
            <TabsTrigger value="user" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Personal
            </TabsTrigger>
          )}
        </TabsList>
        
        <div className="mt-6">
          {/* Team selector for team tab */}
          {activeTab === 'team' && teams.length > 0 && (
            <div className="mb-4">
              <Label>Select Team</Label>
              <Select value={selectedTeamId || ''} onValueChange={setSelectedTeamId}>
                <SelectTrigger className="w-full max-w-sm">
                  <SelectValue placeholder="Select a team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map(team => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="flex items-center gap-2">
                    {getScopeIcon(activeTab)}
                    {getScopeLabel(activeTab)} Knowledge Base
                  </CardTitle>
                  {!canEditScope(activeTab) && (
                    <Badge variant="secondary" className="ml-2">
                      <Lock className="h-3 w-3 mr-1" />
                      Read Only
                    </Badge>
                  )}
                </div>
                {canEditScope(activeTab) && (
                  <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Item
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Add Knowledge Item</DialogTitle>
                        <DialogDescription>
                          Add a new item to your {getScopeLabel(activeTab).toLowerCase()} knowledge base
                        </DialogDescription>
                      </DialogHeader>
                      
                      <Tabs value={addType} onValueChange={(v) => setAddType(v as KnowledgeType)}>
                        <TabsList className="grid grid-cols-3 w-full">
                          <TabsTrigger value="text">
                            <Type className="h-4 w-4 mr-2" />
                            Text
                          </TabsTrigger>
                          <TabsTrigger value="url">
                            <Link2 className="h-4 w-4 mr-2" />
                            URL
                          </TabsTrigger>
                          <TabsTrigger value="file">
                            <Upload className="h-4 w-4 mr-2" />
                            File
                          </TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="text" className="space-y-4">
                          <div>
                            <Label htmlFor="text-title">Title</Label>
                            <Input
                              id="text-title"
                              value={title}
                              onChange={(e) => setTitle(e.target.value)}
                              placeholder="Enter a title for this knowledge"
                            />
                          </div>
                          <div>
                            <Label htmlFor="text-content">Content</Label>
                            <Textarea
                              id="text-content"
                              value={content}
                              onChange={(e) => setContent(e.target.value)}
                              placeholder="Enter the knowledge content"
                              rows={6}
                            />
                          </div>
                          <Button
                            onClick={handleAddKnowledge}
                            disabled={!title || !content || createKnowledgeMutation.isPending}
                            className="w-full"
                          >
                            {createKnowledgeMutation.isPending && (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            )}
                            Add Text Knowledge
                          </Button>
                        </TabsContent>
                        
                        <TabsContent value="url" className="space-y-4">
                          <div>
                            <Label htmlFor="url-input">URL</Label>
                            <Input
                              id="url-input"
                              type="url"
                              value={url}
                              onChange={(e) => setUrl(e.target.value)}
                              placeholder="https://example.com"
                            />
                          </div>
                          <div>
                            <Label htmlFor="url-title">Title (optional)</Label>
                            <Input
                              id="url-title"
                              value={title}
                              onChange={(e) => setTitle(e.target.value)}
                              placeholder="Custom title for this URL"
                            />
                          </div>
                          <Button
                            onClick={handleAddKnowledge}
                            disabled={!url || createKnowledgeMutation.isPending}
                            className="w-full"
                          >
                            {createKnowledgeMutation.isPending && (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            )}
                            Add URL Knowledge
                          </Button>
                        </TabsContent>
                        
                        <TabsContent value="file" className="space-y-4">
                          <div className="border-2 border-dashed rounded-lg p-6 text-center">
                            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground mb-4">
                              Upload a file to extract knowledge from it
                            </p>
                            <input
                              ref={fileInputRef}
                              type="file"
                              onChange={handleFileUpload}
                              className="hidden"
                            />
                            <Button
                              onClick={() => fileInputRef.current?.click()}
                              disabled={uploadingFile}
                              variant="outline"
                            >
                              {uploadingFile ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Uploading...
                                </>
                              ) : (
                                <>
                                  <Upload className="h-4 w-4 mr-2" />
                                  Select File
                                </>
                              )}
                            </Button>
                          </div>
                        </TabsContent>
                      </Tabs>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
              <CardDescription>
                {activeTab === 'system' && 'System-wide knowledge available to all users'}
                {activeTab === 'team' && 'Team-specific knowledge shared with team members'}
                {activeTab === 'user' && 'Your personal knowledge base'}
              </CardDescription>
            </CardHeader>
            
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : knowledgeItems.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    No knowledge items in this scope yet
                  </p>
                  {canEditScope(activeTab) && (
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => setAddDialogOpen(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add First Item
                    </Button>
                  )}
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {knowledgeItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between p-4 rounded-lg border hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {item.type === 'file' && <FileText className="h-4 w-4 text-muted-foreground" />}
                            {item.type === 'url' && <Link2 className="h-4 w-4 text-muted-foreground" />}
                            {item.type === 'text' && <Type className="h-4 w-4 text-muted-foreground" />}
                            <h4 className="font-medium truncate">{item.title}</h4>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {item.content.substring(0, 200)}...
                          </p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            {item.fileName && (
                              <span className="flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                {item.fileName}
                              </span>
                            )}
                            {item.sourceUrl && (
                              <span className="flex items-center gap-1">
                                <Link2 className="h-3 w-3" />
                                {new URL(item.sourceUrl).hostname}
                              </span>
                            )}
                            <span>
                              {new Date(item.createdAt!).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        {canEditScope(activeTab) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setItemToDelete(item);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </Tabs>
      
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Knowledge Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{itemToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => itemToDelete && deleteKnowledgeMutation.mutate(itemToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

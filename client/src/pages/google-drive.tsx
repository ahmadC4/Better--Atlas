import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { ChevronLeft, Cloud, FileText, Download, Loader2, CloudOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { formatDistanceToNow } from 'date-fns';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: number;
  iconLink?: string;
  webViewLink?: string;
}

interface DriveFilesResponse {
  files: DriveFile[];
  nextPageToken?: string;
}

export default function GoogleDrivePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);

  const { data: driveStatus, isLoading: statusLoading } = useQuery<{ connected: boolean; needsAuth?: boolean; error?: string }>({
    queryKey: ['/api/integrations/google-drive/status'],
    retry: false,
  });

  const isConnected = driveStatus?.connected === true;

  const { data: filesData, isLoading: filesLoading, error: filesError } = useQuery<DriveFilesResponse>({
    queryKey: ['/api/google-drive/files'],
    enabled: isConnected,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'true') {
      toast({
        title: 'Connected',
        description: 'Google Drive has been connected successfully',
      });
      window.history.replaceState({}, '', '/google-drive');
      void (async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['/api/integrations/google-drive/status'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/google-drive/files'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/integrations/gmail/status'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/integrations/calendar/status'] })
        ]);
        await Promise.all([
          queryClient.refetchQueries({ queryKey: ['/api/integrations/google-drive/status'] }),
          queryClient.refetchQueries({ queryKey: ['/api/google-drive/files'] }),
          queryClient.refetchQueries({ queryKey: ['/api/integrations/gmail/status'] }),
          queryClient.refetchQueries({ queryKey: ['/api/integrations/calendar/status'] })
        ]);
      })();
    } else if (params.get('error')) {
      toast({
        title: 'Connection Failed',
        description: 'Failed to connect Google Drive. Please try again.',
        variant: 'destructive',
      });
      window.history.replaceState({}, '', '/google-drive');
    }
  }, [toast]);

  const { data: fileContent, isLoading: contentLoading } = useQuery<{ content: string; metadata: any }>({
    queryKey: ['/api/google-drive/file', selectedFile?.id],
    enabled: !!selectedFile && isConnected,
  });

  const handleConnectDrive = () => {
    window.location.href = '/auth/google';
  };

  const handleDisconnect = async () => {
    try {
      const response = await fetch('/api/google-drive/disconnect', {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to disconnect');
      }
      
      setSelectedFile(null);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/integrations/google-drive/status'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/google-drive/files'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/integrations/gmail/status'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/integrations/calendar/status'] })
      ]);

      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['/api/integrations/google-drive/status'] }),
        queryClient.refetchQueries({ queryKey: ['/api/google-drive/files'] }),
        queryClient.refetchQueries({ queryKey: ['/api/integrations/gmail/status'] }),
        queryClient.refetchQueries({ queryKey: ['/api/integrations/calendar/status'] })
      ]);

      toast({
        title: 'Disconnected',
        description: 'Google Drive has been disconnected',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to disconnect Google Drive',
        variant: 'destructive',
      });
    }
  };

  const handleFileClick = (file: DriveFile) => {
    setSelectedFile(file);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  const unauthorizedError = useMemo(() => {
    if (!filesError) return false;
    const error = filesError as any;
    if (error?.data?.needsAuth || error?.needsAuth) return true;
    if (error?.status === 401) return true;
    if (typeof error?.message === 'string' && error.message.includes('401')) return true;
    return false;
  }, [filesError]);

  const needsAuth = driveStatus ? (!driveStatus.connected || unauthorizedError) : true;

  return (
    <div className="flex flex-col h-full bg-background">
      <header className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0"
            onClick={() => navigate('/')}
            data-testid="button-back"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Google Drive</h1>
          </div>
        </div>

        {!needsAuth && isConnected && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            data-testid="button-disconnect"
          >
            Disconnect
          </Button>
        )}
      </header>

      <main className="flex-1 overflow-hidden p-6">
        {statusLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : needsAuth ? (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="rounded-full bg-muted p-6">
              <CloudOff className="h-12 w-12 text-muted-foreground" />
            </div>
            <div className="text-center max-w-md">
              <h2 className="text-2xl font-semibold mb-2">Connect Google Drive</h2>
              <p className="text-muted-foreground mb-6">
                Connect your Google Drive to access and analyze your documents, spreadsheets, and files directly in Atlas AI.
              </p>
              <Button
                onClick={handleConnectDrive}
                className="gap-2"
                data-testid="button-connect-drive"
              >
                <Cloud className="h-4 w-4" />
                Connect Google Drive
              </Button>
            </div>
          </div>
        ) : filesLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filesError ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <CloudOff className="h-10 w-10 text-muted-foreground" />
            <div className="text-center space-y-2">
              <h2 className="text-lg font-semibold">Unable to load Drive files</h2>
              <p className="text-sm text-muted-foreground">
                {driveStatus?.error || 'Please try reconnecting your Google Drive account.'}
              </p>
            </div>
            <Button onClick={handleConnectDrive} className="gap-2" data-testid="button-retry-connect">
              <Cloud className="h-4 w-4" />
              Reconnect Google Drive
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle>Your Files</CardTitle>
                <CardDescription>Select a file to view its contents</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto">
                <div className="space-y-2">
                  {filesData?.files?.map((file) => (
                    <div
                      key={file.id}
                      onClick={() => handleFileClick(file)}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors hover-elevate ${
                        selectedFile?.id === file.id ? 'bg-accent' : ''
                      }`}
                      data-testid={`file-item-${file.id}`}
                    >
                      <div className="flex items-start gap-3">
                        {file.iconLink ? (
                          <img src={file.iconLink} alt="" className="w-5 h-5 mt-0.5" />
                        ) : (
                          <FileText className="w-5 h-5 mt-0.5 text-muted-foreground" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate" data-testid={`file-name-${file.id}`}>
                            {file.name}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {formatFileSize(file.size)}
                            {file.modifiedTime && (
                              <> · Modified {formatDistanceToNow(new Date(file.modifiedTime), { addSuffix: true })}</>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle>File Content</CardTitle>
                <CardDescription>
                  {selectedFile ? selectedFile.name : 'Select a file to view'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto">
                {!selectedFile ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <p>No file selected</p>
                  </div>
                ) : contentLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : fileContent ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        {fileContent.metadata.mimeType}
                      </div>
                      {selectedFile.webViewLink && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(selectedFile.webViewLink, '_blank')}
                          className="gap-2"
                          data-testid="button-open-in-drive"
                        >
                          <Download className="h-3 w-3" />
                          Open in Drive
                        </Button>
                      )}
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <pre className="whitespace-pre-wrap text-sm font-mono" data-testid="file-content">
                        {fileContent.content}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <p>Failed to load file content</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

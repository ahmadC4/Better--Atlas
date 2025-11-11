import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { FileText, Download, Lock, Sparkles, File, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { Template, OutputTemplate } from '@shared/schema';

interface TemplatesResponse {
  templates: Template[];
  planRestricted?: boolean;
  upsellMessage?: string;
}

interface OutputTemplatesResponse {
  templates: OutputTemplate[];
  planRestricted?: boolean;
  upsellMessage?: string;
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

const OUTPUT_TEMPLATE_CATEGORY_LABELS: Record<string, string> = {
  how_to: 'How-To',
  executive_brief: 'Executive Brief',
  json_report: 'JSON',
};

const OUTPUT_TEMPLATE_FORMAT_LABELS: Record<string, string> = {
  markdown: 'Markdown',
  json: 'JSON',
};

export default function TemplatesPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('documents');

  // Fetch document templates
  const { data: templatesData, isLoading: isLoadingTemplates } = useQuery<TemplatesResponse>({
    queryKey: ['/api/templates'],
    staleTime: 60000,
  });

  // Fetch output templates
  const { data: outputTemplatesData, isLoading: isLoadingOutputTemplates } = useQuery<OutputTemplatesResponse>({
    queryKey: ['/api/output-templates'],
    staleTime: 60000,
  });

  const handleDownloadTemplate = async (template: Template) => {
    try {
      const response = await fetch(`/api/templates/${template.id}/file`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to download template');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = template.fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Template Downloaded',
        description: `${template.name} has been downloaded successfully.`,
      });
    } catch (error) {
      console.error('Download failed:', error);
      toast({
        title: 'Download Failed',
        description: 'Unable to download the template. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleUpgrade = () => {
    navigate('/pricing');
  };

  const handleBack = () => {
    navigate('/');
  };

  const isRestricted = templatesData?.planRestricted || outputTemplatesData?.planRestricted;
  const upsellMessage = templatesData?.upsellMessage || outputTemplatesData?.upsellMessage;

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-6xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              data-testid="button-back"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Templates Library</h1>
              <p className="text-muted-foreground mt-1">
                Access document templates and structured output formats
              </p>
            </div>
          </div>
        </div>

        {/* Plan Restriction Alert */}
        {isRestricted && upsellMessage && (
          <Alert className="mb-6 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
            <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-amber-900 dark:text-amber-100">
              Templates Restricted
            </AlertTitle>
            <AlertDescription className="text-amber-800 dark:text-amber-200">
              <div className="mt-2 space-y-3">
                <p>{upsellMessage}</p>
                <Button
                  onClick={handleUpgrade}
                  className="mt-2"
                  variant="default"
                  data-testid="button-upgrade"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Upgrade Plan
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Tabs for different template types */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="documents" data-testid="tab-documents">
              <FileText className="mr-2 h-4 w-4" />
              Document Templates
            </TabsTrigger>
            <TabsTrigger value="output" data-testid="tab-output">
              <File className="mr-2 h-4 w-4" />
              Output Templates
            </TabsTrigger>
          </TabsList>

          {/* Document Templates Tab */}
          <TabsContent value="documents" className="mt-6">
            {isLoadingTemplates ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-full mt-2" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-10 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : templatesData?.templates && templatesData.templates.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templatesData.templates.map((template) => (
                  <Card key={template.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{template.name}</CardTitle>
                          <CardDescription className="mt-2">
                            {template.description || 'No description available'}
                          </CardDescription>
                        </div>
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">File size:</span>
                          <span>{formatFileSize(template.fileSize)}</span>
                        </div>
                        <Button
                          className="w-full"
                          onClick={() => handleDownloadTemplate(template)}
                          data-testid={`button-download-${template.id}`}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Download Template
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-12">
                <div className="text-center space-y-4">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                  <div>
                    <p className="text-lg font-medium">No Document Templates Available</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {isRestricted 
                        ? 'Upgrade your plan to access document templates'
                        : 'No document templates have been added yet'}
                    </p>
                  </div>
                  {isRestricted && (
                    <Button onClick={handleUpgrade} data-testid="button-upgrade-empty">
                      <Sparkles className="mr-2 h-4 w-4" />
                      Upgrade Plan
                    </Button>
                  )}
                </div>
              </Card>
            )}
          </TabsContent>

          {/* Output Templates Tab */}
          <TabsContent value="output" className="mt-6">
            {isLoadingOutputTemplates ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[...Array(4)].map((_, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-full mt-2" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-20 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : outputTemplatesData?.templates && outputTemplatesData.templates.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {outputTemplatesData.templates.map((template) => (
                  <Card key={template.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{template.name}</CardTitle>
                          <CardDescription className="mt-2">
                            {template.description || 'No description available'}
                          </CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="secondary">
                            {OUTPUT_TEMPLATE_CATEGORY_LABELS[template.category] || template.category}
                          </Badge>
                          <Badge variant="outline">
                            {OUTPUT_TEMPLATE_FORMAT_LABELS[template.format] || template.format}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {template.instructions && (
                          <div className="text-sm">
                            <p className="font-medium mb-1">Instructions:</p>
                            <p className="text-muted-foreground">{template.instructions}</p>
                          </div>
                        )}
                        {template.requiredSections && template.requiredSections.length > 0 && (
                          <div className="text-sm">
                            <p className="font-medium mb-2">Required Sections:</p>
                            <div className="space-y-1">
                              {template.requiredSections.map((section) => (
                                <div key={section.key} className="flex items-start gap-2">
                                  <Badge variant="outline" className="text-xs">
                                    {section.key}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {section.title}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-12">
                <div className="text-center space-y-4">
                  <File className="mx-auto h-12 w-12 text-muted-foreground" />
                  <div>
                    <p className="text-lg font-medium">No Output Templates Available</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {isRestricted 
                        ? 'Upgrade your plan to access output templates'
                        : 'No output templates have been configured yet'}
                    </p>
                  </div>
                  {isRestricted && (
                    <Button onClick={handleUpgrade} data-testid="button-upgrade-empty-output">
                      <Sparkles className="mr-2 h-4 w-4" />
                      Upgrade Plan
                    </Button>
                  )}
                </div>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
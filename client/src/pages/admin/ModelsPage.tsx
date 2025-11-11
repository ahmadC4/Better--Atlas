import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Edit2, Trash2, DollarSign, Eye, EyeOff, Code, Search, Mic, Image, MessageSquare, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAdminLayout } from '@/components/AdminLayout';
import { getAdminRouteById } from '@shared/adminRoutes';
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Model, ModelCapabilities, ModelPricing } from "@shared/schema";

interface ModelWithDates {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  description: string | null;
  capabilities: ModelCapabilities;
  basePricing: ModelPricing;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const providers = ["openai", "anthropic", "groq", "perplexity"];

const capabilityIcons = {
  code: { icon: Code, label: "Code" },
  web: { icon: Search, label: "Web Search" },
  vision: { icon: Image, label: "Vision" },
  audio: { icon: Mic, label: "Audio" },
  streaming: { icon: MessageSquare, label: "Streaming" },
};

export default function ModelsPage() {
  const { setHeader, resetHeader } = useAdminLayout();
  const routeMeta = getAdminRouteById('models-catalog');
  useEffect(() => {
    setHeader({ title: routeMeta.pageHeader?.title ?? routeMeta.label, description: routeMeta.pageHeader?.description });
    return () => resetHeader();
  }, [setHeader, resetHeader]);
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelWithDates | null>(null);
  const [formData, setFormData] = useState({
    provider: "openai",
    modelId: "",
    displayName: "",
    description: "",
    capabilities: {
      code: false,
      web: false,
      vision: false,
      audio: false,
      streaming: true,
    } as ModelCapabilities,
    basePricing: {
      input_per_1k_usd: 0,
      output_per_1k_usd: 0,
    } as ModelPricing,
    contextWindow: 8192,
    maxOutputTokens: 4096,
    isActive: true,
  });

  const { data: modelsData, isLoading } = useQuery({
    queryKey: ["/api/admin/models"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/admin/models", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/models"] });
      toast({ title: "Model created successfully" });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to create model",
        description: error.message || "An error occurred",
        variant: "destructive" 
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      return apiRequest("PATCH", `/api/admin/models/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/models"] });
      toast({ title: "Model updated successfully" });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update model",
        description: error.message || "An error occurred",
        variant: "destructive" 
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/models/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/models"] });
      toast({ title: "Model deleted successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to delete model",
        description: error.message || "An error occurred",
        variant: "destructive" 
      });
    },
  });

  const resetForm = () => {
    setEditingModel(null);
    setFormData({
      provider: "openai",
      modelId: "",
      displayName: "",
      description: "",
      capabilities: {
        code: false,
        web: false,
        vision: false,
        audio: false,
        streaming: true,
      },
      basePricing: {
        input_per_1k_usd: 0,
        output_per_1k_usd: 0,
      },
      contextWindow: 8192,
      maxOutputTokens: 4096,
      isActive: true,
    });
  };

  const openDialog = (model?: ModelWithDates) => {
    if (model) {
      setEditingModel(model);
      setFormData({
        provider: model.provider,
        modelId: model.modelId,
        displayName: model.displayName,
        description: model.description || "",
        capabilities: model.capabilities,
        basePricing: model.basePricing,
        contextWindow: model.contextWindow || 8192,
        maxOutputTokens: model.maxOutputTokens || 4096,
        isActive: model.isActive,
      });
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingModel) {
      updateMutation.mutate({ id: editingModel.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this model?")) {
      deleteMutation.mutate(id);
    }
  };

  const models = (modelsData as { models?: ModelWithDates[] })?.models || [];

  // Group models by provider
  const modelsByProvider = models.reduce((acc: Record<string, ModelWithDates[]>, model: ModelWithDates) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  }, {} as Record<string, ModelWithDates[]>);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Model Catalog</h2>
          <p className="text-muted-foreground">Manage AI models and their configurations</p>
        </div>
        <Button onClick={() => openDialog()} data-testid="button-add-model">
          <Plus className="w-4 h-4 mr-2" />
          Add Model
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading models...</div>
      ) : models.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground mb-4">No models configured yet.</p>
            <Button onClick={() => openDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Model
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {Object.entries(modelsByProvider).map(([provider, providerModels]) => (
            <div key={provider}>
              <h3 className="text-lg font-semibold capitalize mb-4">{provider}</h3>
              <div className="grid gap-4">
                {(providerModels as ModelWithDates[]).map((model: ModelWithDates) => (
                  <Card key={model.id} data-testid={`card-model-${model.id}`}>
                    <CardHeader className="pb-4">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                            {model.displayName}
                            <Badge variant={model.isActive ? "default" : "secondary"}>
                              {model.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </CardTitle>
                          <p className="text-sm text-muted-foreground">{model.modelId}</p>
                          {model.description && (
                            <p className="text-sm text-muted-foreground mt-2">{model.description}</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => openDialog(model)}
                            data-testid={`button-edit-${model.id}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleDelete(model.id)}
                            data-testid={`button-delete-${model.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {/* Capabilities */}
                        <div>
                          <Label className="text-sm mb-2 block">Capabilities</Label>
                          <div className="flex gap-2 flex-wrap">
                            {Object.entries(capabilityIcons).map(([key, { icon: Icon, label }]) => (
                              <Badge
                                key={key}
                                variant={model.capabilities[key as keyof ModelCapabilities] ? "default" : "outline"}
                                className="flex items-center gap-1"
                              >
                                <Icon className="h-3 w-3" />
                                {label}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        {/* Pricing and Context */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <Label className="text-xs text-muted-foreground">Input Price</Label>
                            <div className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              <span>${model.basePricing.input_per_1k_usd.toFixed(4)}/1K</span>
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Output Price</Label>
                            <div className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              <span>${model.basePricing.output_per_1k_usd.toFixed(4)}/1K</span>
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Context Window</Label>
                            <span>{model.contextWindow?.toLocaleString() || "N/A"} tokens</span>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Max Output</Label>
                            <span>{model.maxOutputTokens?.toLocaleString() || "N/A"} tokens</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingModel ? "Edit Model" : "Add New Model"}</DialogTitle>
            <DialogDescription>
              Configure the AI model settings and capabilities.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="provider">Provider</Label>
                <Select
                  value={formData.provider}
                  onValueChange={(value) => setFormData({ ...formData, provider: value })}
                >
                  <SelectTrigger id="provider" data-testid="select-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="modelId">Model ID</Label>
                <Input
                  id="modelId"
                  value={formData.modelId}
                  onChange={(e) => setFormData({ ...formData, modelId: e.target.value })}
                  placeholder="e.g., gpt-4-turbo"
                  required
                  data-testid="input-model-id"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                placeholder="e.g., GPT-4 Turbo"
                required
                data-testid="input-display-name"
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the model's capabilities"
                rows={3}
                data-testid="textarea-description"
              />
            </div>

            <Separator />

            <div>
              <Label className="mb-3 block">Capabilities</Label>
              <div className="space-y-3">
                {Object.entries(capabilityIcons).map(([key, { icon: Icon, label }]) => (
                  <div key={key} className="flex items-center space-x-2">
                    <Checkbox
                      id={`capability-${key}`}
                      checked={formData.capabilities[key as keyof ModelCapabilities] as boolean}
                      onCheckedChange={(checked) =>
                        setFormData({
                          ...formData,
                          capabilities: {
                            ...formData.capabilities,
                            [key]: checked,
                          },
                        })
                      }
                      data-testid={`checkbox-capability-${key}`}
                    />
                    <Label
                      htmlFor={`capability-${key}`}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="inputPrice">Input Price (USD per 1K tokens)</Label>
                <Input
                  id="inputPrice"
                  type="number"
                  step="0.0001"
                  value={formData.basePricing.input_per_1k_usd}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      basePricing: {
                        ...formData.basePricing,
                        input_per_1k_usd: parseFloat(e.target.value) || 0,
                      },
                    })
                  }
                  required
                  data-testid="input-input-price"
                />
              </div>

              <div>
                <Label htmlFor="outputPrice">Output Price (USD per 1K tokens)</Label>
                <Input
                  id="outputPrice"
                  type="number"
                  step="0.0001"
                  value={formData.basePricing.output_per_1k_usd}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      basePricing: {
                        ...formData.basePricing,
                        output_per_1k_usd: parseFloat(e.target.value) || 0,
                      },
                    })
                  }
                  required
                  data-testid="input-output-price"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contextWindow">Context Window (tokens)</Label>
                <Input
                  id="contextWindow"
                  type="number"
                  value={formData.contextWindow}
                  onChange={(e) =>
                    setFormData({ ...formData, contextWindow: parseInt(e.target.value) || 8192 })
                  }
                  required
                  data-testid="input-context-window"
                />
              </div>

              <div>
                <Label htmlFor="maxOutputTokens">Max Output Tokens</Label>
                <Input
                  id="maxOutputTokens"
                  type="number"
                  value={formData.maxOutputTokens ?? ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      maxOutputTokens: e.target.value ? parseInt(e.target.value) : 4096,
                    })
                  }
                  placeholder="Optional"
                  data-testid="input-max-output"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                data-testid="switch-is-active"
              />
              <Label htmlFor="isActive">Model is active</Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-submit-model"
              >
                {editingModel ? "Update Model" : "Create Model"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Pencil, Save, X, DollarSign } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { usePermissions } from '@/hooks/use-permissions';
import { Redirect } from 'wouter';
import { PERMISSIONS } from '@shared/constants';

interface ProviderPricing {
  id: string;
  provider: string;
  model: string;
  inputUsdPer1k: string;
  outputUsdPer1k: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export default function PricingPage() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<ProviderPricing>>({});

  // Super Admin only
  if (!hasPermission(PERMISSIONS.API_ACCESS_VIEW)) {
    return <Redirect to="/admin" />;
  }

  const { data: pricing = [], isLoading } = useQuery<ProviderPricing[]>({
    queryKey: ['/api/admin/pricing'],
  });

  const updatePricingMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<ProviderPricing> }) => {
      return apiRequest('PATCH', `/api/admin/pricing/${data.id}`, data.updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/pricing'] });
      setEditingId(null);
      setEditValues({});
      toast({
        title: 'Pricing Updated',
        description: 'Model pricing has been successfully updated.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Update Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleEdit = (pricing: ProviderPricing) => {
    setEditingId(pricing.id);
    setEditValues({
      inputUsdPer1k: pricing.inputUsdPer1k,
      outputUsdPer1k: pricing.outputUsdPer1k,
      enabled: pricing.enabled,
    });
  };

  const handleSave = (id: string) => {
    updatePricingMutation.mutate({ id, updates: editValues });
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditValues({});
  };

  const formatPrice = (price: string) => {
    const num = parseFloat(price);
    return num >= 0.01 ? `$${num.toFixed(3)}` : `$${num.toFixed(6)}`;
  };

  return (
    <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Model Pricing</h1>
          <p className="text-muted-foreground mt-2">
            Manage pricing for AI models to calculate usage costs accurately
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <div>
                <CardTitle>Groq Model Pricing</CardTitle>
                <CardDescription>
                  Configure input and output token costs per 1,000 tokens
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead>Input ($/1K tokens)</TableHead>
                    <TableHead>Output ($/1K tokens)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pricing.map((item) => {
                    const isEditing = editingId === item.id;
                    
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          <div>
                            <div className="font-mono text-sm">{item.model}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.provider}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Input
                              type="number"
                              step="0.00001"
                              value={editValues.inputUsdPer1k}
                              onChange={(e) =>
                                setEditValues({
                                  ...editValues,
                                  inputUsdPer1k: e.target.value,
                                })
                              }
                              className="w-32"
                              data-testid={`input-pricing-input-${item.id}`}
                            />
                          ) : (
                            <span className="font-mono">
                              {formatPrice(item.inputUsdPer1k)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Input
                              type="number"
                              step="0.00001"
                              value={editValues.outputUsdPer1k}
                              onChange={(e) =>
                                setEditValues({
                                  ...editValues,
                                  outputUsdPer1k: e.target.value,
                                })
                              }
                              className="w-32"
                              data-testid={`input-pricing-output-${item.id}`}
                            />
                          ) : (
                            <span className="font-mono">
                              {formatPrice(item.outputUsdPer1k)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Switch
                              checked={editValues.enabled ?? item.enabled}
                              onCheckedChange={(checked) =>
                                setEditValues({ ...editValues, enabled: checked })
                              }
                              data-testid={`switch-pricing-enabled-${item.id}`}
                            />
                          ) : (
                            <Badge variant={item.enabled ? 'default' : 'secondary'}>
                              {item.enabled ? 'Enabled' : 'Disabled'}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isEditing ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleSave(item.id)}
                                disabled={updatePricingMutation.isPending}
                                data-testid={`button-save-pricing-${item.id}`}
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={handleCancel}
                                disabled={updatePricingMutation.isPending}
                                data-testid={`button-cancel-pricing-${item.id}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(item)}
                              data-testid={`button-edit-pricing-${item.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="border-muted">
          <CardHeader>
            <CardTitle className="text-sm">Pricing Information</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>• Prices are per 1,000 tokens (input and output separately)</p>
            <p>• Analytics use these prices to calculate API usage costs</p>
            <p>• Disabled models will still track analytics but show $0 cost</p>
            <p>• Changes take effect immediately for new API requests</p>
          </CardContent>
        </Card>
      </div>
  );
}

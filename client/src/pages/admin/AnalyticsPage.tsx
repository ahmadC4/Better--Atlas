import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiRequest } from '@/lib/queryClient';
import { formatPlanLabel } from './utils';
import { format } from 'date-fns';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Ban, CheckCircle, 
  Activity, Users, Shield, Calendar, AlertCircle
} from 'lucide-react';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

type DateRange = '7d' | '30d' | '90d' | 'all';

interface FeatureStats {
  totalEvents: number;
  blockedEvents: number;
  allowedEvents: number;
  byFeature: Record<string, { allowed: number; blocked: number }>;
  topBlockedFeatures: Array<{ feature: string; count: number; reason: string }>;
}

interface PlanAuditSnapshot {
  planId: string | null;
  planSlug: string | null;
  planLabel: string | null;
  planTier?: string | null;
  isProTier?: boolean;
  [key: string]: unknown;
}

interface PlanAuditEntry {
  id: string;
  timestamp: string;
  actor: string | null;
  targetType: string;
  targetId: string;
  targetName?: string;
  before: PlanAuditSnapshot;
  after: PlanAuditSnapshot;
  changeNotes?: string;
}

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [selectedFeature, setSelectedFeature] = useState<string>('all');
  
  // Calculate date range
  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    let start = new Date();
    
    switch (dateRange) {
      case '7d':
        start.setDate(end.getDate() - 7);
        break;
      case '30d':
        start.setDate(end.getDate() - 30);
        break;
      case '90d':
        start.setDate(end.getDate() - 90);
        break;
      case 'all':
        start = new Date('2024-01-01');
        break;
    }
    
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }, [dateRange]);

  // Fetch feature usage statistics
  const { data: featureStats, isLoading: loadingStats } = useQuery({
    queryKey: ['/api/admin/analytics/feature-usage', { startDate, endDate, feature: selectedFeature }],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate,
        endDate,
        ...(selectedFeature !== 'all' && { feature: selectedFeature }),
      });
      const response = await apiRequest('GET', `/api/admin/analytics/feature-usage?${params}`);
      return (await response.json()) as FeatureStats;
    },
  });

  // Fetch plan change audit trail
  const { data: auditLogs, isLoading: loadingAudit } = useQuery({
    queryKey: ['/api/admin/analytics/plan-audit', { startDate, endDate }],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate, endDate });
      const response = await apiRequest('GET', `/api/admin/analytics/plan-audit?${params}`);
      return (await response.json()) as PlanAuditEntry[];
    },
  });

  // Calculate success rate
  const successRate = featureStats 
    ? featureStats.totalEvents > 0 
      ? ((featureStats.allowedEvents / featureStats.totalEvents) * 100).toFixed(1)
      : '0'
    : '0';

  // Prepare chart data
  const featureChartData = useMemo(() => {
    if (!featureStats?.byFeature) return [];
    
    return Object.entries(featureStats.byFeature).map(([feature, data]) => ({
      feature: feature.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      allowed: data.allowed,
      blocked: data.blocked,
      total: data.allowed + data.blocked,
    }));
  }, [featureStats]);

  const blockReasonData = useMemo(() => {
    if (!featureStats?.topBlockedFeatures) return [];
    
    const reasonCounts: Record<string, number> = {};
    featureStats.topBlockedFeatures.forEach(item => {
      reasonCounts[item.reason] = (reasonCounts[item.reason] || 0) + item.count;
    });
    
    return Object.entries(reasonCounts).map(([reason, count]) => ({
      name: reason,
      value: count,
    }));
  }, [featureStats]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Analytics & Insights</h2>
          <p className="text-muted-foreground">Track feature usage and plan changes</p>
        </div>
        
        <div className="flex gap-2 items-center">
          <Label htmlFor="date-range">Period:</Label>
          <Select value={dateRange} onValueChange={(value: DateRange) => setDateRange(value)}>
            <SelectTrigger id="date-range" className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="usage" className="space-y-4">
        <TabsList>
          <TabsTrigger value="usage" className="gap-2">
            <Activity className="h-4 w-4" />
            Feature Usage
          </TabsTrigger>
          <TabsTrigger value="blocks" className="gap-2">
            <Ban className="h-4 w-4" />
            Blocked Features
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <Shield className="h-4 w-4" />
            Plan Changes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="usage" className="space-y-4">
          {/* Key Metrics */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Events</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loadingStats ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold">{featureStats?.totalEvents || 0}</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loadingStats ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="text-2xl font-bold">{successRate}%</div>
                    {Number(successRate) > 80 ? (
                      <TrendingUp className="h-4 w-4 text-green-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Allowed</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                {loadingStats ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold text-green-600">
                    {featureStats?.allowedEvents || 0}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Blocked</CardTitle>
                <Ban className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                {loadingStats ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold text-red-600">
                    {featureStats?.blockedEvents || 0}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Feature Usage Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Feature Usage by Type</CardTitle>
              <CardDescription>Compare allowed vs blocked requests per feature</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <Skeleton className="h-[300px]" />
              ) : featureChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={featureChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="feature" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="allowed" fill="#22c55e" name="Allowed" />
                    <Bar dataKey="blocked" fill="#ef4444" name="Blocked" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  No feature usage data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="blocks" className="space-y-4">
          {/* Block Reasons Pie Chart */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Block Reasons</CardTitle>
                <CardDescription>Why features are being blocked</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingStats ? (
                  <Skeleton className="h-[300px]" />
                ) : blockReasonData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={blockReasonData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {blockReasonData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    No blocked features
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Blocked Features */}
            <Card>
              <CardHeader>
                <CardTitle>Most Blocked Features</CardTitle>
                <CardDescription>Features that drive upgrade decisions</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  {loadingStats ? (
                    <div className="space-y-2">
                      {[1, 2, 3, 4, 5].map(i => (
                        <Skeleton key={i} className="h-12" />
                      ))}
                    </div>
                  ) : featureStats?.topBlockedFeatures && featureStats.topBlockedFeatures.length > 0 ? (
                    <div className="space-y-2">
                      {featureStats.topBlockedFeatures.map((item, index) => (
                        <div key={index} className="flex items-center justify-between p-2 rounded-lg bg-secondary/50">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-orange-500" />
                            <div>
                              <div className="font-medium capitalize">
                                {item.feature.replace('_', ' ')}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {item.reason}
                              </div>
                            </div>
                          </div>
                          <Badge variant="destructive">{item.count}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      No blocked features found
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Upgrade Opportunities Alert */}
          {featureStats?.topBlockedFeatures && featureStats.topBlockedFeatures.length > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Upgrade Opportunities:</strong> {featureStats.topBlockedFeatures[0].count} users 
                tried to use "{featureStats.topBlockedFeatures[0].feature.replace('_', ' ')}" but were blocked. 
                Consider targeted upgrade campaigns for these users.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Plan Change Audit Trail</CardTitle>
              <CardDescription>Track all plan modifications and user upgrades</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingAudit ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Skeleton key={i} className="h-16" />
                  ))}
                </div>
              ) : auditLogs && auditLogs.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Changes</TableHead>
                      <TableHead>Actor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.map((log) => {
                      const beforeLabel = formatPlanLabel({
                        label: log.before.planLabel ?? null,
                        slug: log.before.planSlug ?? null,
                      });
                      const afterLabel = formatPlanLabel({
                        label: log.after.planLabel ?? null,
                        slug: log.after.planSlug ?? null,
                      });
                      const beforeSlug = log.before.planSlug ?? 'unknown';
                      const afterSlug = log.after.planSlug ?? 'unknown';
                      const planChanged = beforeSlug !== afterSlug || beforeLabel !== afterLabel;

                      return (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-sm">
                            {format(new Date(log.timestamp), 'MMM dd, HH:mm')}
                          </TableCell>
                          <TableCell>
                            <Badge variant={log.targetType === 'user' ? 'default' : 'secondary'}>
                              {log.targetType}
                            </Badge>
                          </TableCell>
                          <TableCell>{log.targetName || log.targetId}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {log.changeNotes || 'Plan modified'}
                            </div>
                            {planChanged && (
                              <div className="text-xs text-muted-foreground">
                                {beforeLabel} ({beforeSlug}) → {afterLabel} ({afterSlug})
                              </div>
                            )}
                            {'effective' in log.after && (
                              <div className="text-xs text-muted-foreground">
                                Effective: {String(log.after.effective)} · Prorate: {String(log.after.prorate)}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {log.actor || 'System'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                  No plan changes in the selected period
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
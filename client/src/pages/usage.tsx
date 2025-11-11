import { useMemo, useState, type ReactNode } from 'react';
import { useLastAreaPreference } from '@/hooks/useLastAreaPreference';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Activity, ArrowLeft, BarChart3, Calendar, DollarSign, Zap, RotateCcw, Loader2, Download } from 'lucide-react';
import { format, startOfDay, subDays } from 'date-fns';
import type { UsageMetric } from '@shared/schema';
import type { UsageSummary } from '@shared/usage';
import { EMPTY_USAGE_SUMMARY } from '@shared/usage';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TooltipProps } from 'recharts';

interface DateFilterParams {
  dateFrom?: string;
  dateTo?: string;
}

function buildQueryString(params: DateFilterParams): string {
  const search = new URLSearchParams();
  if (params.dateFrom) search.set('dateFrom', params.dateFrom);
  if (params.dateTo) search.set('dateTo', params.dateTo);
  const query = search.toString();
  return query ? `?${query}` : '';
}

async function fetchUsageMetrics<T>(path: string, params: DateFilterParams): Promise<T> {
  const res = await fetch(`${path}${buildQueryString(params)}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const numberFormatter = new Intl.NumberFormat('en-US');

const percentageFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

type RangeOption = '7d' | '30d' | 'all';

export default function UsagePage() {
  useLastAreaPreference('user');
  const [dateRange, setDateRange] = useState<RangeOption>('7d');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const dateFilters = useMemo<DateFilterParams>(() => {
    if (dateRange === 'all') {
      return {};
    }

    const days = dateRange === '7d' ? 7 : 30;
    return {
      dateFrom: startOfDay(subDays(new Date(), days)).toISOString(),
      dateTo: new Date().toISOString(),
    };
  }, [dateRange]);

  const summaryQueryKey = useMemo(
    () => ['usageSummary', dateFilters.dateFrom ?? 'all', dateFilters.dateTo ?? 'now'] as const,
    [dateFilters.dateFrom, dateFilters.dateTo],
  );

  const metricsQueryKey = useMemo(
    () => ['usageMetrics', dateFilters.dateFrom ?? 'all', dateFilters.dateTo ?? 'now'] as const,
    [dateFilters.dateFrom, dateFilters.dateTo],
  );

  const { data: summaryData, isLoading: summaryLoading } = useQuery<UsageSummary>({
    queryKey: summaryQueryKey,
    queryFn: () => fetchUsageMetrics<UsageSummary>('/api/usage/user/summary', dateFilters),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });

  const {
    data: metrics = [],
    isLoading: metricsLoading,
  } = useQuery<UsageMetric[]>({
    queryKey: metricsQueryKey,
    queryFn: () => fetchUsageMetrics<UsageMetric[]>('/api/usage/user', dateFilters),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: summaryQueryKey }),
        queryClient.invalidateQueries({ queryKey: metricsQueryKey }),
      ]);
      await Promise.all([
        queryClient.refetchQueries({ queryKey: summaryQueryKey }),
        queryClient.refetchQueries({ queryKey: metricsQueryKey }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleExportCSV = () => {
    const params = new URLSearchParams();
    if (dateFilters.dateFrom) params.set('dateFrom', dateFilters.dateFrom);
    if (dateFilters.dateTo) params.set('dateTo', dateFilters.dateTo);
    // Future: add provider filter when UI supports it
    // if (selectedProvider) params.set('provider', selectedProvider);
    
    const url = `/api/usage/export/csv?${params.toString()}`;
    // Use direct download instead of window.open for better UX
    const link = document.createElement('a');
    link.href = url;
    link.download = `usage-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const summary = summaryData ?? EMPTY_USAGE_SUMMARY;
  const hasUsage = summary.totals.messages > 0;
  const topModel = summary.models[0];

  const chartData = useMemo(
    () =>
      (summaryData?.daily ?? []).map((entry) => ({
        date: entry.date,
        dateLabel: format(new Date(entry.date), 'MMM dd'),
        tokens: entry.totalTokens,
        cost: entry.cost,
        messages: entry.messages,
      })),
    [summaryData],
  );

  const rangeLabel =
    dateRange === 'all'
      ? 'All usage'
      : `Last ${dateRange === '7d' ? '7 days' : '30 days'}`;

  const renderRangeButton = (range: RangeOption, label: string, testId: string) => (
    <Button
      key={range}
      variant={dateRange === range ? 'default' : 'outline'}
      size="sm"
      onClick={() => setDateRange(range)}
      data-testid={testId}
    >
      {label}
    </Button>
  );

  const StatValue = ({ children }: { children: ReactNode }) => (
    <div className="text-2xl font-semibold tracking-tight">{children}</div>
  );

  const ChartTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (!active || !payload || payload.length === 0) return null;
    const tokens = payload.find((item) => item.dataKey === 'tokens')?.value ?? 0;
    const cost = payload.find((item) => item.dataKey === 'cost')?.value ?? 0;
    const dataPoint = payload[0]?.payload as { messages?: number } | undefined;
    const messages = dataPoint?.messages ?? 0;

    return (
      <div className="rounded-md border bg-background p-3 shadow-sm">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{numberFormatter.format(tokens)} tokens</p>
        <p className="text-sm">{currencyFormatter.format(cost)} cost</p>
        <p className="text-xs text-muted-foreground">{numberFormatter.format(messages)} messages</p>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-2" data-testid="button-back-to-chat">
                <ArrowLeft className="h-4 w-4" />
                Back to Chat
              </Button>
            </Link>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold" data-testid="heading-usage-dashboard">
                Usage Dashboard
              </h1>
              <p className="text-sm text-muted-foreground">
                Track how many tokens you consume, what they cost, and which models drive your spend.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {renderRangeButton('7d', 'Last 7 Days', 'button-range-7d')}
              {renderRangeButton('30d', 'Last 30 Days', 'button-range-30d')}
              {renderRangeButton('all', 'All Time', 'button-range-all')}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="gap-2"
                data-testid="button-usage-refresh"
              >
                {isRefreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                disabled={!hasUsage}
                className="gap-2"
                data-testid="button-export-csv"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export CSV</span>
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-2">
              {summaryLoading ? (
                <Skeleton className="h-7 w-20" />
              ) : (
                <StatValue data-testid="stat-total-tokens">
                  {numberFormatter.format(summary.totals.totalTokens)}
                </StatValue>
              )}
              <p className="text-xs text-muted-foreground">
                {summaryLoading ? (
                  <Skeleton className="h-3 w-32" />
                ) : (
                  <>
                    {numberFormatter.format(summary.totals.promptTokens)} input ·{' '}
                    {numberFormatter.format(summary.totals.completionTokens)} output
                  </>
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-2">
              {summaryLoading ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                <StatValue data-testid="stat-total-cost">
                  {currencyFormatter.format(summary.totals.totalCost)}
                </StatValue>
              )}
              <p className="text-xs text-muted-foreground">
                {summaryLoading ? (
                  <Skeleton className="h-3 w-28" />
                ) : (
                  <>Avg per message {currencyFormatter.format(summary.totals.avgCostPerMessage)}</>
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Messages</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-2">
              {summaryLoading ? (
                <Skeleton className="h-7 w-12" />
              ) : (
                <StatValue data-testid="stat-total-messages">
                  {numberFormatter.format(summary.totals.messages)}
                </StatValue>
              )}
              <p className="text-xs text-muted-foreground">
                {summaryLoading ? (
                  <Skeleton className="h-3 w-28" />
                ) : (
                  <>Avg tokens/message {numberFormatter.format(Math.round(summary.totals.avgTokensPerMessage))}</>
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Top Model</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-2">
              {summaryLoading ? (
                <Skeleton className="h-7 w-24" />
              ) : hasUsage && topModel ? (
                <>
                  <div className="flex items-center gap-2" data-testid={`stat-top-model-${topModel.model}`}>
                    <Badge variant="outline" className="font-medium">
                      {topModel.model}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {percentageFormatter.format(topModel.tokenShare)} of tokens
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {currencyFormatter.format(topModel.cost)} total ·{' '}
                    {currencyFormatter.format(topModel.costPerMessage)} per message
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No usage data yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Usage trend</CardTitle>
              <CardDescription>{rangeLabel} overview of tokens and cost</CardDescription>
            </div>
            {!summaryLoading && hasUsage && (
              <p className="text-xs text-muted-foreground">
                {numberFormatter.format(summary.totals.totalTokens)} tokens ·{' '}
                {currencyFormatter.format(summary.totals.totalCost)} total cost
              </p>
            )}
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No usage recorded for this range.</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="dateLabel" className="text-xs" />
                    <YAxis
                      yAxisId="tokens"
                      orientation="left"
                      className="text-xs"
                      tickFormatter={(value) => numberFormatter.format(value as number)}
                    />
                    <YAxis
                      yAxisId="cost"
                      orientation="right"
                      className="text-xs"
                      tickFormatter={(value) => currencyFormatter.format(value as number)}
                    />
                    <RechartsTooltip content={<ChartTooltip />} />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="tokens"
                      yAxisId="tokens"
                      strokeWidth={2}
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary)/0.1)"
                      name="Tokens"
                    />
                    <Area
                      type="monotone"
                      dataKey="cost"
                      yAxisId="cost"
                      strokeWidth={2}
                      stroke="hsl(var(--chart-2))"
                      fill="hsl(var(--chart-2)/0.2)"
                      name="Cost"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="models" className="w-full">
          <TabsList>
            <TabsTrigger value="models" data-testid="tab-models">
              By Model
            </TabsTrigger>
            <TabsTrigger value="recent" data-testid="tab-recent">
              Recent Activity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="models" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Usage by model</CardTitle>
                <CardDescription>Breakdown of spend, tokens, and efficiency per model</CardDescription>
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <Skeleton key={index} className="h-12 w-full" />
                    ))}
                  </div>
                ) : !hasUsage ? (
                  <p className="text-sm text-muted-foreground">No usage data available for this range.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Model</TableHead>
                        <TableHead className="text-right">Messages</TableHead>
                        <TableHead className="text-right">Tokens</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead className="text-right">Avg tokens</TableHead>
                        <TableHead className="text-right">Cost/msg</TableHead>
                        <TableHead className="text-right">Share</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.models.map((model) => (
                        <TableRow key={model.model} data-testid={`model-${model.model}`}>
                          <TableCell className="font-medium">
                            <Badge variant="outline" className="uppercase">
                              {model.model}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {numberFormatter.format(model.messages)}
                          </TableCell>
                          <TableCell className="text-right">
                            {numberFormatter.format(model.totalTokens)}
                          </TableCell>
                          <TableCell className="text-right">
                            {currencyFormatter.format(model.cost)}
                          </TableCell>
                          <TableCell className="text-right">
                            {numberFormatter.format(Math.round(model.avgTokensPerMessage))}
                          </TableCell>
                          <TableCell className="text-right">
                            {currencyFormatter.format(model.costPerMessage)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col items-end gap-1">
                              <Progress value={model.tokenShare * 100} className="h-2 w-32" />
                              <span className="text-xs text-muted-foreground">
                                Tokens {percentageFormatter.format(model.tokenShare)} · Cost{' '}
                                {percentageFormatter.format(model.costShare)}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recent" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent activity</CardTitle>
                <CardDescription>Your latest completions with model, tokens, and timestamps</CardDescription>
              </CardHeader>
              <CardContent>
                {metricsLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Skeleton key={index} className="h-10 w-full" />
                    ))}
                  </div>
                ) : metrics.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                ) : (
                  <div className="space-y-3">
                    {metrics.slice(0, 10).map((metric) => {
                      const totalTokens = Number(metric.totalTokens ?? '0') || 0;
                      const promptTokens = Number(metric.promptTokens ?? '0') || 0;
                      const completionTokens = Number(metric.completionTokens ?? '0') || 0;
                      const createdAt = metric.createdAt ? new Date(metric.createdAt) : undefined;

                      return (
                        <div
                          key={metric.id}
                          className="flex items-center justify-between gap-4 rounded-md border p-3"
                          data-testid={`activity-${metric.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{metric.model}</p>
                              <p className="text-xs text-muted-foreground">
                                {createdAt ? format(createdAt, 'MMM dd, yyyy HH:mm') : 'Unknown date'}
                              </p>
                            </div>
                          </div>
                          <div className="text-right text-sm">
                            <p className="font-medium">{numberFormatter.format(totalTokens)} tokens</p>
                            <p className="text-xs text-muted-foreground">
                              {numberFormatter.format(promptTokens)} → {numberFormatter.format(completionTokens)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

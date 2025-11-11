import { startOfDay } from 'date-fns';
import type { UsageMetric } from '@shared/schema';
import {
  estimateCostForModel,
  UsageSummary,
  UsageSummaryDailyUsage,
  UsageSummaryModelBreakdown,
  UsageSummaryTotals,
} from '@shared/usage';

function parseTokens(value?: string | null): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIsoDate(date: Date): string {
  return startOfDay(date).toISOString();
}

export function buildUsageSummary(
  metrics: UsageMetric[],
  range?: { from?: Date; to?: Date },
): UsageSummary {
  const totals: UsageSummaryTotals = {
    messages: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    avgTokensPerMessage: 0,
    avgCostPerMessage: 0,
  };

  const modelMap = new Map<string, UsageSummaryModelBreakdown>();
  const dayMap = new Map<string, UsageSummaryDailyUsage>();

  for (const metric of metrics) {
    const promptTokens = parseTokens(metric.promptTokens);
    const completionTokens = parseTokens(metric.completionTokens);
    const totalTokens = parseTokens(metric.totalTokens) || promptTokens + completionTokens;
    const createdAt = metric.createdAt ? new Date(metric.createdAt) : new Date();
    const model = metric.model || 'unknown';

    const cost = estimateCostForModel(model, promptTokens, completionTokens);

    totals.messages += 1;
    totals.promptTokens += promptTokens;
    totals.completionTokens += completionTokens;
    totals.totalTokens += totalTokens;
    totals.totalCost += cost;

    const dayKey = toIsoDate(createdAt);
    const dayEntry = dayMap.get(dayKey) ?? {
      date: dayKey,
      messages: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: 0,
    };
    dayEntry.messages += 1;
    dayEntry.promptTokens += promptTokens;
    dayEntry.completionTokens += completionTokens;
    dayEntry.totalTokens += totalTokens;
    dayEntry.cost += cost;
    dayMap.set(dayKey, dayEntry);

    const existingModel = modelMap.get(model) ?? {
      model,
      messages: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: 0,
      avgTokensPerMessage: 0,
      costPerMessage: 0,
      tokenShare: 0,
      costShare: 0,
    };
    existingModel.messages += 1;
    existingModel.promptTokens += promptTokens;
    existingModel.completionTokens += completionTokens;
    existingModel.totalTokens += totalTokens;
    existingModel.cost += cost;
    modelMap.set(model, existingModel);
  }

  if (totals.messages > 0) {
    totals.avgTokensPerMessage = totals.totalTokens / totals.messages;
    totals.avgCostPerMessage = totals.totalCost / totals.messages;
  }

  const models: UsageSummaryModelBreakdown[] = Array.from(modelMap.values())
    .map((modelEntry) => {
      const avgTokens = modelEntry.messages > 0 ? modelEntry.totalTokens / modelEntry.messages : 0;
      const costPerMessage = modelEntry.messages > 0 ? modelEntry.cost / modelEntry.messages : 0;
      return {
        ...modelEntry,
        avgTokensPerMessage: avgTokens,
        costPerMessage,
        tokenShare: totals.totalTokens > 0 ? modelEntry.totalTokens / totals.totalTokens : 0,
        costShare: totals.totalCost > 0 ? modelEntry.cost / totals.totalCost : 0,
      };
    })
    .sort((a, b) => b.totalTokens - a.totalTokens);

  const daily: UsageSummaryDailyUsage[] = Array.from(dayMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  return {
    totals: {
      ...totals,
      totalCost: Number(totals.totalCost.toFixed(6)),
      avgTokensPerMessage: Number(totals.avgTokensPerMessage.toFixed(2)),
      avgCostPerMessage: Number(totals.avgCostPerMessage.toFixed(6)),
    },
    models: models.map((model) => ({
      ...model,
      cost: Number(model.cost.toFixed(6)),
      avgTokensPerMessage: Number(model.avgTokensPerMessage.toFixed(2)),
      costPerMessage: Number(model.costPerMessage.toFixed(6)),
      tokenShare: Number(model.tokenShare.toFixed(4)),
      costShare: Number(model.costShare.toFixed(4)),
    })),
    daily: daily.map((entry) => ({
      ...entry,
      cost: Number(entry.cost.toFixed(6)),
    })),
    dateRange: {
      from: range?.from ? toIsoDate(range.from) : undefined,
      to: range?.to ? toIsoDate(range.to) : undefined,
    },
  };
}


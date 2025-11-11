export interface ModelPricing {
  promptCostPer1k: number;
  completionCostPer1k?: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-5': { promptCostPer1k: 0.01, completionCostPer1k: 0.03 },
  'gpt-5-mini': { promptCostPer1k: 0.003, completionCostPer1k: 0.009 },
  'claude-4.5-sonnet': { promptCostPer1k: 0.003, completionCostPer1k: 0.015 },
  compound: { promptCostPer1k: 0.002, completionCostPer1k: 0.002 },
  'sonar-pro': { promptCostPer1k: 0.002, completionCostPer1k: 0.002 },
  'sonar-deep-research': { promptCostPer1k: 0.003, completionCostPer1k: 0.003 },
};

export const DEFAULT_PRICING: Required<ModelPricing> = {
  promptCostPer1k: 0.002,
  completionCostPer1k: 0.002,
};

export function estimateCostForModel(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  const promptRate = pricing.promptCostPer1k ?? DEFAULT_PRICING.promptCostPer1k;
  const completionRate =
    pricing.completionCostPer1k ?? pricing.promptCostPer1k ?? DEFAULT_PRICING.completionCostPer1k;

  return (promptTokens / 1000) * promptRate + (completionTokens / 1000) * completionRate;
}

export interface UsageSummaryTotals {
  messages: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  totalCost: number;
  avgTokensPerMessage: number;
  avgCostPerMessage: number;
}

export interface UsageSummaryModelBreakdown {
  model: string;
  messages: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  avgTokensPerMessage: number;
  costPerMessage: number;
  tokenShare: number;
  costShare: number;
}

export interface UsageSummaryDailyUsage {
  date: string;
  messages: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
}

export interface UsageSummary {
  totals: UsageSummaryTotals;
  models: UsageSummaryModelBreakdown[];
  daily: UsageSummaryDailyUsage[];
  dateRange: {
    from?: string;
    to?: string;
  };
}

export const EMPTY_USAGE_SUMMARY: UsageSummary = {
  totals: {
    messages: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    avgTokensPerMessage: 0,
    avgCostPerMessage: 0,
  },
  models: [],
  daily: [],
  dateRange: {},
};

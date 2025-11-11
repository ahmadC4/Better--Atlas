import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUsageSummary } from '../server/usage/analytics';
import type { UsageMetric } from '@shared/schema';

const baseMetric: Partial<UsageMetric> = {
  userId: 'user-1',
  chatId: 'chat-1',
};

test('buildUsageSummary aggregates totals, cost, and model breakdown', () => {
  const metrics: UsageMetric[] = [
    {
      ...baseMetric,
      id: '1',
      model: 'gpt-5',
      promptTokens: '1000',
      completionTokens: '500',
      totalTokens: '1500',
      createdAt: new Date('2024-01-01T10:00:00Z'),
    } as UsageMetric,
    {
      ...baseMetric,
      id: '2',
      model: 'gpt-5-mini',
      promptTokens: '800',
      completionTokens: '200',
      totalTokens: '1000',
      createdAt: new Date('2024-01-02T12:00:00Z'),
    } as UsageMetric,
  ];

  const summary = buildUsageSummary(metrics, {
    from: new Date('2024-01-01T00:00:00Z'),
    to: new Date('2024-01-07T00:00:00Z'),
  });

  assert.equal(summary.totals.messages, 2);
  assert.equal(summary.totals.totalTokens, 2500);
  assert.equal(summary.totals.promptTokens, 1800);
  assert.equal(summary.totals.completionTokens, 700);
  assert.equal(summary.models.length, 2);

  const gpt5 = summary.models.find((model) => model.model === 'gpt-5');
  assert(gpt5);
  assert.equal(gpt5.messages, 1);
  assert.equal(gpt5.totalTokens, 1500);
  assert.equal(gpt5.cost, 0.025);

  const mini = summary.models.find((model) => model.model === 'gpt-5-mini');
  assert(mini);
  assert.equal(mini.totalTokens, 1000);
  assert.equal(mini.cost, 0.0042);

  assert.equal(summary.daily.length, 2);
  assert.equal(summary.daily[0].date, '2024-01-01T00:00:00.000Z');
  assert.equal(summary.daily[1].date, '2024-01-02T00:00:00.000Z');
  assert.equal(summary.daily[0].totalTokens, 1500);
  assert.equal(summary.daily[1].totalTokens, 1000);

  assert.equal(summary.dateRange.from, '2024-01-01T00:00:00.000Z');
  assert.equal(summary.dateRange.to, '2024-01-07T00:00:00.000Z');
});

test('buildUsageSummary falls back to default pricing for unknown models', () => {
  const metrics: UsageMetric[] = [
    {
      ...baseMetric,
      id: 'unknown',
      model: 'mystery-model',
      promptTokens: '100',
      completionTokens: '100',
      totalTokens: '200',
      createdAt: new Date('2024-02-01T15:00:00Z'),
    } as UsageMetric,
  ];

  const summary = buildUsageSummary(metrics);
  assert.equal(summary.totals.totalTokens, 200);
  assert.equal(summary.totals.totalCost, 0.0004);
  assert.equal(summary.models[0].cost, 0.0004);
  assert.equal(summary.models[0].tokenShare, 1);
  assert.equal(summary.models[0].costShare, 1);
});

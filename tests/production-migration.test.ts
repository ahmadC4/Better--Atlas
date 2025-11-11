import test from "node:test";
import assert from "node:assert/strict";
import { summarizeMigration } from "../scripts/summarize-production-migration";

const expectedPlans = [
  { name: "Enterprise", tier: "enterprise" },
  { name: "Free", tier: "free" },
  { name: "Pro", tier: "pro" },
];

const expectedModelIds = [
  "claude-3-opus",
  "claude-4.5-haiku",
  "claude-4.5-sonnet",
  "llama-3.1-70b",
  "llama-3.1-8b",
  "mixtral-8x7b",
  "gpt-4-turbo",
  "gpt-5",
  "gpt-5-mini",
  "sonar-large",
  "sonar-small",
];

const expectedProviderCounts: Record<string, number> = {
  anthropic: 3,
  groq: 3,
  openai: 3,
  perplexity: 2,
};

test("production migration inserts the expected plans", () => {
  const summary = summarizeMigration();
  const planMap = new Map(summary.plans.map(plan => [plan.tier, plan.name]));

  assert.equal(summary.plans.length, expectedPlans.length);
  for (const plan of expectedPlans) {
    assert.equal(planMap.get(plan.tier), plan.name);
  }
});

test("production migration inserts the expected models", () => {
  const summary = summarizeMigration();

  assert.equal(summary.models.length, expectedModelIds.length);
  const modelIds = new Set(summary.models.map(model => model.modelId));

  for (const modelId of expectedModelIds) {
    assert(modelIds.has(modelId), `Missing modelId: ${modelId}`);
  }
});

test("production migration models are distributed by provider", () => {
  const summary = summarizeMigration();
  assert.deepEqual(summary.providerCounts, expectedProviderCounts);
  assert.equal(summary.totalModels, expectedModelIds.length);
});

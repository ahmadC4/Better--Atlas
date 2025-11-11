import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeUserPlanAssignment, buildPlanLookup, normalizePlanSlug } from '../server/plans/legacy-plan-migration';
import type { Plan } from '@shared/schema';

const now = new Date();
let planCounter = 0;

function createPlan(overrides: Partial<Plan>): Plan {
  const generatedId = `plan-${++planCounter}`;
  return {
    id: overrides.id ?? generatedId,
    name: overrides.name ?? 'Free',
    slug: overrides.slug ?? 'free',
    description: overrides.description ?? 'default',
    allowExperts: overrides.allowExperts ?? false,
    allowTemplates: overrides.allowTemplates ?? false,
    allowModels: overrides.allowModels ?? true,
    allowKbSystem: overrides.allowKbSystem ?? false,
    allowKbOrg: overrides.allowKbOrg ?? false,
    allowKbTeam: overrides.allowKbTeam ?? false,
    allowKbUser: overrides.allowKbUser ?? true,
    allowMemory: overrides.allowMemory ?? true,
    allowAgents: overrides.allowAgents ?? false,
    allowApiAccess: overrides.allowApiAccess ?? false,
    showExpertsUpsell: overrides.showExpertsUpsell ?? false,
    showTemplatesUpsell: overrides.showTemplatesUpsell ?? false,
    showApiUpsell: overrides.showApiUpsell ?? false,
    dailyMessageLimit: overrides.dailyMessageLimit ?? null,
    maxFileSizeMb: overrides.maxFileSizeMb ?? 10,
    storageQuotaGb: overrides.storageQuotaGb ?? 1,
    modelsAllowed: overrides.modelsAllowed ?? [],
    expertsAllowed: overrides.expertsAllowed ?? [],
    templatesAllowed: overrides.templatesAllowed ?? [],
    priceMonthlyUsd: overrides.priceMonthlyUsd ?? 0,
    priceAnnualUsd: overrides.priceAnnualUsd ?? 0,
    isProTier: overrides.isProTier ?? false,
    isActive: overrides.isActive ?? true,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

test('normalizePlanSlug strips whitespace and punctuation', () => {
  assert.equal(normalizePlanSlug(' Pro '), 'pro');
  assert.equal(normalizePlanSlug('Enterprise ++ Plan'), 'enterprise-plan');
  assert.equal(normalizePlanSlug(undefined), null);
});

test('analyzeUserPlanAssignment aligns legacy slugs and missing IDs', () => {
  const freePlan = createPlan({ id: 'plan-free', name: 'Free', slug: 'free' });
  const proPlan = createPlan({ id: 'plan-pro', name: 'Pro', slug: 'pro', allowExperts: true, isProTier: true });
  const lookup = buildPlanLookup([freePlan, proPlan]);

  const snapshot = analyzeUserPlanAssignment(
    { id: 'user-1', plan: ' Pro ', planId: null },
    lookup,
  );

  assert.equal(snapshot.targetPlanId, proPlan.id);
  assert.equal(snapshot.targetPlanSlug, 'pro');
  assert.equal(snapshot.needsUpdate, true);
  assert.ok(snapshot.reasons.includes('matchedBySlug'));
  assert.ok(snapshot.reasons.includes('missingPlanId'));
});

test('analyzeUserPlanAssignment falls back to default plan for unknown entries', () => {
  const freePlan = createPlan({ id: 'plan-free', name: 'Free', slug: 'free' });
  const proPlan = createPlan({ id: 'plan-pro', name: 'Pro', slug: 'pro' });
  const lookup = buildPlanLookup([freePlan, proPlan]);

  const snapshot = analyzeUserPlanAssignment(
    { id: 'user-2', plan: 'mystery', planId: 'missing-plan' },
    lookup,
  );

  assert.equal(snapshot.targetPlanId, freePlan.id);
  assert.equal(snapshot.targetPlanSlug, 'free');
  assert.equal(snapshot.needsUpdate, true);
  assert.ok(snapshot.reasons.includes('defaultedToFree'));
  assert.ok(snapshot.reasons.includes('planIdMismatch'));
  assert.ok(snapshot.reasons.includes('danglingPlanId'));
});

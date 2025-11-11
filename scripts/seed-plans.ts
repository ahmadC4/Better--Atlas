#!/usr/bin/env tsx

import { eq } from 'drizzle-orm';
import { pathToFileURL } from 'url';

import { db, pool } from '../server/db';
import { plans, type InsertPlan } from '../shared/schema';

export interface SeedPlansOptions {
  silent?: boolean;
}

export const planSeeds: InsertPlan[] = [
  {
    id: '61ad484a-8e68-48c2-9ab0-0202c126e815',
    name: 'Free',
    slug: 'free',
    tier: 'free',
    description: 'Basic plan with limited features',
    allowExperts: false,
    allowTemplates: false,
    allowModels: true,
    allowKbSystem: true,
    allowKbOrg: false,
    allowKbTeam: false,
    allowKbUser: true,
    allowMemory: false,
    allowAgents: false,
    allowApiAccess: false,
    showExpertsUpsell: true,
    showTemplatesUpsell: true,
    showApiUpsell: true,
    dailyMessageLimit: 10,
    maxFileSizeMb: 10,
    storageQuotaGb: 1,
    modelsAllowed: ['gpt-5-mini', 'claude-4.5-haiku', 'llama-3.1-8b'],
    expertsAllowed: [],
    templatesAllowed: [],
    priceMonthlyUsd: 0,
    priceAnnualUsd: 0,
    isActive: true,
    isProTier: false,
  },
  {
    id: '4b685e76-c8be-4481-ac46-2542047fb3d7',
    name: 'Pro',
    slug: 'pro',
    tier: 'pro',
    description: 'Professional plan with advanced features',
    allowExperts: true,
    allowTemplates: true,
    allowModels: true,
    allowKbSystem: true,
    allowKbOrg: true,
    allowKbTeam: false,
    allowKbUser: true,
    allowMemory: true,
    allowAgents: false,
    allowApiAccess: false,
    showExpertsUpsell: false,
    showTemplatesUpsell: false,
    showApiUpsell: false,
    dailyMessageLimit: null,
    maxFileSizeMb: 100,
    storageQuotaGb: 10,
    modelsAllowed: [
      'gpt-5',
      'gpt-5-mini',
      'claude-4.5-sonnet',
      'claude-4.5-haiku',
      'llama-3.1-70b',
      'llama-3.1-8b',
    ],
    expertsAllowed: [],
    templatesAllowed: [],
    priceMonthlyUsd: 20,
    priceAnnualUsd: 200,
    isActive: true,
    isProTier: false,
  },
  {
    id: '9f791bf3-6762-4226-9b02-c410e146cb94',
    name: 'Enterprise',
    slug: 'enterprise',
    tier: 'enterprise',
    description: 'Enterprise plan with all features and teams',
    allowExperts: true,
    allowTemplates: true,
    allowModels: true,
    allowKbSystem: true,
    allowKbOrg: true,
    allowKbTeam: true,
    allowKbUser: true,
    allowMemory: true,
    allowAgents: true,
    allowApiAccess: true,
    showExpertsUpsell: false,
    showTemplatesUpsell: false,
    showApiUpsell: false,
    dailyMessageLimit: null,
    maxFileSizeMb: 1000,
    storageQuotaGb: 100,
    modelsAllowed: [],
    expertsAllowed: [],
    templatesAllowed: [],
    priceMonthlyUsd: 100,
    priceAnnualUsd: 1000,
    isActive: true,
    isProTier: false,
  },
];

export async function seedPlans(options: SeedPlansOptions = {}) {
  const { silent = false } = options;
  const log = silent ? () => undefined : console.log;

  log('Seeding default plans...');

  for (const seed of planSeeds) {
    const { id: seedId, ...planData } = seed;
    const [existing] = await db.select().from(plans).where(eq(plans.slug, seed.slug)).limit(1);

    if (existing) {
      await db
        .update(plans)
        .set({
          ...planData,
          updatedAt: new Date(),
        })
        .where(eq(plans.id, existing.id));
      log(`Updated ${seed.name} plan (${existing.id})`);
      continue;
    }

    const insertPayload: InsertPlan = {
      ...planData,
      ...(seedId ? { id: seedId } : {}),
    };

    const [created] = await db.insert(plans).values(insertPayload).returning();
    log(`Created ${seed.name} plan (${created.id})`);
  }

  log('✅ Successfully seeded default plans!');
}

async function runFromCli() {
  try {
    await seedPlans();
  } catch (error) {
    console.error('Error seeding plans:', error);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => undefined);
    process.exit(process.exitCode ?? 0);
  }
}

const cliEntry = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;

if (cliEntry && import.meta.url === cliEntry) {
  runFromCli();
}

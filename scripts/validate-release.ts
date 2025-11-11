#!/usr/bin/env tsx

import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { planSeeds } from './seed-plans';
import { pool } from '../server/db';
import {
  defaultPlatformSettings,
  insertKnowledgeItemSchema,
  insertTeamInvitationSchema,
  insertTeamMemberSchema,
  insertTeamSchema,
  platformSettingsDataSchema,
} from '../shared/schema';

type CheckResult = { name: string; success: boolean; error?: string };

async function assertRequiredTables(): Promise<CheckResult> {
  const requiredTables = ['sessions', 'plans', 'n8n_agents'];
  try {
    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [requiredTables],
    );

    const present = new Set(rows.map((row) => row.table_name));
    const missing = requiredTables.filter((table) => !present.has(table));

    if (missing.length > 0) {
      throw new Error(`Missing tables: ${missing.join(', ')}`);
    }

    return { name: 'database:tables', success: true };
  } catch (error) {
    return {
      name: 'database:tables',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function assertPlansTierDefault(): Promise<CheckResult> {
  try {
    const { rows } = await pool.query<{ column_default: string | null }>(
      `SELECT column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'plans' AND column_name = 'tier'`,
    );

    if (rows.length === 0) {
      throw new Error('plans.tier column not found');
    }

    const columnDefault = rows[0]?.column_default?.trim();
    const expectedDefaults = new Set([`'custom'::text`, `('custom'::text)`]);

    if (!columnDefault || (!expectedDefaults.has(columnDefault) && !columnDefault.includes('custom'))) {
      throw new Error(`Unexpected default for plans.tier: ${columnDefault ?? 'null'}`);
    }

    return { name: 'database:plans.tier-default', success: true };
  } catch (error) {
    return {
      name: 'database:plans.tier-default',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function assertCanonicalPlans(): Promise<CheckResult> {
  try {
    const expected = planSeeds.map((plan) => ({ id: plan.id, slug: plan.slug, tier: plan.tier }));
    const slugs = expected.map((plan) => plan.slug);

    const { rows } = await pool.query<{ id: string; slug: string; tier: string }>(
      `SELECT id, slug, tier FROM plans WHERE slug = ANY($1::text[])`,
      [slugs],
    );

    const registry = new Map(rows.map((row) => [row.slug, row]));
    const missing: string[] = [];
    const mismatched: string[] = [];

    for (const plan of expected) {
      const row = registry.get(plan.slug);
      if (!row) {
        missing.push(plan.slug);
        continue;
      }

      if (row.id !== plan.id || row.tier !== plan.tier) {
        mismatched.push(`${plan.slug} (expected id=${plan.id}, tier=${plan.tier}; got id=${row.id}, tier=${row.tier})`);
      }
    }

    if (missing.length > 0 || mismatched.length > 0) {
      const details = [
        missing.length > 0 ? `missing slugs: ${missing.join(', ')}` : null,
        mismatched.length > 0 ? `mismatched plans: ${mismatched.join('; ')}` : null,
      ]
        .filter(Boolean)
        .join(' | ');
      throw new Error(details || 'Canonical plan check failed');
    }

    return { name: 'database:canonical-plans', success: true };
  } catch (error) {
    return {
      name: 'database:canonical-plans',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function replaySchemaPayloads(): CheckResult {
  try {
    const representativeSettings = structuredClone(defaultPlatformSettings);
    representativeSettings.planTiers.free.messageLimitPerDay = 15;
    representativeSettings.planTiers.pro.dailyMessageLimit = 1000;
    representativeSettings.apiProviders.openai.allowUserProvidedKeys = true;
    representativeSettings.aiAgents.enabled = true;
    platformSettingsDataSchema.parse(representativeSettings);

    const knowledgePayload = {
      userId: 'user_123',
      scope: 'user',
      scopeId: 'user_123',
      type: 'url',
      title: 'Release Playbook',
      content: 'Always validate before shipping.',
      sourceUrl: 'https://example.com/playbook',
      metadata: {
        fetchedAt: new Date().toISOString(),
        contentLength: 42,
        url: 'https://example.com/playbook',
      },
    };
    insertKnowledgeItemSchema.parse(knowledgePayload);

    const teamPayload = {
      name: 'Launch Crew',
      description: 'Coordinates release readiness.',
      ownerId: 'user_123',
      settings: {
        customInstructions: 'Prioritize release blockers.',
        storageQuotaMb: 1024,
        apiUsageLimit: 5000,
      },
    };
    insertTeamSchema.parse(teamPayload);

    const teamMemberPayload = {
      teamId: 'team_123',
      userId: 'user_456',
      role: 'admin' as const,
      status: 'pending' as const,
      invitedBy: 'user_123',
    };
    insertTeamMemberSchema.parse(teamMemberPayload);

    const teamInvitationPayload = {
      teamId: 'team_123',
      email: 'teammate@example.com',
      role: 'member' as const,
      invitedBy: 'user_123',
      token: 'invitation-token',
      status: 'pending' as const,
      expiresAt: new Date(),
    };
    insertTeamInvitationSchema.parse(teamInvitationPayload);

    return { name: 'schemas:payload-replay', success: true };
  } catch (error) {
    return {
      name: 'schemas:payload-replay',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const results: CheckResult[] = [];

  results.push(await assertRequiredTables());
  results.push(await assertPlansTierDefault());
  results.push(await assertCanonicalPlans());
  results.push(replaySchemaPayloads());

  const failures = results.filter((result) => !result.success);

  for (const result of results) {
    if (result.success) {
      console.log(`✔ ${result.name}`);
    } else {
      console.error(`✖ ${result.name}: ${result.error ?? 'unknown error'}`);
    }
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

async function run() {
  try {
    await main();
  } finally {
    await pool.end().catch(() => undefined);
  }
}

const cliEntry = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;

if (cliEntry && import.meta.url === cliEntry) {
  run().catch((error) => {
    console.error('Release validation failed:', error);
    process.exit(1);
  });
}


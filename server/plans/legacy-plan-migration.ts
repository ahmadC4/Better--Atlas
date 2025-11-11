import { eq } from 'drizzle-orm';
import type { db } from '../db';
import { plans, users, type Plan, type User } from '../../shared/schema.js';

export interface PlanLookup {
  plansById: Map<string, Plan>;
  plansBySlug: Map<string, Plan>;
  plansByName: Map<string, Plan>;
  defaultPlan: Plan;
}

export interface UserPlanSnapshot {
  userId: string;
  currentPlanId: string | null;
  currentPlanSlug: string | null;
  targetPlanId: string;
  targetPlanSlug: string;
  reasons: string[];
  needsUpdate: boolean;
}

export interface PlanMigrationOptions {
  dryRun?: boolean;
  now?: Date;
  logger?: (message: string) => void;
}

export interface PlanMigrationReport {
  dryRun: boolean;
  totalUsers: number;
  updatedUsers: number;
  reasons: Record<string, number>;
}

export type PlanMigrationDb = typeof db;

export function normalizePlanSlug(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const cleaned = normalized.replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned : null;
}

export function buildPlanLookup(planRows: Plan[]): PlanLookup {
  if (planRows.length === 0) {
    throw new Error('No plans found in database. Seed plans before running migrations.');
  }

  const plansById = new Map<string, Plan>();
  const plansBySlug = new Map<string, Plan>();
  const plansByName = new Map<string, Plan>();

  for (const plan of planRows) {
    plansById.set(plan.id, plan);

    const slug = normalizePlanSlug(plan.slug);
    if (slug) {
      plansBySlug.set(slug, plan);
    }

    const name = normalizePlanSlug(plan.name);
    if (name) {
      plansByName.set(name, plan);
    }
  }

  const defaultPlan = plansBySlug.get('free') ?? plansByName.get('free') ?? planRows[0];

  return { plansById, plansBySlug, plansByName, defaultPlan };
}

export function analyzeUserPlanAssignment(user: Pick<User, 'id' | 'plan' | 'planId'>, lookup: PlanLookup): UserPlanSnapshot {
  const reasons: string[] = [];
  const currentPlanId = user.planId ?? null;
  const currentSlug = normalizePlanSlug(user.plan);

  let targetPlan: Plan | undefined = currentPlanId ? lookup.plansById.get(currentPlanId) : undefined;

  if (!targetPlan && currentSlug) {
    targetPlan = lookup.plansBySlug.get(currentSlug) ?? lookup.plansByName.get(currentSlug);
    if (targetPlan) {
      reasons.push('matchedBySlug');
    }
  }

  if (!targetPlan && currentPlanId) {
    reasons.push('danglingPlanId');
  }

  if (!targetPlan) {
    targetPlan = lookup.defaultPlan;
    reasons.push('defaultedToFree');
  }

  const targetSlug = normalizePlanSlug(targetPlan.slug) ?? normalizePlanSlug(targetPlan.name) ?? 'free';

  if (!currentPlanId) {
    reasons.push('missingPlanId');
  }

  if (currentPlanId && targetPlan.id !== currentPlanId) {
    reasons.push('planIdMismatch');
  }

  if (currentSlug && targetSlug !== currentSlug) {
    reasons.push('slugMismatch');
  }

  if (!currentSlug) {
    reasons.push('missingPlanSlug');
  }

  const needsUpdate = targetPlan.id !== currentPlanId || targetSlug !== currentSlug;

  return {
    userId: user.id,
    currentPlanId,
    currentPlanSlug: currentSlug,
    targetPlanId: targetPlan.id,
    targetPlanSlug: targetSlug,
    reasons,
    needsUpdate,
  };
}

export async function migrateLegacyPlans(
  dbClient: PlanMigrationDb,
  options: PlanMigrationOptions = {},
): Promise<PlanMigrationReport> {
  const { dryRun = true, now = new Date(), logger } = options;

  const planRows = await dbClient.select().from(plans);
  const lookup = buildPlanLookup(planRows);

  const userRows = await dbClient.select({ id: users.id, plan: users.plan, planId: users.planId }).from(users);

  const reasonsTally: Record<string, number> = {};
  let updatedUsers = 0;

  for (const user of userRows) {
    const snapshot = analyzeUserPlanAssignment(user, lookup);

    for (const reason of snapshot.reasons) {
      reasonsTally[reason] = (reasonsTally[reason] ?? 0) + 1;
    }

    if (!snapshot.needsUpdate) {
      continue;
    }

    updatedUsers += 1;

    logger?.(
      `${dryRun ? '[dry-run] ' : ''}Aligning user ${snapshot.userId}: planId ${snapshot.currentPlanId ?? 'null'} → ${snapshot.targetPlanId}, slug ${snapshot.currentPlanSlug ?? 'null'} → ${snapshot.targetPlanSlug}`,
    );

    if (dryRun) {
      continue;
    }

    await dbClient
      .update(users)
      .set({
        planId: snapshot.targetPlanId,
        plan: snapshot.targetPlanSlug,
        updatedAt: now,
      })
      .where(eq(users.id, snapshot.userId));
  }

  if (logger) {
    logger(
      `${dryRun ? 'Dry-run complete' : 'Migration complete'}: ${updatedUsers} of ${userRows.length} users require alignment.`,
    );
  }

  return {
    dryRun,
    totalUsers: userRows.length,
    updatedUsers,
    reasons: reasonsTally,
  };
}

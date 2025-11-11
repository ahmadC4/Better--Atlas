import type { IStorage } from "./storage/index.js";
import type { InsertAnalyticsEvent, InsertAdminAuditLog } from "../shared/schema.js";
import { nanoid } from "nanoid";

/**
 * Feature tracking types
 */
export type FeatureAction = 'allowed' | 'blocked';
export type FeatureName = 
  | 'expert_usage'
  | 'template_usage'
  | 'model_usage'
  | 'api_access'
  | 'knowledge_base'
  | 'memory'
  | 'agents';

export interface FeaturePlanContext {
  id?: string | null;
  slug?: string | null;
  label?: string | null;
  isProTier?: boolean;
}

export interface FeatureContext {
  plan?: FeaturePlanContext;
  expertId?: string;
  templateId?: string;
  model?: string;
  provider?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Plan audit types
 */
export interface PlanChangeSnapshot {
  planId: string | null;
  planSlug: string | null;
  planLabel: string | null;
  planTier?: string | null;
  isProTier?: boolean;
  [key: string]: unknown;
}

export interface PlanChangeContext {
  targetType: 'plan' | 'user';
  targetId: string;
  targetName?: string;
  before: PlanChangeSnapshot;
  after: PlanChangeSnapshot;
  changeNotes?: string;
}

const ensurePlanChangeSnapshot = (value: unknown): PlanChangeSnapshot => {
  if (!value || typeof value !== 'object') {
    return { planId: null, planSlug: null, planLabel: null };
  }

  const snapshot = value as Record<string, unknown>;
  const planId = typeof snapshot.planId === 'string' ? snapshot.planId : null;
  const planSlug = typeof snapshot.planSlug === 'string' ? snapshot.planSlug : null;
  const planLabel = typeof snapshot.planLabel === 'string' ? snapshot.planLabel : null;
  const planTier = typeof snapshot.planTier === 'string' ? snapshot.planTier : null;
  const isProTier = typeof snapshot.isProTier === 'boolean' ? snapshot.isProTier : undefined;

  return {
    ...snapshot,
    planId,
    planSlug,
    planLabel,
    planTier,
    isProTier,
  } as PlanChangeSnapshot;
};

/**
 * Analytics helper class for consistent event tracking
 */
export class AnalyticsTracker {
  constructor(private storage: IStorage) {}

  /**
   * Track when a feature is blocked due to plan restrictions
   */
  async trackFeatureBlocked(
    userId: string,
    feature: FeatureName,
    reason: string,
    context?: FeatureContext
  ): Promise<void> {
    try {
      const event: InsertAnalyticsEvent = {
        requestId: nanoid(16),
        userId,
        provider: 'compound',
        model: 'feature_gate',
        status: 'error',
        errorCode: 'FEATURE_BLOCKED',
        errorMessage: reason,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        latencyMs: 0,
        costUsd: '0',
        // Store feature info in existing fields
        expertId: context?.expertId,
        templateId: context?.templateId,
      };

      // Store additional context in the errorMessage field as JSON
      const fullContext = {
        feature,
        action: 'blocked',
        reason,
        plan: context?.plan,
        model: context?.model,
        provider: context?.provider,
        metadata: context?.metadata,
      };
      event.errorMessage = JSON.stringify(fullContext);

      await this.storage.createAnalyticsEvent(event);
    } catch (error) {
      // Log but don't throw - analytics should not break main flow
      console.error('[Analytics] Failed to track blocked feature:', error);
    }
  }

  /**
   * Track successful feature usage
   */
  async trackFeatureUsed(
    userId: string,
    feature: FeatureName,
    details: string,
    context?: FeatureContext
  ): Promise<void> {
    try {
      const event: InsertAnalyticsEvent = {
        requestId: nanoid(16),
        userId,
        provider: 'compound',
        model: 'feature_usage',
        status: 'success',
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        latencyMs: 0,
        costUsd: '0',
        expertId: context?.expertId,
        templateId: context?.templateId,
      };

      // Store feature info in a structured way
      const fullContext = {
        feature,
        action: 'allowed',
        details,
        plan: context?.plan,
        model: context?.model,
        provider: context?.provider,
        metadata: context?.metadata,
      };
      // Use errorMessage field to store context as JSON (since we're repurposing the table)
      event.errorMessage = JSON.stringify(fullContext);

      await this.storage.createAnalyticsEvent(event);
    } catch (error) {
      console.error('[Analytics] Failed to track feature usage:', error);
    }
  }

  /**
   * Audit plan modifications
   */
  async auditPlanModification(
    actorUserId: string | null,
    changes: PlanChangeContext
  ): Promise<void> {
    try {
      const auditLog: InsertAdminAuditLog = {
        actorUserId,
        targetUserId: changes.targetType === 'user' ? changes.targetId : actorUserId ?? 'system',
        action: changes.targetType === 'user' ? 'user.plan.changed' : 'plan.modified',
        metadata: {
          targetType: changes.targetType,
          targetId: changes.targetId,
          targetName: changes.targetName,
          before: changes.before,
          after: changes.after,
          changeNotes: changes.changeNotes,
          timestamp: new Date().toISOString(),
        },
      };

      await this.storage.createAdminAuditLog(auditLog);
    } catch (error) {
      console.error('[Analytics] Failed to audit plan modification:', error);
    }
  }

  /**
   * Track API access attempts
   */
  async trackApiAccess(
    userId: string,
    endpoint: string,
    method: string,
    allowed: boolean,
    reason?: string
  ): Promise<void> {
    const action = allowed ? 'allowed' : 'blocked';
    if (!allowed) {
      await this.trackFeatureBlocked(userId, 'api_access', reason || 'API access not allowed', {
        metadata: { endpoint, method }
      });
    } else {
      await this.trackFeatureUsed(userId, 'api_access', `${method} ${endpoint}`, {
        metadata: { endpoint, method }
      });
    }
  }

  /**
   * Get feature usage statistics for a given time range
   */
  async getFeatureUsageStats(
    startDate?: Date,
    endDate?: Date,
    userId?: string
  ): Promise<{
    totalEvents: number;
    blockedEvents: number;
    allowedEvents: number;
    byFeature: Record<string, { allowed: number; blocked: number }>;
    topBlockedFeatures: Array<{ feature: string; count: number; reason: string }>;
  }> {
    try {
      // Get analytics events within the time range
      const events = await this.storage.getAnalyticsEvents({
        dateFrom: startDate,
        dateTo: endDate,
        userId,
        provider: 'compound', // Use synthetic provider bucket for system events
      });

      const stats = {
        totalEvents: 0,
        blockedEvents: 0,
        allowedEvents: 0,
        byFeature: {} as Record<string, { allowed: number; blocked: number }>,
        topBlockedFeatures: [] as Array<{ feature: string; count: number; reason: string }>,
      };

      const blockedFeatureCounts: Record<string, { count: number; reasons: Record<string, number> }> = {};

      events.forEach(event => {
        if (event.model === 'feature_gate' || event.model === 'feature_usage') {
          stats.totalEvents++;

          // Parse the context from errorMessage
          let context: any = {};
          try {
            if (event.errorMessage) {
              context = JSON.parse(event.errorMessage);
            }
          } catch {}

          const feature = context.feature || 'unknown';
          const action = context.action || (event.status === 'error' ? 'blocked' : 'allowed');

          if (!stats.byFeature[feature]) {
            stats.byFeature[feature] = { allowed: 0, blocked: 0 };
          }

          if (action === 'blocked') {
            stats.blockedEvents++;
            stats.byFeature[feature].blocked++;
            
            if (!blockedFeatureCounts[feature]) {
              blockedFeatureCounts[feature] = { count: 0, reasons: {} };
            }
            blockedFeatureCounts[feature].count++;
            const reason = context.reason || 'Unknown';
            blockedFeatureCounts[feature].reasons[reason] = 
              (blockedFeatureCounts[feature].reasons[reason] || 0) + 1;
          } else {
            stats.allowedEvents++;
            stats.byFeature[feature].allowed++;
          }
        }
      });

      // Get top blocked features
      stats.topBlockedFeatures = Object.entries(blockedFeatureCounts)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([feature, data]) => {
          // Get the most common reason
          const topReason = Object.entries(data.reasons)
            .sort((a, b) => b[1] - a[1])[0];
          return {
            feature,
            count: data.count,
            reason: topReason ? topReason[0] : 'Unknown',
          };
        });

      return stats;
    } catch (error) {
      console.error('[Analytics] Failed to get feature usage stats:', error);
      return {
        totalEvents: 0,
        blockedEvents: 0,
        allowedEvents: 0,
        byFeature: {},
        topBlockedFeatures: [],
      };
    }
  }

  /**
   * Get plan change audit trail
   */
  async getPlanChangeAudit(
    startDate?: Date,
    endDate?: Date,
    targetUserId?: string
  ): Promise<Array<{
    id: string;
    timestamp: string;
    actor: string | null;
    targetType: string;
    targetId: string;
    targetName?: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    changeNotes?: string;
  }>> {
    try {
      const logs = await this.storage.getAdminAuditLogs({
        startDate,
        endDate,
        targetUserId,
        actions: ['user.plan.changed', 'plan.modified'],
      });

      return logs.map(log => {
        const metadata = log.metadata || {};
        const before = ensurePlanChangeSnapshot((metadata as any).before);
        const after = ensurePlanChangeSnapshot((metadata as any).after);
        return {
          id: log.id,
          timestamp: log.createdAt?.toISOString() || new Date().toISOString(),
          actor: log.actorUserId,
          targetType: metadata.targetType as string || 'unknown',
          targetId: metadata.targetId as string || log.targetUserId,
          targetName: metadata.targetName as string | undefined,
          before,
          after,
          changeNotes: metadata.changeNotes as string | undefined,
        };
      });
    } catch (error) {
      console.error('[Analytics] Failed to get plan change audit:', error);
      return [];
    }
  }
}

// Singleton instance for convenience
let analyticsInstance: AnalyticsTracker | null = null;

export function getAnalyticsTracker(storage: IStorage): AnalyticsTracker {
  if (!analyticsInstance) {
    analyticsInstance = new AnalyticsTracker(storage);
  }
  return analyticsInstance;
}

// Convenience functions that use the singleton
export async function trackFeatureBlocked(
  storage: IStorage,
  userId: string,
  feature: FeatureName,
  reason: string,
  context?: FeatureContext
): Promise<void> {
  const tracker = getAnalyticsTracker(storage);
  await tracker.trackFeatureBlocked(userId, feature, reason, context);
}

export async function trackFeatureUsed(
  storage: IStorage,
  userId: string,
  feature: FeatureName,
  details: string,
  context?: FeatureContext
): Promise<void> {
  const tracker = getAnalyticsTracker(storage);
  await tracker.trackFeatureUsed(userId, feature, details, context);
}

export async function auditPlanModification(
  storage: IStorage,
  actorUserId: string | null,
  changes: PlanChangeContext
): Promise<void> {
  const tracker = getAnalyticsTracker(storage);
  await tracker.auditPlanModification(actorUserId, changes);
}


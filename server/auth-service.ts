import { Request, Response, NextFunction, type RequestHandler } from 'express';
import * as bcrypt from 'bcryptjs';
import { pbkdf2Sync, timingSafeEqual } from 'crypto';
import {
  FEATURE_TOGGLES,
  effectiveCapabilitiesSchema,
  getModelById,
  type EffectiveCapabilities,
  type PlatformSettingsData,
  type Plan,
  type PlanAllowlistConfig,
  type ProCoupon,
  type User,
} from '../shared/schema.js';
import { IStorage } from './storage/index.js';
import { ensureAdminRole, isAdminUser } from './security/admin.js';
import { requireRole } from './security/roles.js';
import { secureCompare } from './security/secure-compare.js';

type CouponErrorCode =
  | 'PRO_COUPON_INVALID'
  | 'PRO_COUPON_INACTIVE'
  | 'PRO_COUPON_EXPIRED'
  | 'PRO_COUPON_FULLY_REDEEMED'
  | 'PRO_COUPON_ALREADY_USED';

export class CouponRedemptionError extends Error {
  code: CouponErrorCode;

  constructor(code: CouponErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

type PlanTier = 'free' | 'pro' | 'enterprise' | 'custom';

export interface ResolvedPlanMetadata {
  /** Database identifier for the plan, if available. */
  planId: string | null;
  /** Normalized slug (e.g., `pro`, `atlas-pro`). */
  slug: string;
  /** Human readable label. */
  label: string;
  /** Tier derived from slug/features to align with legacy checks. */
  tier: PlanTier;
  /** Indicates whether plan unlocks Pro-only experiences. */
  isProTier: boolean;
  /** Indicates whether plan is enterprise-level. */
  isEnterpriseTier: boolean;
  /** Raw plan record when found. */
  record: Plan | null;
}

export class AuthService {
  private readonly requireAdminGuard: RequestHandler;

  constructor(private storage: IStorage) {
    this.requireAdminGuard = requireRole(['admin', 'super_admin'], storage);
  }

  private normalizePlanSlug(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    return trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private formatPlanLabel(value: string | null | undefined): string {
    if (!value) {
      return 'No plan';
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return 'No plan';
    }

    return trimmed
      .split(/[-_\s]+/)
      .filter(segment => segment.length > 0)
      .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  }

  private deriveTierFromPlan(plan: Plan): PlanTier {
    if (this.isEnterprisePlan(plan)) {
      return 'enterprise';
    }

    if (
      plan.allowAgents ||
      plan.allowExperts ||
      plan.allowTemplates ||
      plan.allowApiAccess ||
      plan.allowKbSystem ||
      plan.allowKbOrg ||
      plan.allowKbTeam ||
      plan.priceMonthlyUsd ||
      plan.priceAnnualUsd ||
      plan.dailyMessageLimit === null ||
      (plan.dailyMessageLimit ?? 0) > 25 ||
      (plan.maxFileSizeMb ?? 0) > 10 ||
      (plan.storageQuotaGb ?? 0) > 1
    ) {
      return 'pro';
    }

    return 'free';
  }

  private resolveTierFromSlug(slug: string | null, plan?: Plan | null): PlanTier {
    const normalized = slug?.trim().toLowerCase() ?? '';

    if (/enterprise|team|business|org|corporate|company/.test(normalized)) {
      return 'enterprise';
    }

    if (/pro|professional|plus|premium|growth|scale|paid/.test(normalized)) {
      return 'pro';
    }

    if (/free|basic|starter|trial|hobby/.test(normalized)) {
      return 'free';
    }

    if (plan) {
      return this.deriveTierFromPlan(plan);
    }

    return normalized ? 'custom' : 'free';
  }

  private isEnterprisePlan(plan?: Plan | null): boolean {
    if (!plan) {
      return false;
    }

    return Boolean(plan.allowAgents || plan.allowKbOrg || plan.allowKbTeam);
  }

  private isPaidPlan(plan?: Plan | null, slug?: string | null): boolean {
    if (plan) {
      if (
        plan.allowExperts ||
        plan.allowTemplates ||
        plan.allowApiAccess ||
        plan.allowAgents ||
        plan.allowKbOrg ||
        plan.allowKbTeam ||
        plan.allowKbSystem
      ) {
        return true;
      }

      if (
        plan.dailyMessageLimit === null ||
        (plan.dailyMessageLimit ?? 0) > 10 ||
        (plan.maxFileSizeMb ?? 0) > 10 ||
        (plan.storageQuotaGb ?? 0) > 1 ||
        (plan.priceMonthlyUsd ?? 0) > 0 ||
        (plan.priceAnnualUsd ?? 0) > 0
      ) {
        return true;
      }
    }

    if (!slug) {
      return false;
    }

    const normalized = slug.toLowerCase();
    return /pro|professional|plus|premium|team|business|enterprise|growth|scale|paid/.test(normalized);
  }

  private async resolvePlanForUser(user: User): Promise<ResolvedPlanMetadata> {
    let planRecord: Plan | undefined | null = await this.storage.getUserPlan(user.id);

    let slug = this.normalizePlanSlug(planRecord?.name) ?? this.normalizePlanSlug(user.plan) ?? 'free';

    if (!planRecord) {
      let plans: Plan[] = [];
      try {
        plans = await this.storage.listPlans();
      } catch {
        plans = [];
      }

      const candidateSlugs = Array.from(
        new Set(
          [slug, this.normalizePlanSlug(user.plan), 'pro', 'enterprise', 'free'].filter(
            (value): value is string => Boolean(value),
          ),
        ),
      );

      for (const candidate of candidateSlugs) {
        const match = plans.find(plan => this.normalizePlanSlug(plan.name) === candidate);
        if (match) {
          planRecord = match;
          slug = candidate;
          break;
        }
      }

      if (!planRecord && plans.length > 0) {
        const freePlan = plans.find(plan => this.normalizePlanSlug(plan.name) === 'free');
        if (freePlan) {
          planRecord = freePlan;
          slug = this.normalizePlanSlug(freePlan.name) ?? slug;
        }
      }
    }

    if (!slug) {
      slug = 'free';
    }

    const tierFromPlan = planRecord ? this.deriveTierFromPlan(planRecord) : null;
    const tierFromSlug = this.resolveTierFromSlug(slug, planRecord ?? undefined);
    const tier: PlanTier = tierFromSlug === 'custom' && tierFromPlan ? tierFromPlan : tierFromSlug;

    const enterprise = tier === 'enterprise' || (tier === 'custom' && this.isEnterprisePlan(planRecord ?? undefined));
    const pro = tier === 'pro' || enterprise || (tier === 'custom' && this.isPaidPlan(planRecord ?? undefined, slug));

    const label = planRecord?.name ?? this.formatPlanLabel(slug);

    return {
      planId: planRecord?.id ?? null,
      slug,
      label,
      tier,
      isEnterpriseTier: enterprise,
      isProTier: pro,
      record: planRecord ?? null,
    };
  }

  private async resolvePlanForUserId(userId: string): Promise<ResolvedPlanMetadata | null> {
    const user = await this.storage.getUser(userId);
    if (!user) {
      return null;
    }

    return this.resolvePlanForUser(user);
  }

  async getResolvedPlanMetadataForUserId(userId: string): Promise<ResolvedPlanMetadata | null> {
    return this.resolvePlanForUserId(userId);
  }

  private getProAccessCode(): string | null {
    const configuredCode = process.env.PRO_ACCESS_CODE;
    if (!configuredCode) {
      return null;
    }
    return configuredCode;
  }

  // Hash password using bcrypt
  hashPassword(password: string): string {
    const saltRounds = 10; // Recommended default for bcrypt
    return bcrypt.hashSync(password, saltRounds);
  }

  private parseAllowlistEnv(value: string | undefined | null): string[] {
    if (!value) {
      return [];
    }

    return value
      .split(',')
      .map(entry => entry.trim())
      .filter(entry => entry.length > 0);
  }

  private getGlobalKnowledgeAllowlist(): string[] {
    return this.parseAllowlistEnv(process.env.KNOWLEDGE_FETCH_HOST_ALLOWLIST);
  }

  private mergeKnowledgeAllowlists(globalList: string[], planConfig?: PlanAllowlistConfig | null): string[] {
    const combined = new Set<string>();
    for (const host of globalList) {
      combined.add(host);
    }
    if (planConfig?.knowledgeBaseHosts) {
      for (const host of planConfig.knowledgeBaseHosts) {
        if (typeof host === 'string' && host.trim().length > 0) {
          combined.add(host.trim());
        }
      }
    }
    return Array.from(combined);
  }

  private computeFeatureFlags(allowedModels: string[], planFeatures: string[]): Record<string, boolean> {
    const allowedModelSet = new Set(allowedModels);
    const result: Record<string, boolean> = {};

    for (const feature of FEATURE_TOGGLES) {
      if (!planFeatures.includes(feature.id)) {
        result[feature.id] = false;
        continue;
      }

      if (feature.requiresModelIds && feature.requiresModelIds.length > 0) {
        const hasModel = feature.requiresModelIds.some(modelId => allowedModelSet.has(modelId));
        if (!hasModel) {
          result[feature.id] = false;
          continue;
        }
      }

      if (feature.requiresCapabilities && feature.requiresCapabilities.length > 0) {
        const hasCapability = allowedModels.some(modelId => {
          const model = getModelById(modelId);
          if (!model) {
            return false;
          }
          return feature.requiresCapabilities!.every(cap => model.capabilities.includes(cap));
        });

        if (!hasCapability) {
          result[feature.id] = false;
          continue;
        }
      }

      result[feature.id] = true;
    }

    return result;
  }

  private parseLegacyPbkdf2Hash(
    hashedPassword: string,
  ): { algorithm: string; iterations: number; salt: string; derivedKey: string } | null {
    const normalized = hashedPassword.trim();
    if (!normalized) {
      return null;
    }

    const colonParts = normalized.split(':');
    if (colonParts[0]?.startsWith('pbkdf2')) {
      if (colonParts.length === 4) {
        const [, iterationsStr, salt, derivedKey] = colonParts;
        const iterations = Number.parseInt(iterationsStr, 10);
        if (!Number.isFinite(iterations)) {
          return null;
        }
        const algorithm = this.resolvePbkdf2Algorithm(colonParts[0]);
        return { algorithm, iterations, salt, derivedKey };
      }
      if (colonParts.length === 5) {
        const [, algorithmName, iterationsStr, salt, derivedKey] = colonParts;
        const iterations = Number.parseInt(iterationsStr, 10);
        if (!Number.isFinite(iterations)) {
          return null;
        }
        return { algorithm: algorithmName.toLowerCase(), iterations, salt, derivedKey };
      }
    }

    const dollarParts = normalized.split('$');
    if (dollarParts[0]?.startsWith('pbkdf2')) {
      if (dollarParts.length >= 4) {
        const [, iterationsStr, salt, derivedKey] = dollarParts.slice(0, 4);
        const iterations = Number.parseInt(iterationsStr, 10);
        if (!Number.isFinite(iterations)) {
          return null;
        }
        const algorithm = this.resolvePbkdf2Algorithm(dollarParts[0]);
        return { algorithm, iterations, salt, derivedKey };
      }
    }

    if (colonParts.length === 3 && /^\d+$/.test(colonParts[0])) {
      const [iterationsStr, salt, derivedKey] = colonParts;
      const iterations = Number.parseInt(iterationsStr, 10);
      if (!Number.isFinite(iterations)) {
        return null;
      }
      return { algorithm: 'sha256', iterations, salt, derivedKey };
    }

    return null;
  }

  private resolvePbkdf2Algorithm(input: string): string {
    const schemeParts = input.split(/[:_]/);
    return (schemeParts[1] ?? 'sha256').toLowerCase();
  }

  private decodeKeyMaterial(value: string): Buffer {
    const trimmed = value.trim();
    if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
      return Buffer.from(trimmed, 'hex');
    }
    try {
      return Buffer.from(trimmed, 'base64');
    } catch {
      return Buffer.from(trimmed, 'utf8');
    }
  }

  private verifyLegacyPbkdf2(password: string, hashedPassword: string): boolean {
    const parsed = this.parseLegacyPbkdf2Hash(hashedPassword);
    if (!parsed) {
      return false;
    }

    try {
      const saltBuffer = this.decodeKeyMaterial(parsed.salt);
      const storedKeyBuffer = this.decodeKeyMaterial(parsed.derivedKey);
      if (storedKeyBuffer.length === 0) {
        return false;
      }

      const derived = pbkdf2Sync(
        password,
        saltBuffer,
        parsed.iterations,
        storedKeyBuffer.length,
        parsed.algorithm,
      );

      if (derived.length !== storedKeyBuffer.length) {
        return false;
      }

      return timingSafeEqual(derived, storedKeyBuffer);
    } catch {
      return false;
    }
  }

  // Verify password using bcrypt or legacy PBKDF2 hashes
  verifyPassword(
    password: string,
    hashedPassword: string,
  ): { isValid: boolean; needsRehash: boolean } {
    if (!hashedPassword) {
      return { isValid: false, needsRehash: false };
    }

    const isLegacyMatch = this.verifyLegacyPbkdf2(password, hashedPassword);
    if (isLegacyMatch) {
      return { isValid: true, needsRehash: true };
    }

    const isValid = bcrypt.compareSync(password, hashedPassword);
    return { isValid, needsRehash: false };
  }

  // Register new user
  async register(username: string, password: string, email?: string): Promise<User> {
    // Check if username already exists
    const existingUser = await this.storage.getUserByUsername(username);
    if (existingUser) {
      throw new Error('Username already exists');
    }

    // Hash password
    const hashedPassword = this.hashPassword(password);

    // Create user
    const user = await this.storage.createUser({
      username,
      password: hashedPassword,
      email: email || null,
      avatar: null,
      plan: 'free',
      proAccessCode: null,
      role: 'user',
    });

    return user;
  }

  // Login user
  async login(username: string, password: string): Promise<User> {
    const user = await this.storage.getUserByUsername(username);
    
    if (!user) {
      throw new Error('Invalid username or password');
    }

    // If user doesn't have a password (legacy user), update it
    if (!user.password) {
      const hashedPassword = this.hashPassword(password);
      await this.storage.updateUser(user.id, { password: hashedPassword });
      return user;
    }

    // Verify password
    const verification = this.verifyPassword(password, user.password);
    if (!verification.isValid) {
      throw new Error('Invalid username or password');
    }

    if (verification.needsRehash) {
      const hashedPassword = this.hashPassword(password);
      await this.storage.updateUser(user.id, { password: hashedPassword });
      user.password = hashedPassword;
    }

    const status = user.status ?? 'active';
    if (status !== 'active') {
      if (status === 'suspended') {
        throw new Error('Account suspended. Please contact support.');
      }
      throw new Error('Account is inactive. Please contact support.');
    }

    return user;
  }

  // Upgrade to Pro plan
  private assertCouponActive(coupon: ProCoupon): void {
    if (!coupon.isActive) {
      throw new CouponRedemptionError('PRO_COUPON_INACTIVE', 'This coupon is not currently active.');
    }
    if (coupon.expiresAt) {
      const expiresAt = coupon.expiresAt instanceof Date ? coupon.expiresAt : new Date(coupon.expiresAt);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
        throw new CouponRedemptionError('PRO_COUPON_EXPIRED', 'This coupon has expired.');
      }
    }
  }

  async upgradeToProPlan(userId: string, accessCode: string): Promise<boolean> {
    const sanitizedCode = accessCode.trim();
    if (!sanitizedCode) {
      throw new CouponRedemptionError('PRO_COUPON_INVALID', 'The supplied Pro access code is invalid.');
    }

    const coupon = await this.storage.getProCouponByCode(sanitizedCode);

    if (coupon) {
      this.assertCouponActive(coupon);

      const existingRedemption = await this.storage.getProCouponRedemption(coupon.id, userId);
      if (existingRedemption) {
        throw new CouponRedemptionError('PRO_COUPON_ALREADY_USED', 'You have already redeemed this coupon.');
      }

      const redemption = await this.storage.createProCouponRedemption(coupon.id, userId);
      const incremented = await this.storage.incrementProCouponRedemption(coupon.id);
      if (!incremented) {
        await this.storage.deleteProCouponRedemption(redemption.id);
        throw new CouponRedemptionError('PRO_COUPON_FULLY_REDEEMED', 'This coupon has reached its redemption limit.');
      }

      const proPlanRecord = await this.storage.getPlanBySlug('pro').catch(() => undefined);
      const planSlug = proPlanRecord?.slug ?? this.normalizePlanSlug(proPlanRecord?.name ?? 'pro') ?? 'pro';

      await this.storage.updateUser(userId, {
        plan: planSlug,
        planId: proPlanRecord?.id ?? null,
        proAccessCode: coupon.code,
      });
      return true;
    }

    const configuredCode = this.getProAccessCode();
    if (!configuredCode) {
      throw new Error('Pro upgrades are currently disabled');
    }
    if (!secureCompare(sanitizedCode, configuredCode)) {
      throw new CouponRedemptionError('PRO_COUPON_INVALID', 'Invalid Pro access code');
    }

    const user = await this.storage.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const proPlanRecord = await this.storage.getPlanBySlug('pro').catch(() => undefined);
    const planSlug = proPlanRecord?.slug ?? this.normalizePlanSlug(proPlanRecord?.name ?? 'pro') ?? 'pro';

    await this.storage.updateUser(userId, {
      plan: planSlug,
      planId: proPlanRecord?.id ?? null,
      proAccessCode: sanitizedCode,
    });

    return true;
  }

  // Check if user has Pro plan
  async hasProPlan(userId: string): Promise<boolean> {
    const resolved = await this.resolvePlanForUserId(userId);
    return resolved?.isProTier ?? false;
  }

  // Get user limits based on plan
  async getUserLimits(userId: string) {
    const user = await this.storage.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const normalizedUser = await ensureAdminRole(user, this.storage) ?? user;
    if (normalizedUser.role !== user.role) {
      await this.storage.updateUser(user.id, { role: normalizedUser.role });
    }

    // Get global platform settings for API providers and other global configs
    const settingsRecord = await this.storage.getPlatformSettings();
    const settings: PlatformSettingsData = structuredClone(settingsRecord.data);

    const resolvedPlan = await this.resolvePlanForUser(normalizedUser);
    const plan = resolvedPlan.record;

    if (!plan) {
      return {
        plan: 'free',
        messageLimitPerDay: 10,
        allowedModels: [],
        features: [] as string[],
        fileUploadLimitMb: 10,
        chatHistoryEnabled: true,
        knowledgeBase: {
          enabled: false,
          maxItems: 0,
          maxStorageMb: 0,
          allowUploads: false,
        },
        memory: {
          enabled: false,
          maxMemoriesPerUser: 0,
          retentionDays: settings.memory.retentionDays,
        },
        aiAgents: structuredClone(settings.aiAgents),
        templates: {
          enabled: false,
          maxTemplatesPerUser: 0,
          allowedTemplateIds: [],
        },
        projects: {
          enabled: false,
          maxProjectsPerUser: 0,
          maxMembersPerProject: settings.projects.maxMembersPerProject,
        },
        apiProviders: structuredClone(settings.apiProviders),
        legacyModels: [...(settings.legacyModels ?? [])],
        isAdmin: isAdminUser(normalizedUser),
      };
    }

    const planKey: 'free' | 'pro' | 'enterprise' = resolvedPlan.tier === 'enterprise'
      ? 'enterprise'
      : resolvedPlan.isProTier
        ? 'pro'
        : 'free';

    // Build features array based on plan database fields
    const features: string[] = [];
    if (plan.allowExperts) features.push('experts');
    if (plan.allowTemplates) features.push('templates');
    if (plan.allowAgents) features.push('agents');
    if (plan.allowApiAccess) features.push('api_access');

    // Add teams feature for Enterprise plan
    if (resolvedPlan.isEnterpriseTier) {
      features.push('teams');
    }

    const configuredFeatures = settings.planTiers?.[planKey]?.features ?? [];
    for (const featureId of configuredFeatures) {
      if (!features.includes(featureId)) {
        features.push(featureId);
      }
    }

    // Map plan fields to module settings
    const knowledgeBase = {
      enabled: plan.allowKbUser || plan.allowKbTeam || plan.allowKbOrg || plan.allowKbSystem,
      maxItems: 1000, // Default, could be made configurable per plan
      maxStorageMb: plan.storageQuotaGb ? plan.storageQuotaGb * 1024 : 1024,
      allowUploads: settings.knowledgeBase.allowUploads,
    };

    const memory = {
      enabled: plan.allowMemory,
      maxMemoriesPerUser: null, // Unlimited by default
      retentionDays: settings.memory.retentionDays,
    };

    const templates = {
      enabled: plan.allowTemplates,
      maxTemplatesPerUser: null, // Unlimited by default
      allowedTemplateIds: plan.templatesAllowed || [],
    };

    const projects = {
      enabled: true, // Projects enabled for all plans
      maxProjectsPerUser: null, // Unlimited by default
      maxMembersPerProject: settings.projects.maxMembersPerProject,
    };

    // Get allowed models from plan (empty array or null means all models allowed)
    const allowedModels = plan.modelsAllowed && plan.modelsAllowed.length > 0 
      ? plan.modelsAllowed 
      : []; // Empty array signals all models - will be expanded in getEffectiveCapabilities

    return {
      plan: planKey,
      messageLimitPerDay: plan.dailyMessageLimit,
      allowedModels: [...allowedModels],
      features,
      fileUploadLimitMb: plan.maxFileSizeMb ?? null,
      chatHistoryEnabled: true, // Always enabled
      knowledgeBase,
      memory,
      aiAgents: structuredClone(settings.aiAgents),
      templates,
      projects,
      apiProviders: structuredClone(settings.apiProviders),
      legacyModels: [...(settings.legacyModels ?? [])],
      isAdmin: isAdminUser(normalizedUser),
    };
  }

  async getEffectiveCapabilities(userId: string): Promise<EffectiveCapabilities> {
    const limits = await this.getUserLimits(userId);
    const settingsRecord = await this.storage.getPlatformSettings();
    const settings = structuredClone(settingsRecord.data);
    const planKey: 'free' | 'pro' | 'enterprise' = (['free','pro','enterprise'] as const).includes(limits.plan as any) ? (limits.plan as 'free'|'pro'|'enterprise') : 'free';
    
    // Get user's plan metadata for additional settings
    const resolvedPlan = await this.resolvePlanForUserId(userId);
    const userPlan = resolvedPlan?.record;

    // Expand empty modelsAllowed to mean "all models allowed"
    const expandedAllowedModels = limits.allowedModels.length === 0
      ? settings.planTiers[planKey]?.allowedModels ?? []
      : limits.allowedModels;

    const featureFlags = this.computeFeatureFlags(expandedAllowedModels, limits.features);
    const planAllowlistConfig = settings.planAllowlists?.[planKey] ?? { knowledgeBaseHosts: [] };
    const knowledgeBaseHosts = this.mergeKnowledgeAllowlists(
      this.getGlobalKnowledgeAllowlist(),
      planAllowlistConfig,
    );
    const teamPins = await this.storage.getUserTeamPins(userId);

    const teamsSettings = {
      enabled: (settings.teams?.enabled ?? false) && limits.features.includes('teams'),
      maxTeamsPerOrg: settings.teams?.maxTeamsPerOrg ?? null,
      maxMembersPerTeam: settings.teams?.maxMembersPerTeam ?? null,
      teamStorageQuotaMb: settings.teams?.teamStorageQuotaMb ?? null,
      teamApiUsageLimit: settings.teams?.teamApiUsageLimit ?? null,
    };

    // Build tier object from database plan
    const tier = userPlan ? {
      messageLimitPerDay: userPlan.dailyMessageLimit,
      allowedModels: limits.allowedModels,
      features: limits.features,
      fileUploadLimitMb: userPlan.maxFileSizeMb ?? null,
      chatHistoryEnabled: true,
      memoryEnabled: userPlan.allowMemory,
      maxMemoriesPerUser: null,
      templatesEnabled: userPlan.allowTemplates,
      maxTemplatesPerUser: null,
      allowedTemplateIds: userPlan.templatesAllowed || [],
      projectsEnabled: true,
      maxProjectsPerUser: null,
      knowledgeBaseEnabled: userPlan.allowKbUser || userPlan.allowKbTeam || userPlan.allowKbOrg || userPlan.allowKbSystem,
      maxKnowledgeItems: null,
      maxKnowledgeStorageMb: userPlan.storageQuotaGb ? userPlan.storageQuotaGb * 1024 : null,
      maxTeamsPerOrg: null,
      maxMembersPerTeam: null,
    } : settings.planTiers[planKey]; // Fallback to old settings if no plan found

    const featureSet = new Set(limits.features);
    const baseLimits = {
      daily_message_limit: limits.messageLimitPerDay ?? null,
      max_file_size_mb:
        limits.fileUploadLimitMb ?? (planKey === 'enterprise' ? 10 * 1024 : planKey === 'pro' ? 25 : 10),
      storage_quota_gb:
        userPlan?.storageQuotaGb ?? (planKey === 'enterprise' ? 100 : planKey === 'pro' ? 10 : 1),
    };

    const featuresConfig = {
      experts: {
        allowed: userPlan?.allowExperts ?? featureSet.has('experts'),
        upsell: userPlan ? Boolean(userPlan.showExpertsUpsell) : !featureSet.has('experts'),
      },
      templates: {
        allowed: userPlan?.allowTemplates ?? featureSet.has('templates'),
        upsell: userPlan ? Boolean(userPlan.showTemplatesUpsell) : !featureSet.has('templates'),
      },
      models: {
        allowed: userPlan?.allowModels ?? true,
      },
      kb: {
        system: userPlan?.allowKbSystem ?? false,
        team: userPlan?.allowKbTeam ?? false,
        user: userPlan?.allowKbUser ?? (limits.knowledgeBase?.enabled ?? false),
      },
      memory: userPlan?.allowMemory ?? (limits.memory?.enabled ?? false),
      agents: userPlan?.allowAgents ?? (limits.aiAgents?.enabled ?? false),
      api_access: {
        allowed: userPlan?.allowApiAccess ?? featureSet.has('api_access'),
        upsell: userPlan ? Boolean(userPlan.showApiUpsell) : !featureSet.has('api_access'),
      },
    };

    const normalizeIds = (ids?: string[] | null) =>
      Array.isArray(ids)
        ? ids
            .filter((value): value is string => typeof value === 'string')
            .map(value => value.trim())
            .filter(value => value.length > 0)
        : [];

    const allowlists = {
      experts: normalizeIds(userPlan?.expertsAllowed),
      templates: normalizeIds(userPlan?.templatesAllowed),
      models: normalizeIds(userPlan?.modelsAllowed),
    };

    const teamsConfig = {
      enabled: resolvedPlan?.isEnterpriseTier ?? featureSet.has('teams'),
      maxTeamsPerOrg: settings.teams?.maxTeamsPerOrg ?? 0,
      maxMembersPerTeam: settings.teams?.maxMembersPerTeam ?? 0,
    };

    const planId = resolvedPlan?.planId ?? userPlan?.id ?? null;
    const planSlug = this.normalizePlanSlug(resolvedPlan?.slug ?? resolvedPlan?.label ?? planKey) ?? planKey;
    const planLabel = resolvedPlan?.label ?? this.formatPlanLabel(planSlug);
    const planTier = resolvedPlan?.tier ?? planKey;
    const planIsPro = resolvedPlan?.isProTier ?? (planTier !== 'free');

    const coreCapabilities = effectiveCapabilitiesSchema.parse({
      plan: {
        id: planId ?? planSlug,
        name: planLabel,
        slug: planSlug,
        tier: planTier,
        isProTier: planIsPro,
      },
      limits: baseLimits,
      features: featuresConfig,
      allowlists,
      teams: teamsConfig,
    });

    const payload = {
      ...coreCapabilities,
      plan: {
        ...coreCapabilities.plan,
        label: planLabel,
      },
      limits: {
        ...coreCapabilities.limits,
        messageLimitPerDay: limits.messageLimitPerDay,
        fileUploadLimitMb: limits.fileUploadLimitMb ?? coreCapabilities.limits.max_file_size_mb,
        storageQuotaGb: userPlan?.storageQuotaGb ?? coreCapabilities.limits.storage_quota_gb,
        chatHistoryEnabled: limits.chatHistoryEnabled ?? true,
      },
      models: {
        allowed: [...expandedAllowedModels],
        legacy: [...(limits.legacyModels ?? [])],
      },
      // Using structured features object from coreCapabilities above

      featureFlags,
      modules: {
        knowledgeBase: structuredClone(limits.knowledgeBase),
        memory: structuredClone(limits.memory),
        aiAgents: structuredClone(limits.aiAgents),
        templates: structuredClone(limits.templates),
        projects: structuredClone(limits.projects),
        teams: teamsSettings,
      },
      allowlists: {
        ...coreCapabilities.allowlists,
        knowledgeBaseHosts,
      },
      pins: {
        teams: teamPins,
      },
      apiProviders: structuredClone(limits.apiProviders),
      isAdmin: limits.isAdmin,
    };

    return payload;
  }

  // Middleware to check if user is authenticated
  async requireAuth(req: Request, res: Response, next: NextFunction) {
    if (!req.session?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await this.storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const normalized = await ensureAdminRole(user, this.storage);
    let effectiveUser = normalized ?? user;

    if (normalized && normalized.role !== user.role) {
      const updated = await this.storage.updateUser(user.id, { role: normalized.role });
      effectiveUser = updated ?? normalized;
    }

    const status = effectiveUser.status ?? 'active';
    if (status !== 'active') {
      const message = status === 'suspended'
        ? 'Account suspended. Please contact support.'
        : 'Account is inactive.';
      return res.status(403).json({ error: message });
    }

    const resolvedPlan = await this.resolvePlanForUser(effectiveUser);
    const requestUser = { ...effectiveUser };
    if (resolvedPlan.slug && requestUser.plan !== resolvedPlan.slug) {
      requestUser.plan = resolvedPlan.slug as User['plan'];
    }

    (req as any).user = requestUser;
    (req as any).resolvedPlan = resolvedPlan;
    next();
  }

  // Middleware to check if user has Pro plan
  async requireProPlan(req: Request, res: Response, next: NextFunction) {
    const userId = req.session?.userId || (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const resolvedPlan = (req as any).resolvedPlan as ResolvedPlanMetadata | undefined
      ?? await this.resolvePlanForUserId(userId);
    const hasPro = resolvedPlan?.isProTier ?? false;
    if (!hasPro) {
      return res.status(403).json({
        error: 'Pro plan required',
        message: 'This feature requires a Pro subscription'
      });
    }

    next();
  }

  async requireAdmin(req: Request, res: Response, next: NextFunction) {
    return this.requireAdminGuard(req, res, next);
  }

  createRoleGuard(allowedRoles: ('user'|'admin'|'super_admin')[]): RequestHandler {
    return requireRole(allowedRoles, this.storage);
  }

  // Rate limiting for free users
  async checkRateLimit(userId: string): Promise<{ allowed: boolean; remaining: number; limit: number }> {
    const limits = await this.getUserLimits(userId);

    if (limits.messageLimitPerDay === null) {
      return { allowed: true, remaining: Infinity, limit: Infinity };
    }

    // Get today's usage count
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const messages = await this.storage.getMessagesSince(userId, today);
    const used = messages.length;
    const remaining = Math.max(0, (limits.messageLimitPerDay ?? 0) - used);

    return {
      allowed: remaining > 0,
      remaining,
      limit: limits.messageLimitPerDay ?? Infinity
    };
  }
}

// Session type definition
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    username?: string;
    csrfToken?: string;
  }
}

declare module 'express-serve-static-core' {
  interface Request {
    resolvedPlan?: ResolvedPlanMetadata;
  }
}




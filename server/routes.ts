import type { Express, Request, Response, NextFunction } from "express";
import type {
  ProCoupon,
  InsertProCoupon,
  Template,
  InsertTemplate,
  OutputTemplate,
  OutputTemplateValidation,
  User,
  ToolPolicy,
  InsertToolPolicy,
  UpdateToolPolicy,
  Release,
  Model,
  InsertModel,
  UpdateModel,
} from "../shared/schema.js";
import { createServer, type Server } from "http";
import { randomUUID, randomBytes } from "crypto";
import { storage as defaultStorage } from "./storage/index.js";
import type { IStorage } from "./storage/index.js";
import { fileAnalysisService } from "./file-analysis.js";
import {
  insertChatSchema,
  insertMessageSchema,
  attachmentSchema,
  insertReactionSchema,
  reactionTypeSchema,
  insertKnowledgeItemSchema,
  insertProjectSchema,
  insertProjectKnowledgeSchema,
  insertProjectFileSchema,
  apiProviderSchema,
  platformSettingsDataSchema,
  defaultPlatformSettings,
  n8nAgentStatusSchema,
  proCouponCreateSchema,
  proCouponUpdateSchema,
  proCouponCodeSchema,
  userStatusSchema,
  userRoleSchema,
  adminAuditActionSchema,
  systemPromptCreateSchema,
  systemPromptUpdateSchema,
  insertExpertSchema,
  updateExpertSchema,
  toolPolicyCreateSchema,
  toolPolicyUpdateSchema,
  outputTemplateSectionSchema,
  outputTemplateCategorySchema,
  outputTemplateFormatSchema,
  type AdminAuditLog,
  type SystemPrompt,
  releaseCreateSchema,
  releaseTransitionSchema,
  insertModelSchema,
  updateModelSchema,
} from "../shared/schema.js";
import { z } from "zod";
import { GoogleDriveService } from "./google-drive.js";
import { AIService } from "./ai-service.js";
import { AuthService, CouponRedemptionError, type ResolvedPlanMetadata } from "./auth-service.js";
import { setupAuth, isAuthenticated } from "./localAuth.js";
import passport from "passport";
import { transcribeAudio } from "./groq-whisper.js";
import { checkNotionConnection, getNotionDatabases, getNotionPages, NOTION_NOT_CONNECTED_ERROR } from "./notion-service.js";
import { ghlEmailService } from "./ghl-email.js";
import { FileQuotaExceededError } from "./storage/file-store.js";
import { createRateLimiter } from "./rate-limit.js";
import { fetchWithSsrfProtection, UnsafeRemoteURLError } from "./security/safe-fetch.js";
import { ensureAdminRole } from "./security/admin.js";
import { attachCsrfToken, verifyCsrfToken } from "./security/csrf.js";
import { secureCompare, generateCsrfToken } from "./security/secure-compare.js";
import { requirePermission, requireAnyPermission } from "./security/permissions.js";
import { PERMISSIONS } from "../shared/constants.js";
import { getModelConfig, getDefaultModel } from "./ai-models.js";
import { buildUsageSummary } from "./usage/analytics.js";
import { buildOutputTemplateInstruction, validateOutputTemplateContent } from "./output-template-utils.js";
import { MIGRATION_GUIDANCE_MESSAGE, isUndefinedTableError } from "./storage/errors.js";
import {
  trackFeatureBlocked,
  trackFeatureUsed,
  auditPlanModification,
  type FeatureContext,
  type FeaturePlanContext,
  type PlanChangeSnapshot,
} from "./analytics.js";
import { resolvePlanByIdentifier } from "./plans/plan-registry.js";

const FREE_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const PRO_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const REMOTE_CONTENT_BYTE_LIMIT = 2 * 1024 * 1024;
const DEFAULT_N8N_BASE_URL = 'https://zap.c4saas.com';
const TEMPLATE_FILE_OWNER = 'admin-templates';
const TEMPLATE_MAX_SIZE_BYTES = 5 * 1024 * 1024;

const normalizePlanSlugValue = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
};

const isResolvedPlanMetadata = (value: unknown): value is ResolvedPlanMetadata => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return typeof (value as ResolvedPlanMetadata).slug === 'string' && 'planId' in value;
};

const toFeaturePlanContext = (
  plan?:
    | ResolvedPlanMetadata
    | {
        id?: string | null;
        slug?: string | null;
        name?: string | null;
        label?: string | null;
        isProTier?: boolean | null;
      },
): FeaturePlanContext | undefined => {
  if (!plan) {
    return undefined;
  }

  if (isResolvedPlanMetadata(plan)) {
    return {
      id: plan.planId ?? null,
      slug: normalizePlanSlugValue(plan.slug) ?? null,
      label: plan.label ?? null,
      isProTier: plan.isProTier ?? undefined,
    };
  }

  const slug = normalizePlanSlugValue(plan.slug ?? plan.name ?? plan.label ?? null);
  const label = typeof plan.label === 'string' ? plan.label : plan.name ?? null;
  return {
    id: plan.id ?? null,
    slug,
    label,
    isProTier: plan.isProTier ?? undefined,
  };
};

function respondWithMissingTables(res: Response, error: unknown, context: string): boolean {
  if (!isUndefinedTableError(error)) {
    return false;
  }

  console.error(`Database schema missing while attempting to ${context}:`, error);
  res.status(503).json({
    error: 'Database not initialized',
    detail: MIGRATION_GUIDANCE_MESSAGE,
    context,
  });
  return true;
}

const updateProjectSchema = insertProjectSchema.pick({
  name: true,
  description: true,
  customInstructions: true,
  includeGlobalKnowledge: true,
  includeUserMemories: true,
}).partial();

export async function registerRoutes(app: Express, storage: IStorage = defaultStorage): Promise<Server> {
  // Setup Local Auth
  await setupAuth(app);
  app.use(attachCsrfToken);
  app.use(verifyCsrfToken);
  
  // Initialize services
  const aiService = new AIService(storage);
  const authService = new AuthService(storage);

  // Use Local Auth middleware
  const requireAuth = isAuthenticated;
  const requireProPlan = authService.requireProPlan.bind(authService);
  const requireAdmin = authService.createRoleGuard(['admin', 'super_admin']);
  const requireSuperAdmin = authService.createRoleGuard(['super_admin']);
  const uploadRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: {
      error: 'Too many uploads from this IP, please try again later.'
    }
  });
  const fileAccessRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 30,
  });

  const toIsoString = (value: Date | string | null | undefined): string | null => {
    if (!value) {
      return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString();
  };

  const parseDateParam = (value: unknown): Date | undefined => {
    if (!value || typeof value !== 'string') {
      return undefined;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  };

  const ensureIsoString = (value: Date | string | null | undefined): string =>
    toIsoString(value) ?? new Date().toISOString();

  const findUserN8nAgent = async (userId: string, agentId: string) => {
    const agents = await storage.getN8nAgents(userId);
    return agents.find(agent => agent.id === agentId);
  };

  const formatToolPolicy = (policy: ToolPolicy) => ({
    id: policy.id,
    provider: policy.provider,
    toolName: policy.toolName,
    isEnabled: policy.isEnabled,
    safetyNote: policy.safetyNote ?? null,
    createdAt: ensureIsoString(policy.createdAt),
    updatedAt: ensureIsoString(policy.updatedAt),
  });

  const isToolPolicyConflictError = (error: unknown): boolean => {
    if (!error || typeof error !== 'object') {
      return false;
    }
    const err = error as { code?: string; constraint?: string; message?: string };
    if (err.code === '23505') {
      return true;
    }
    if (err.constraint && err.constraint.includes('tool_policies_provider_tool_name_idx')) {
      return true;
    }
    if (typeof err.message === 'string' && err.message === 'TOOL_POLICY_CONFLICT') {
      return true;
    }
    return false;
  };

  const serializeCoupon = (coupon: ProCoupon) => ({
    id: coupon.id,
    code: coupon.code,
    label: coupon.label ?? null,
    description: coupon.description ?? null,
    maxRedemptions: coupon.maxRedemptions ?? null,
    redemptionCount: coupon.redemptionCount,
    expiresAt: toIsoString(coupon.expiresAt),
    isActive: coupon.isActive,
    createdAt: toIsoString((coupon as any).createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString((coupon as any).updatedAt) ?? new Date().toISOString(),
  });

  const formatUserDisplayName = (user: User): string => {
    const nameParts = [user.firstName, user.lastName].filter((part): part is string => Boolean(part));
    if (nameParts.length > 0) {
      return nameParts.join(' ');
    }
    if (user.username) {
      return user.username;
    }
    if (user.email) {
      return user.email;
    }
    return 'User';
  };

  const formatPlanDisplayLabel = (value?: string | null): string | null => {
    if (!value) {
      return null;
    }

    const segments = value
      .split(/[-_\s]+/)
      .map(segment => segment.trim())
      .filter(Boolean);

    if (segments.length === 0) {
      return null;
    }

    return segments.map(segment => segment.charAt(0).toUpperCase() + segment.slice(1)).join(' ');
  };

  const buildPlanAuditSnapshot = (options: {
    meta?: ResolvedPlanMetadata | null;
    plan?: {
      id?: string | null;
      slug?: string | null;
      name?: string | null;
      label?: string | null;
      isProTier?: boolean | null;
    } | null;
    fallback?: { plan?: string | null; planId?: string | null };
    metadata?: Record<string, unknown>;
  }): PlanChangeSnapshot => {
    const { meta, plan, fallback, metadata } = options;

    if (meta) {
      const slug = normalizePlanSlugValue(meta.slug) ?? null;
      const label = meta.label ?? formatPlanDisplayLabel(slug);
      return {
        planId: meta.planId ?? null,
        planSlug: slug,
        planLabel: label,
        planTier: meta.tier ?? null,
        isProTier: meta.isProTier ?? undefined,
        ...(metadata ?? {}),
      };
    }

    if (plan) {
      const slug = normalizePlanSlugValue(plan.slug ?? plan.name ?? null);
      const label = plan.label ?? plan.name ?? formatPlanDisplayLabel(slug);
      return {
        planId: plan.id ?? null,
        planSlug: slug,
        planLabel: label,
        isProTier: plan.isProTier ?? undefined,
        ...(metadata ?? {}),
      };
    }

    const slug = normalizePlanSlugValue(fallback?.plan ?? null);
    const label = formatPlanDisplayLabel(fallback?.plan ?? slug);

    return {
      planId: fallback?.planId ?? null,
      planSlug: slug,
      planLabel: label,
      ...(metadata ?? {}),
    };
  };

  const serializeAdminUser = async (user: User) => {
    const planMeta = await authService.getResolvedPlanMetadataForUserId(user.id);
    const planRecord = planMeta?.record ?? (user.planId ? await storage.getPlan(user.planId).catch(() => undefined) : undefined);
    const normalizedSlug = planMeta?.slug
      ?? normalizePlanSlugValue(planRecord?.slug ?? planRecord?.name ?? user.plan)
      ?? 'free';
    const planLabel = planMeta?.label
      ?? planRecord?.name
      ?? formatPlanDisplayLabel(normalizedSlug)
      ?? 'No plan';
    const planMetadata = planMeta
      ? {
          id: planMeta.planId ?? null,
          slug: normalizePlanSlugValue(planMeta.slug) ?? normalizedSlug,
          label: planLabel,
          tier: planMeta.tier,
          isProTier: planMeta.isProTier,
        }
      : {
          id: planRecord?.id ?? user.planId ?? null,
          slug: normalizedSlug,
          label: planLabel,
          tier: planRecord?.isProTier ? 'pro' : null,
          isProTier: planRecord?.isProTier ?? undefined,
        };

    return {
      id: user.id,
      name: formatUserDisplayName(user),
      email: user.email ?? null,
      username: user.username ?? null,
      plan: normalizedSlug,
      planMetadata,
      role: user.role,
      status: user.status ?? 'active',
      createdAt: toIsoString((user as any).createdAt) ?? new Date().toISOString(),
      updatedAt: toIsoString((user as any).updatedAt) ?? new Date().toISOString(),
    };
  };

  type AdminAuditAction = z.infer<typeof adminAuditActionSchema>;

  const serializeAuditLog = (log: AdminAuditLog) => ({
    id: log.id,
    action: log.action,
    actorUserId: log.actorUserId ?? null,
    targetUserId: log.targetUserId,
    metadata: log.metadata ?? {},
    createdAt: toIsoString((log as any).createdAt) ?? new Date().toISOString(),
  });

  const recordAuditEvent = async (
    action: AdminAuditAction,
    targetUserId: string,
    actorUserId: string | null,
    metadata?: Record<string, unknown>,
  ) => {
    try {
      await storage.createAdminAuditLog({
        action,
        targetUserId,
        actorUserId: actorUserId ?? null,
        metadata: metadata ?? {},
      });
    } catch (error) {
      console.error('Failed to record admin audit event:', error);
    }
  };

  const serializeTemplate = (template: Template) => ({
    id: template.id,
    name: template.name,
    description: template.description ?? null,
    fileName: template.fileName,
    mimeType: template.mimeType,
    fileSize: template.fileSize,
    availableForFree: template.availableForFree,
    availableForPro: template.availableForPro,
    isActive: template.isActive,
    fileId: template.fileId,
    createdAt: toIsoString((template as any).createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString((template as any).updatedAt) ?? new Date().toISOString(),
  });

  const isTemplateAllowedByRelease = (templateId: string, release?: Release | null): boolean => {
    if (!release) {
      return true;
    }

    const allowedIds = (release.templateIds ?? []).filter((id): id is string => Boolean(id));
    if (allowedIds.length === 0) {
      return false;
    }

    return allowedIds.includes(templateId);
  };

  const isTemplateAccessibleToUser = (
    template: Template,
    plan: ResolvedPlanMetadata | undefined,
    release?: Release | null,
  ): boolean => {
    if (!template.isActive) {
      return false;
    }

    if (!isTemplateAllowedByRelease(template.id, release)) {
      return false;
    }

    const isProTier = plan?.isProTier ?? false;
    if (isProTier) {
      return Boolean(template.availableForPro);
    }

    return Boolean(template.availableForFree);
  };

  const serializeOutputTemplate = (template: OutputTemplate) => ({
    id: template.id,
    name: template.name,
    category: template.category,
    format: template.format,
    description: template.description ?? null,
    instructions: template.instructions ?? null,
    requiredSections: Array.isArray(template.requiredSections) ? template.requiredSections : [],
    isActive: template.isActive,
    createdAt: toIsoString((template as any).createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString((template as any).updatedAt) ?? new Date().toISOString(),
  });

  const serializeSystemPrompt = (prompt: SystemPrompt) => ({
    id: prompt.id,
    version: prompt.version,
    label: prompt.label ?? null,
    content: prompt.content,
    notes: prompt.notes ?? null,
    createdByUserId: prompt.createdByUserId ?? null,
    activatedByUserId: prompt.activatedByUserId ?? null,
    isActive: prompt.isActive,
    createdAt: toIsoString((prompt as any).createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString((prompt as any).updatedAt) ?? new Date().toISOString(),
    activatedAt: toIsoString((prompt as any).activatedAt) ?? null,
  });

  const formatBytes = (bytes: number): string => {
    if (!Number.isFinite(bytes)) {
      return 'unlimited';
    }

    if (bytes >= 1024 * 1024 * 1024) {
      return `${Math.round(bytes / (1024 * 1024 * 1024))}GB`;
    }

    if (bytes >= 1024 * 1024) {
      return `${Math.round(bytes / (1024 * 1024))}MB`;
    }

    if (bytes >= 1024) {
      return `${Math.round(bytes / 1024)}KB`;
    }

    return `${bytes}B`;
  };

  const serializeRelease = (release: Release) => ({
    id: release.id,
    version: release.version,
    label: release.label,
    status: release.status,
    changeNotes: release.changeNotes ?? null,
    systemPromptId: release.systemPromptId ?? null,
    expertIds: Array.isArray(release.expertIds) ? release.expertIds : [],
    templateIds: Array.isArray(release.templateIds) ? release.templateIds : [],
    outputTemplateIds: Array.isArray(release.outputTemplateIds) ? release.outputTemplateIds : [],
    toolPolicyIds: Array.isArray(release.toolPolicyIds) ? release.toolPolicyIds : [],
    isActive: release.isActive ?? false,
    publishedAt: toIsoString((release as any).publishedAt) ?? null,
    createdAt: toIsoString((release as any).createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString((release as any).updatedAt) ?? new Date().toISOString(),
  });

  const templateFileSchema = z.object({
    name: z.string().min(1, 'File name is required').max(255),
    mimeType: z.string().min(1, 'MIME type is required'),
    data: z.string().min(1, 'File data is required'),
  });

  const templateCreateSchema = z.object({
    name: z.string().min(1, 'Template name is required').max(120),
    description: z.string().max(500).optional().nullable(),
    availableForFree: z.boolean().optional(),
    availableForPro: z.boolean().optional(),
    isActive: z.boolean().optional(),
    file: templateFileSchema,
  });

  const templateUpdateSchema = z.object({
    name: z.string().min(1, 'Template name is required').max(120).optional(),
    description: z.string().max(500).optional().nullable(),
    availableForFree: z.boolean().optional(),
    availableForPro: z.boolean().optional(),
    isActive: z.boolean().optional(),
    file: templateFileSchema.optional(),
  });

  const outputTemplateSectionInputSchema = outputTemplateSectionSchema;

  const outputTemplateSectionsArraySchema = z
    .array(outputTemplateSectionInputSchema)
    .min(1, 'At least one required section must be provided')
    .refine((sections) => {
      const keys = new Set(sections.map(section => section.key.trim().toLowerCase()));
      return keys.size === sections.length;
    }, { message: 'Section keys must be unique' })
    .refine((sections) => {
      const titles = new Set(sections.map(section => section.title.trim().toLowerCase()));
      return titles.size === sections.length;
    }, { message: 'Section titles must be unique' });

  const outputTemplateCreateSchema = z.object({
    name: z.string().min(1, 'Template name is required').max(160),
    category: outputTemplateCategorySchema,
    format: outputTemplateFormatSchema,
    description: z.string().max(500).optional().nullable(),
    instructions: z.string().max(2000).optional().nullable(),
    requiredSections: outputTemplateSectionsArraySchema,
    isActive: z.boolean().optional(),
  });

  const outputTemplateUpdateSchema = z.object({
    name: z.string().min(1).max(160).optional(),
    category: outputTemplateCategorySchema.optional(),
    format: outputTemplateFormatSchema.optional(),
    description: z.string().max(500).optional().nullable(),
    instructions: z.string().max(2000).optional().nullable(),
    requiredSections: outputTemplateSectionsArraySchema.optional(),
    isActive: z.boolean().optional(),
  });

  const updateUserStatusSchema = z.object({
    status: userStatusSchema,
  });
  const updateUserRoleSchema = z.object({
    role: userRoleSchema,
  });

  const createN8nAgentSchema = z.object({
    workflowId: z.string().min(1, 'Workflow ID is required'),
    name: z.string().min(1, 'Agent name is required'),
    description: z.string().optional(),
    status: n8nAgentStatusSchema.optional(),
    webhookUrl: z.string().url('Webhook URL must be a valid URL').optional(),
    metadata: z.record(z.any()).optional(),
  });

  const chatMetadataSchema = z.object({
    deepVoyageEnabled: z.boolean().optional(),
    taskSummary: z
      .string()
      .max(240, 'Task summary must be 240 characters or fewer')
      .optional(),
    outputTemplateId: z.string().uuid('Output template id must be a valid UUID').optional(),
  });

  class HttpError extends Error {
    status: number;
    detail?: unknown;

    constructor(status: number, message: string, detail?: unknown) {
      super(message);
      this.status = status;
      this.detail = detail;
    }
  }

  type PreparedChatRequest = {
    userId: string;
    model: string;
    chatId?: string;
    expertId?: string | null;
    metadata?: z.infer<typeof chatMetadataSchema>;
    outputTemplate?: OutputTemplate;
    validatedAttachments?: z.infer<typeof attachmentSchema>[];
    enrichedMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    lastMessage: { role: string; content: string };
    hasAttachments: boolean;
    hasContent: boolean;
    chatProjectId: string | null;
    shouldCallAI: boolean;
  };

  async function prepareChatCompletionRequest(req: Request): Promise<PreparedChatRequest> {
    const { model, messages, chatId, attachments, metadata: rawMetadata, expertId } = req.body ?? {};
    const userId = (req as any).user?.id;
    const planMeta = (req as any).resolvedPlan as ResolvedPlanMetadata | undefined;
    const resolvePlanContext = (
      fallback?: {
        id?: string | null;
        slug?: string | null;
        name?: string | null;
        label?: string | null;
        isProTier?: boolean | null;
      },
    ) => toFeaturePlanContext(planMeta ?? fallback);

    if (!userId) {
      throw new HttpError(401, 'Unauthorized');
    }

    // Validate model selection based on user's plan
    if (model) {
      const availableModels = await storage.getAvailableModels(userId);
      const modelIds = availableModels.map(m => m.modelId);
      const userPlan = planMeta?.record ?? (await storage.getUserPlan(userId));
      const userPlanContext = resolvePlanContext(
        userPlan
          ? {
              id: userPlan.id ?? null,
              slug: userPlan.slug ?? null,
              name: userPlan.name ?? null,
              label: userPlan.name ?? null,
              isProTier: userPlan.isProTier ?? null,
            }
          : undefined,
      );

      if (!modelIds.includes(model)) {
        // Track blocked model usage
        await trackFeatureBlocked(storage, userId, 'model_usage', `Model ${model} not available on plan`, {
          model,
          provider: model.split(':')[0], // Extract provider from model ID
          plan: userPlanContext,
        });

        // Try to get the first available model as default
        const defaultModel = availableModels[0];
        if (!defaultModel) {
          throw new HttpError(403, 'No models are available for your plan. Please contact support.');
        }
        
        // Log the model substitution for debugging
        console.log(`Model '${model}' not available for user ${userId}, using default: ${defaultModel.modelId}`);
        req.body.model = defaultModel.modelId;
      } else {
        // Track successful model usage
        await trackFeatureUsed(storage, userId, 'model_usage', `Model ${model} selected`, {
          model,
          provider: model.split(':')[0],
          plan: userPlanContext,
        });
      }
    }

    // Validate expert usage based on user's plan
    if (expertId) {
      const plan = await storage.getUserPlanWithDetails(userId);
      const planContext = resolvePlanContext(
        plan
          ? {
              id: plan.id ?? null,
              slug: plan.slug ?? null,
              name: plan.name ?? null,
              label: plan.name ?? null,
              isProTier: plan.isProTier ?? null,
            }
          : undefined,
      );

      if (!plan || !plan.allowExperts) {
        // Track blocked expert usage
        await trackFeatureBlocked(storage, userId, 'expert_usage', 'Plan does not include expert access', {
          expertId,
          plan: planContext,
        });
        throw new HttpError(403, 'Your plan does not include access to AI Experts. Please upgrade to Pro or Enterprise.');
      }

      // Check if the specific expert is allowed
      if (plan.expertsAllowed && plan.expertsAllowed.length > 0) {
        if (!plan.expertsAllowed.includes(expertId)) {
          // Track blocked specific expert
          await trackFeatureBlocked(storage, userId, 'expert_usage', 'Expert not available on plan', {
            expertId,
            plan: planContext,
          });
          throw new HttpError(403, 'This expert is not available on your plan.');
        }
      }

      // Verify the expert exists and is active
      const expert = await storage.getExpert(expertId);
      if (!expert || !expert.isActive) {
        throw new HttpError(404, 'Expert not found or is not active.');
      }
      
      // Track successful expert usage
      await trackFeatureUsed(storage, userId, 'expert_usage', `Expert ${expert.name} selected`, {
        expertId,
        plan: planContext,
      });
    }

    let metadata: z.infer<typeof chatMetadataSchema> | undefined;

    if (rawMetadata) {
      const metadataValidation = chatMetadataSchema.safeParse(rawMetadata);
      if (!metadataValidation.success) {
        throw new HttpError(400, 'Invalid metadata format', metadataValidation.error.errors);
      }

      const { taskSummary, ...rest } = metadataValidation.data;
      const trimmedTaskSummary = taskSummary?.trim() || '';
      metadata = {
        ...rest,
        ...(trimmedTaskSummary ? { taskSummary: trimmedTaskSummary } : {}),
      };
    }

    const rateLimit = await authService.checkRateLimit(userId);
    if (!rateLimit.allowed) {
      throw new HttpError(429, 'Rate limit exceeded', {
        message: `You have reached your daily message limit (${rateLimit.limit}/day). Upgrade to Pro for unlimited messages.`,
        remaining: rateLimit.remaining,
        limit: rateLimit.limit,
      });
    }

    if (!model || !messages || !Array.isArray(messages)) {
      throw new HttpError(400, 'Missing required fields: model, messages');
    }

    const modelConfig = getModelConfig(model);
    const isProTier = planMeta?.isProTier ?? false;

    if (!modelConfig) {
      throw new HttpError(400, 'Invalid model selection');
    }

    if (!isProTier && modelConfig.provider !== 'groq') {
      throw new HttpError(403, 'Upgrade required', {
        message: 'Free plan users can only access Groq models. Upgrade to Pro for OpenAI, Claude, and Perplexity.',
      });
    }

    let validatedAttachments: z.infer<typeof attachmentSchema>[] | undefined;
    if (attachments) {
      if (!Array.isArray(attachments)) {
        throw new HttpError(400, 'Attachments must be an array');
      }

      try {
        validatedAttachments = z.array(attachmentSchema).parse(attachments);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new HttpError(400, 'Invalid attachment data', error.errors);
        }
        throw error;
      }
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) {
      throw new HttpError(400, 'Messages array must contain at least one entry');
    }

    const hasContent = Boolean(lastMessage.content && lastMessage.content.trim());
    const hasAttachments = Boolean(validatedAttachments && validatedAttachments.length > 0);

    let chatProjectId: string | null = null;
    if (chatId) {
      const chat = await storage.getChat(chatId);
      if (!chat) {
        throw new HttpError(404, 'Chat not found');
      }

      if (chat.userId !== userId) {
        throw new HttpError(403, 'Access denied: You do not own this chat');
      }

      chatProjectId = chat.projectId || null;
    }

    const enrichedMessages = [...messages];
    const fileAnalysisPrompts: string[] = [];

    if (hasAttachments && validatedAttachments) {
      for (const attachment of validatedAttachments) {
        const file = await storage.getFileForUser(attachment.id, userId);

        if (!file) {
          throw new HttpError(404, 'Attachment not found');
        }

        if (file.analyzedContent) {
          fileAnalysisPrompts.push(`
File: ${file.name} (${file.mimeType})
Content:
${file.analyzedContent}
${file.metadata?.summary ? `\nSummary: ${file.metadata.summary}` : ''}`.trim());
        }
      }

      if (fileAnalysisPrompts.length > 0) {
        const lastUserMessage = enrichedMessages[enrichedMessages.length - 1];
        const fileContent = fileAnalysisPrompts.join('\n\n---\n\n');
        const contentPrefix = lastUserMessage.content?.trim()
          ? lastUserMessage.content
          : 'Please analyze the attached files:';

        const newContent = `${contentPrefix}\n\nAttached Files:\n${fileContent}`;
        enrichedMessages[enrichedMessages.length - 1] = {
          role: lastUserMessage.role,
          content: newContent,
        };
      }
    }

    let outputTemplate: OutputTemplate | undefined;

    if (metadata?.outputTemplateId) {
      const template = await storage.getOutputTemplate(metadata.outputTemplateId);
      if (!template || !template.isActive) {
        throw new HttpError(400, 'Selected output template is not available');
      }

      // Validate that the user's plan allows templates
      const userPlan = await storage.getUserPlan(userId);
      const planContext = resolvePlanContext(
        userPlan
          ? {
              id: userPlan.id ?? null,
              slug: userPlan.slug ?? null,
              name: userPlan.name ?? null,
              label: userPlan.name ?? null,
              isProTier: userPlan.isProTier ?? null,
            }
          : undefined,
      );
      if (userPlan && !userPlan.allowTemplates) {
        // Track blocked template usage
        await trackFeatureBlocked(storage, userId, 'template_usage', 'Plan does not include template access', {
          templateId: metadata.outputTemplateId,
          plan: planContext,
        });
        throw new HttpError(403, 'Your plan does not allow using output templates. Please upgrade to access this feature.');
      }

      // Get the list of available templates for this user and check if this template is allowed
      const availableTemplates = await storage.getAvailableOutputTemplates(userId);
      const isTemplateAllowed = availableTemplates.some(t => t.id === template.id);
      if (!isTemplateAllowed) {
        // Track blocked specific template
        await trackFeatureBlocked(storage, userId, 'template_usage', 'Template not available on plan', {
          templateId: metadata.outputTemplateId,
          plan: planContext,
        });
        throw new HttpError(403, 'This output template is not available for your plan');
      }

      outputTemplate = template;

      // Track successful template usage
      await trackFeatureUsed(storage, userId, 'template_usage', `Template ${template.name} applied`, {
        templateId: template.id,
        plan: planContext,
      });
      const instruction = buildOutputTemplateInstruction(template);
      enrichedMessages.unshift({
        role: 'system',
        content: instruction,
      });
    }

    const shouldCallAI = hasContent || (hasAttachments && fileAnalysisPrompts.length > 0);

    return {
      userId,
      model,
      chatId: chatId || undefined,
      expertId: expertId || null,
      metadata,
      outputTemplate,
      validatedAttachments,
      enrichedMessages,
      lastMessage: {
        role: lastMessage.role,
        content: lastMessage.content || '',
      },
      hasAttachments,
      hasContent,
      chatProjectId,
      shouldCallAI,
    };
  }

  function buildAssistantMetadata(options: {
    baseMetadata?: z.infer<typeof chatMetadataSchema>;
    outputTemplate?: OutputTemplate;
    executedTools?: string[];
    thinkingContent?: string;
    validation?: OutputTemplateValidation | null;
  }): Record<string, unknown> | undefined {
    const { baseMetadata, outputTemplate, executedTools, thinkingContent, validation } = options;
    const metadata: Record<string, unknown> = {};

    if (baseMetadata?.deepVoyageEnabled) {
      metadata.deepVoyageEnabled = true;
    }

    if (baseMetadata?.taskSummary) {
      metadata.taskSummary = baseMetadata.taskSummary;
    }

    if (outputTemplate) {
      metadata.outputTemplateId = outputTemplate.id;
      metadata.outputTemplateName = outputTemplate.name;
      metadata.outputTemplateCategory = outputTemplate.category;
      metadata.outputTemplateFormat = outputTemplate.format;
    } else if (baseMetadata?.outputTemplateId) {
      metadata.outputTemplateId = baseMetadata.outputTemplateId;
    }

    if (executedTools && executedTools.length > 0) {
      metadata.executedTools = executedTools;
    }

    if (thinkingContent) {
      metadata.thinkingContent = thinkingContent;
    }

    if (validation) {
      metadata.outputTemplateValidation = validation;
    }

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  async function persistChatMessages(options: {
    chatId?: string;
    userId: string;
    metadata?: z.infer<typeof chatMetadataSchema>;
    validatedAttachments?: z.infer<typeof attachmentSchema>[];
    hasAttachments: boolean;
    lastMessageContent: string;
    model: string;
    responseContent?: string | null;
    responseMetadata?: Record<string, unknown>;
    usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  }): Promise<void> {
    const {
      chatId,
      userId,
      metadata,
      validatedAttachments,
      hasAttachments,
      lastMessageContent,
      model,
      responseContent,
      responseMetadata,
      usage,
    } = options;

    if (!chatId) {
      return;
    }

    try {
      const existingChat = await storage.getChat(chatId);
      if (!existingChat) {
        console.warn(`Chat ${chatId} not found, skipping message persistence`);
        return;
      }

      await storage.createMessage({
        chatId,
        role: 'user',
        content: lastMessageContent,
        attachments: hasAttachments ? validatedAttachments : undefined,
        metadata,
      });

      if (responseContent) {
        await storage.createMessage({
          chatId,
          role: 'assistant',
          content: responseContent,
          metadata: responseMetadata && Object.keys(responseMetadata).length > 0 ? responseMetadata : undefined,
        });
      } else if (hasAttachments) {
        await storage.createMessage({
          chatId,
          role: 'assistant',
          content: 'Files received successfully.',
        });
      }

      const title = lastMessageContent
        ? lastMessageContent.slice(0, 50) + (lastMessageContent.length > 50 ? '...' : '')
        : hasAttachments
          ? `${validatedAttachments?.length ?? 0} file${(validatedAttachments?.length ?? 0) !== 1 ? 's' : ''} shared`
          : 'New message';

      await storage.updateChat(chatId, { title });

      if (usage) {
        try {
          await storage.createUsageMetric({
            userId,
            chatId,
            model,
            promptTokens: usage.promptTokens?.toString() || '0',
            completionTokens: usage.completionTokens?.toString() || '0',
            totalTokens: usage.totalTokens?.toString() || '0',
          });
        } catch (metricError) {
          console.error('Failed to create usage metric:', metricError);
        }
      }
    } catch (dbError) {
      console.error('Failed to save messages to storage:', dbError);
    }
  }

  app.get('/api/auth/csrf-token', (req, res) => {
    const token = req.session?.csrfToken ?? generateCsrfToken();
    if (!req.session) {
      return res.status(500).json({ error: 'Session is unavailable', detail: 'CSRF token generation failed without session' });
    }
    req.session.csrfToken = token;
    const secure = req.app.get('env') === 'production';
    res.cookie('XSRF-TOKEN', token, {
      httpOnly: false,
      sameSite: 'lax',
      secure,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ csrfToken: token });
  });

  // Authentication routes
  // Register new user
  app.post('/api/auth/register', async (req, res) => {
    try {
      const registerSchema = z.object({
        email: z.string().email('Invalid email address'),
        password: z.string().min(8, 'Password must be at least 8 characters'),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
      });

      const { email, password, firstName, lastName } = registerSchema.parse(req.body);
      const normalizedEmail = email.trim().toLowerCase();

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(normalizedEmail);
      if (existingUser) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      // Hash password and create user
      const hashedPassword = authService.hashPassword(password);
      const user = await storage.createUser({
        email: normalizedEmail,
        password: hashedPassword,
        firstName: firstName || null,
        lastName: lastName || null,
        username: null,
        avatar: null,
        profileImageUrl: null,
        plan: 'free',
        proAccessCode: null,
        role: 'user',
      });

      const ensuredUser = await ensureAdminRole(user, storage) ?? user;
      if (ensuredUser.role !== user.role) {
        await storage.updateUser(user.id, { role: ensuredUser.role });
      }

      // Log user in automatically after registration
        req.login(ensuredUser, (err) => {
          if (err) {
            console.error('Auto-login after registration failed:', err);
            return res.status(500).json({
              error: 'Registration succeeded but login failed',
              detail: err instanceof Error ? err.message : String(err),
            });
          }

        // Send welcome email (non-blocking)
        if (ensuredUser.email) {
        ghlEmailService.sendWelcomeEmail(ensuredUser.email, ensuredUser.firstName)
          .then(sent => {
            if (sent) {
              console.log(`Welcome email sent to ${ensuredUser.email}`);
            } else {
              console.error(`Failed to send welcome email to ${ensuredUser.email}`);
            }
          })
          .catch(error => {
            console.error(`Error sending welcome email:`, error);
          });
        }

        // Return user without password
        const { password: _, ...userWithoutPassword } = ensuredUser;
        res.status(201).json({ user: userWithoutPassword, message: 'Account created successfully.' });
      });
    } catch (error) {
      console.error('Registration error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: 'Failed to register user', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.post('/api/auth/admin/enroll', async (req, res) => {
    try {
      const adminEnrollSchema = z.object({
        email: z.string().email('Invalid email address'),
        password: z.string().min(12, 'Password must be at least 12 characters long'),
        temporaryPassword: z.string().min(1, 'Temporary password is required'),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
      });

      const { email, password, temporaryPassword, firstName, lastName } = adminEnrollSchema.parse(req.body);
      const normalizedEmail = email.trim().toLowerCase();

      const hasAdmin = await storage.hasAdminUser();
      const adminSecret = process.env.ADMIN_ENROLLMENT_SECRET;

      if (hasAdmin && !adminSecret) {
        return res.status(503).json({ error: 'Admin enrollment requires ADMIN_ENROLLMENT_SECRET' });
      }

      if (adminSecret) {
        if (!secureCompare(temporaryPassword, adminSecret)) {
          return res.status(403).json({ error: 'Temporary password is invalid' });
        }
      }

      const existingUser = await storage.getUserByEmail(normalizedEmail);
      const hashedPassword = authService.hashPassword(password);

      if (existingUser) {
        const updatedUser = await storage.updateUser(existingUser.id, {
          password: hashedPassword,
          role: 'admin',
          firstName: firstName ?? existingUser.firstName,
          lastName: lastName ?? existingUser.lastName,
          email: normalizedEmail,
        });

        if (!updatedUser) {
          return res.status(500).json({
            error: 'Failed to update administrator account',
            detail: 'User record could not be persisted with the new credentials.',
          });
        }

        return res.status(200).json({
          message: 'Administrator password reset successfully. You can now sign in with the new password.',
        });
      }

      const proPlanRecord = await storage.getPlanBySlug('pro').catch(() => undefined);
      const adminPlanSlug = normalizePlanSlugValue(proPlanRecord?.slug ?? proPlanRecord?.name ?? 'pro') ?? 'pro';

      const adminUser = await storage.createUser({
        email: normalizedEmail,
        password: hashedPassword,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        username: null,
        avatar: null,
        profileImageUrl: null,
        plan: adminPlanSlug,
        planId: proPlanRecord?.id ?? null,
        proAccessCode: null,
        role: 'admin',
      });

      return res.status(201).json({
        message: 'Administrator account created. You can now sign in with the credentials you provided.',
      });
    } catch (error) {
      console.error('Admin enrollment error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      return res.status(500).json({ error: 'Failed to enroll administrator', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Login user
  app.post('/api/auth/login', (req, res, next) => {
    const loginSchema = z.union([
      z.object({ identifier: z.string().min(1, 'Email or username is required'), password: z.string().min(1, 'Password is required') }),
      z.object({ email: z.string().email(), password: z.string().min(1, 'Password is required') }),
      z.object({ username: z.string().min(1, 'Username is required'), password: z.string().min(1, 'Password is required') }),
    ]);

    let parsed: z.infer<typeof loginSchema>;
    try {
      parsed = loginSchema.parse(req.body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      return res.status(400).json({ error: 'Invalid login payload' });
    }

    const identifier = (parsed as any).identifier ?? (parsed as any).email ?? (parsed as any).username;
    req.body.identifier = typeof identifier === 'string' ? identifier.trim() : '';
    req.body.password = parsed.password;

    passport.authenticate('local', async (err: any, user: any, info: any) => {
      if (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Login failed', detail: err instanceof Error ? err.message : String(err) });
      }

      if (!user) {
        return res.status(401).json({ error: info?.message || 'Invalid email or password' });
      }

      try {
        const ensuredUser = await ensureAdminRole(user, storage) ?? user;
        if (ensuredUser.role !== user.role) {
          await storage.updateUser(user.id, { role: ensuredUser.role });
        }

        req.login(ensuredUser, (loginErr) => {
          if (loginErr) {
            console.error('Session creation error:', loginErr);
            return res.status(500).json({ error: 'Failed to create session', detail: loginErr instanceof Error ? loginErr.message : String(loginErr) });
          }

          // Return user without password
          const { password: _, ...userWithoutPassword } = ensuredUser;
          res.json({ user: userWithoutPassword });
        });
      } catch (error) {
        console.error('Login role sync error:', error);
        return res.status(500).json({ error: 'Failed to complete login', detail: error instanceof Error ? error.message : undefined });
      }
    })(req, res, next);
  });

  // Logout user
  app.post('/api/auth/logout', (req, res) => {
    req.logout((err) => {
      if (err) {
        console.error('Logout error:', err);
        return res.status(500).json({ error: 'Failed to logout', detail: err instanceof Error ? err.message : String(err) });
      }
      res.json({ message: 'Logged out successfully' });
    });
  });

  // Get current user
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const normalized = await ensureAdminRole(req.user, storage) ?? req.user;
      if (normalized.role !== req.user.role) {
        await storage.updateUser(normalized.id, { role: normalized.role });
      }

      const { password: _, ...userWithoutPassword } = normalized;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user", detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Effective Capabilities API - Single source of truth for feature visibility
  app.get('/api/effective-capabilities', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const capabilities = await storage.getEffectiveCapabilities(userId);
      
      if (!capabilities) {
        return res.status(404).json({ error: 'User capabilities not found' });
      }
      
      res.json(capabilities);
    } catch (error) {
      if (respondWithMissingTables(res, error, 'fetching user capabilities')) {
        return;
      }
      console.error('Failed to fetch effective capabilities:', error);
      res.status(500).json({
        error: 'Unable to load effective capabilities',
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  });

  app.get('/api/admin/settings', requireAuth, requirePermission(PERMISSIONS.PLANS_VIEW), async (_req, res) => {
    try {
      const settings = await storage.getPlatformSettings();
      res.json({ settings });
    } catch (error) {
      console.error('Failed to load platform settings:', error);
      res.status(500).json({ error: 'Unable to load platform settings', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.put('/api/admin/settings', requireAuth, requirePermission(PERMISSIONS.PLANS_EDIT), requireSuperAdmin, async (req, res) => {
    try {
      // Fetch existing settings
      const existingRecord = await storage.getPlatformSettings();
      const baseSettings = existingRecord?.data ?? defaultPlatformSettings;
      const merged = structuredClone(baseSettings);
      const body = req.body ?? {};

      const planTierKeys: Array<keyof typeof merged.planTiers> = ['free', 'pro', 'enterprise'];
      for (const tier of planTierKeys) {
        if (!merged.planTiers[tier]) {
          merged.planTiers[tier] = structuredClone(defaultPlatformSettings.planTiers[tier]);
        }
        if (body.planTiers?.[tier]) {
          merged.planTiers[tier] = {
            ...merged.planTiers[tier],
            ...body.planTiers[tier],
          };
        }
      }

      if (body.knowledgeBase) {
        merged.knowledgeBase = {
          ...merged.knowledgeBase,
          ...body.knowledgeBase,
        };
      }

      if (body.memory) {
        merged.memory = {
          ...merged.memory,
          ...body.memory,
        };
      }

      if (body.aiAgents) {
        merged.aiAgents = {
          ...merged.aiAgents,
          ...body.aiAgents,
        };
      }

      if (body.templates) {
        merged.templates = {
          ...merged.templates,
          ...body.templates,
        };
      }

      if (body.projects) {
        merged.projects = {
          ...merged.projects,
          ...body.projects,
        };
      }

      if (body.teams) {
        merged.teams = {
          ...merged.teams,
          ...body.teams,
        };
      }

      if (body.apiProviders) {
        merged.apiProviders = { ...merged.apiProviders };
        for (const [provider, config] of Object.entries(body.apiProviders)) {
          const existing = merged.apiProviders[provider] ?? structuredClone(defaultPlatformSettings.apiProviders[provider] ?? config);
          const patch = (config && typeof config === 'object') ? (config as Record<string, unknown>) : {};
          merged.apiProviders[provider] = {
            ...existing,
            ...patch,
          } as any;
        }
      }

      if (Array.isArray(body.legacyModels)) {
        merged.legacyModels = body.legacyModels;
      }

      if (body.planAllowlists) {
        merged.planAllowlists = { ...merged.planAllowlists };
        for (const [tier, value] of Object.entries(body.planAllowlists)) {
          const existing = (merged.planAllowlists as any)[tier] ?? { knowledgeBaseHosts: [] as string[] };
          const hosts = (value && typeof value === 'object' && Array.isArray((value as any).knowledgeBaseHosts))
            ? (value as any).knowledgeBaseHosts as string[]
            : (existing.knowledgeBaseHosts ?? []);
          (merged.planAllowlists as any)[tier] = { knowledgeBaseHosts: hosts };
        }
      }

      for (const tier of planTierKeys) {
        if (!merged.planAllowlists[tier]) {
          merged.planAllowlists[tier] = { knowledgeBaseHosts: [] };
        } else if (!Array.isArray(merged.planAllowlists[tier].knowledgeBaseHosts)) {
          merged.planAllowlists[tier].knowledgeBaseHosts = [];
        }
      }

      const payload = platformSettingsDataSchema.parse(merged);
      const settings = await storage.upsertPlatformSettings(payload);
      res.json({ settings });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid settings payload', details: error.errors });
      }
      console.error('Failed to update platform settings:', error);
      res.status(500).json({ error: 'Unable to update platform settings', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Provider pricing routes (Super Admin only)
  app.get('/api/admin/pricing', requireAuth, requirePermission(PERMISSIONS.API_ACCESS_VIEW), async (_req, res) => {
    try {
      const pricing = await storage.listProviderPricing();
      res.json(pricing);
    } catch (error) {
      console.error('Failed to load provider pricing:', error);
      res.status(500).json({ error: 'Unable to load provider pricing', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.patch('/api/admin/pricing/:id', requireAuth, requirePermission(PERMISSIONS.API_ACCESS_VIEW), async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      // Get existing pricing
      const existing = await storage.listProviderPricing();
      const item = existing.find(p => p.id === id);
      
      if (!item) {
        return res.status(404).json({ error: 'Pricing not found' });
      }

      // Update pricing
      const updated = await storage.upsertProviderPricing({
        provider: item.provider as any,
        model: item.model,
        inputUsdPer1k: updates.inputUsdPer1k ?? item.inputUsdPer1k,
        outputUsdPer1k: updates.outputUsdPer1k ?? item.outputUsdPer1k,
        enabled: updates.enabled ?? item.enabled,
      });

      res.json(updated);
    } catch (error) {
      console.error('Failed to update provider pricing:', error);
      res.status(500).json({ error: 'Unable to update provider pricing', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.get('/api/admin/system-prompts', requireAuth, requirePermission(PERMISSIONS.SYSTEM_PROMPTS_VIEW), async (_req, res) => {
    try {
      const prompts = await storage.listSystemPrompts();
      const active = prompts.find(prompt => prompt.isActive) ?? (await storage.getActiveSystemPrompt()) ?? null;

      res.json({
        systemPrompts: prompts.map(serializeSystemPrompt),
        activeSystemPromptId: active ? active.id : null,
      });
    } catch (error) {
      if (respondWithMissingTables(res, error, 'load system prompts')) {
        return;
      }
      console.error('Failed to load system prompts:', error);
      res.status(500).json({ error: 'Unable to load system prompts', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.post('/api/admin/system-prompts', requireAuth, requirePermission(PERMISSIONS.SYSTEM_PROMPTS_EDIT), requireSuperAdmin, async (req, res) => {
    try {
      const payload = systemPromptCreateSchema.parse(req.body);
      const actorId = (req as any).user?.id ?? null;
      const created = await storage.createSystemPrompt({
        content: payload.content,
        label: payload.label ?? null,
        notes: payload.notes ?? null,
        createdByUserId: actorId,
        activate: payload.activate ?? false,
        activatedByUserId: payload.activate ? actorId : null,
      });

      const prompts = await storage.listSystemPrompts();
      const active = prompts.find(prompt => prompt.isActive) ?? null;
      const createdRecord = prompts.find(prompt => prompt.id === created.id) ?? created;

      res.status(201).json({
        systemPrompt: serializeSystemPrompt(createdRecord),
        systemPrompts: prompts.map(serializeSystemPrompt),
        activeSystemPromptId: active ? active.id : null,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid system prompt payload', details: error.errors });
      }
      if (respondWithMissingTables(res, error, 'create system prompt')) {
        return;
      }
      console.error('Failed to create system prompt:', error);
      res.status(500).json({ error: 'Unable to create system prompt', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.patch('/api/admin/system-prompts/:id', requireAuth, requirePermission(PERMISSIONS.SYSTEM_PROMPTS_EDIT), requireSuperAdmin, async (req, res) => {
    try {
      const payload = systemPromptUpdateSchema.parse(req.body);
      const promptId = req.params.id;
      const actorId = (req as any).user?.id ?? null;

      const existing = await storage.getSystemPrompt(promptId);
      if (!existing) {
        return res.status(404).json({ error: 'System prompt not found' });
      }

      let updated = existing;

      const updates: { content?: string; label?: string | null; notes?: string | null } = {};
      if (payload.content !== undefined) {
        updates.content = payload.content;
      }
      if (payload.label !== undefined) {
        updates.label = payload.label;
      }
      if (payload.notes !== undefined) {
        updates.notes = payload.notes;
      }

      if (Object.keys(updates).length > 0) {
        const result = await storage.updateSystemPrompt(promptId, updates);
        if (!result) {
          return res.status(404).json({ error: 'System prompt not found' });
        }
        updated = result;
      }

      if (payload.activate) {
        const activated = await storage.activateSystemPrompt(promptId, actorId);
        if (!activated) {
          return res.status(404).json({ error: 'System prompt not found' });
        }
        updated = activated;
      }

      const prompts = await storage.listSystemPrompts();
      const active = prompts.find(prompt => prompt.isActive) ?? null;

      res.json({
        systemPrompt: serializeSystemPrompt(updated),
        systemPrompts: prompts.map(serializeSystemPrompt),
        activeSystemPromptId: active ? active.id : null,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid system prompt payload', details: error.errors });
      }
      if (respondWithMissingTables(res, error, 'update system prompt')) {
        return;
      }
      console.error('Failed to update system prompt:', error);
      res.status(500).json({ error: 'Unable to update system prompt', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.get('/api/admin/releases', requireAuth, requirePermission(PERMISSIONS.RELEASE_MANAGEMENT_VIEW), async (_req, res) => {
    try {
      const releases = await storage.listReleases();
      const active = releases.find((release) => release.isActive) ?? (await storage.getActiveRelease()) ?? null;

      res.json({
        releases: releases.map(serializeRelease),
        activeReleaseId: active ? active.id : null,
      });
    } catch (error) {
      if (respondWithMissingTables(res, error, 'load releases')) {
        return;
      }
      console.error('Failed to load releases:', error);
      res.status(500).json({ error: 'Unable to load releases', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.post('/api/admin/releases', requireAuth, requirePermission(PERMISSIONS.RELEASE_MANAGEMENT_EDIT), async (req, res) => {
    try {
      const payload = releaseCreateSchema.parse(req.body);
      const created = await storage.createRelease({
        label: payload.label,
        systemPromptId: payload.systemPromptId ?? null,
        expertIds: payload.expertIds ?? [],
        templateIds: payload.templateIds ?? [],
        outputTemplateIds: payload.outputTemplateIds ?? [],
        toolPolicyIds: payload.toolPolicyIds ?? [],
        changeNotes: payload.changeNotes ?? null,
      });

      const releases = await storage.listReleases();
      const active = releases.find((release) => release.isActive) ?? null;

      res.status(201).json({
        release: serializeRelease(created),
        releases: releases.map(serializeRelease),
        activeReleaseId: active ? active.id : null,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid release payload', details: error.errors });
      }
      if (respondWithMissingTables(res, error, 'create release')) {
        return;
      }
      console.error('Failed to create release:', error);
      res.status(500).json({ error: 'Unable to create release', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.post('/api/admin/releases/:id/publish', requireAuth, requirePermission(PERMISSIONS.RELEASE_MANAGEMENT_EDIT), async (req, res) => {
    try {
      const payload = releaseTransitionSchema.parse(req.body);
      const actorId = (req as any).user?.id ?? null;
      const releaseId = req.params.id;

      const updated = await storage.publishRelease(releaseId, {
        changeNotes: payload.changeNotes,
        actorUserId: actorId,
      });

      if (!updated) {
        return res.status(404).json({ error: 'Release not found' });
      }

      const releases = await storage.listReleases();
      const active = releases.find((release) => release.isActive) ?? updated;

      res.json({
        release: serializeRelease(updated),
        releases: releases.map(serializeRelease),
        activeReleaseId: active ? active.id : null,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid release payload', details: error.errors });
      }
      if (respondWithMissingTables(res, error, 'publish release')) {
        return;
      }
      console.error('Failed to publish release:', error);
      res.status(500).json({ error: 'Unable to publish release', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.post('/api/admin/releases/:id/rollback', requireAuth, requirePermission(PERMISSIONS.RELEASE_MANAGEMENT_EDIT), async (req, res) => {
    try {
      const payload = releaseTransitionSchema.parse(req.body);
      const actorId = (req as any).user?.id ?? null;
      const releaseId = req.params.id;

      const updated = await storage.rollbackRelease(releaseId, {
        changeNotes: payload.changeNotes,
        actorUserId: actorId,
      });

      if (!updated) {
        return res.status(404).json({ error: 'Release not found' });
      }

      const releases = await storage.listReleases();
      const active = releases.find((release) => release.isActive) ?? updated;

      res.json({
        release: serializeRelease(updated),
        releases: releases.map(serializeRelease),
        activeReleaseId: active ? active.id : null,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid release payload', details: error.errors });
      }
      if (respondWithMissingTables(res, error, 'rollback release')) {
        return;
      }
      console.error('Failed to rollback release:', error);
      res.status(500).json({ error: 'Unable to rollback release', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.get('/api/admin/users', requireAuth, requirePermission(PERMISSIONS.USER_MANAGEMENT_VIEW), async (_req, res) => {
    try {
      const users = await storage.listUsers();
      const serialized = await Promise.all(users.map(async (user) => {
        const normalized = await ensureAdminRole(user, storage) ?? user;
        return await serializeAdminUser(normalized);
      }));
      res.json({ users: serialized });
    } catch (error) {
      console.error('Failed to list users:', error);
      res.status(500).json({ error: 'Unable to load users', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.patch('/api/admin/users/:id/status', requireAuth, requirePermission(PERMISSIONS.USER_MANAGEMENT_EDIT), async (req, res) => {
    try {
      const { status } = updateUserStatusSchema.parse(req.body);
      const targetUserId = req.params.id;
      const actingUserId = (req as any).user?.id;

      if (actingUserId && actingUserId === targetUserId && status !== 'active') {
        return res.status(400).json({ error: 'You cannot change your own status.' });
      }

      const existingUser = await storage.getUser(targetUserId);
      if (!existingUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      const updatedUser = await storage.updateUserStatus(targetUserId, status);
      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      await recordAuditEvent('user.status.changed', targetUserId, actingUserId ?? null, {
        from: existingUser.status ?? 'active',
        to: status,
      });

      const normalized = await ensureAdminRole(updatedUser, storage) ?? updatedUser;
      res.json({ user: await serializeAdminUser(normalized) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid status payload', details: error.errors });
      }
      console.error('Failed to update user status:', error);
      res.status(500).json({ error: 'Unable to update user status', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.patch('/api/admin/users/:id/role', requireAuth, requirePermission(PERMISSIONS.USER_MANAGEMENT_EDIT), requireSuperAdmin, async (req, res) => {
    try {
      const { role } = updateUserRoleSchema.parse(req.body);
      const targetUserId = req.params.id;
      const actingUserId = (req as any).user?.id ?? null;

      if (actingUserId && actingUserId === targetUserId && role !== 'super_admin') {
        return res.status(400).json({ error: 'You cannot revoke your own super admin access.' });
      }

      const existingUser = await storage.getUser(targetUserId);
      if (!existingUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (existingUser.role === 'super_admin' && role !== 'super_admin') {
        const superAdmins = (await storage.listUsers()).filter((user) => user.role === 'super_admin');
        if (superAdmins.length <= 1) {
          return res.status(400).json({ error: 'At least one super admin is required.' });
        }
      }

      const updatedUser = await storage.updateUser(targetUserId, { role });
      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      await recordAuditEvent('user.role.changed', targetUserId, actingUserId, {
        from: existingUser.role,
        to: role,
      });

      const normalized = (await ensureAdminRole(updatedUser, storage)) ?? updatedUser;
      res.json({ user: await serializeAdminUser(normalized) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid role payload', details: error.errors });
      }
      console.error('Failed to update user role:', error);
      res.status(500).json({ error: 'Unable to update user role', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.post('/api/admin/users/:id/reset-password', requireAuth, requirePermission(PERMISSIONS.USER_MANAGEMENT_EDIT), async (req, res) => {
    try {
      const targetUserId = req.params.id;
      const actingUserId = (req as any).user?.id ?? null;
      const user = await storage.getUser(targetUserId);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (!user.email) {
        return res.status(400).json({ error: 'User does not have an email address on file.' });
      }

      await storage.deleteExpiredTokens().catch(() => undefined);

      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      await storage.createPasswordResetToken({
        userId: user.id,
        token,
        expiresAt,
        used: 'false',
      });

      const resetUrl = `${process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000'}/reset-password?token=${token}`;
      await ghlEmailService.sendPasswordResetEmail(user.email, token, resetUrl);

      await recordAuditEvent('user.password.reset_requested', targetUserId, actingUserId, {
        expiresAt: expiresAt.toISOString(),
      });

      res.json({ success: true, expiresAt: expiresAt.toISOString() });
    } catch (error) {
      console.error('Failed to initiate admin password reset:', error);
      res.status(500).json({ error: 'Unable to request password reset', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.patch('/api/admin/users/:id/plan', requireAuth, requirePermission(PERMISSIONS.USER_MANAGEMENT_EDIT), async (req, res) => {
    try {
      const changePlanSchema = z
        .object({
          plan: z.string().trim().min(1, 'Plan is required').optional(),
          planId: z.string().trim().min(1, 'Plan ID is required').optional(),
          effective: z.enum(['immediate', 'next_cycle']).default('immediate'),
          prorate: z.boolean().optional().default(true),
        })
        .refine(data => Boolean(data.plan || data.planId), {
          message: 'Plan identifier is required',
          path: ['plan'],
        });

      const { plan: planNameOrSlug, planId, effective, prorate } = changePlanSchema.parse(req.body);
      const targetUserId = req.params.id;
      const actingUserId = (req as any).user?.id ?? null;

      const existingUser = await storage.getUser(targetUserId);
      if (!existingUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      const previousPlanMeta = await authService.getResolvedPlanMetadataForUserId(targetUserId);

      const planIdentifier = planId ?? planNameOrSlug ?? '';
      const targetPlan = await resolvePlanByIdentifier(storage, planIdentifier);

      if (!targetPlan) {
        return res.status(404).json({ error: `Plan '${planIdentifier}' not found` });
      }

      const applyImmediately = effective === 'immediate';
      const normalizedPlanSlug = normalizePlanSlugValue(targetPlan.slug ?? targetPlan.name) ?? 'free';
      const updatedUser = applyImmediately
        ? await storage.updateUser(targetUserId, {
            plan: normalizedPlanSlug,
            planId: targetPlan.id,
          })
        : existingUser;

      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Use the old recordAuditEvent for backward compatibility
      await recordAuditEvent('user.plan.changed', targetUserId, actingUserId, {
        from: existingUser.plan,
        to: normalizedPlanSlug,
        effective,
        prorate,
      });

      // Also use the new comprehensive audit logging
      const updatedPlanMeta = applyImmediately
        ? await authService.getResolvedPlanMetadataForUserId(targetUserId)
        : null;
      const beforeSnapshot = buildPlanAuditSnapshot({
        meta: previousPlanMeta,
        fallback: { plan: existingUser.plan, planId: existingUser.planId ?? null },
      });
      const afterSnapshot = buildPlanAuditSnapshot({
        meta: updatedPlanMeta ?? undefined,
        plan: applyImmediately ? undefined : targetPlan,
        fallback: { plan: normalizedPlanSlug, planId: targetPlan.id },
        metadata: { effective, prorate, applied: applyImmediately },
      });
      await auditPlanModification(storage, actingUserId, {
        targetType: 'user',
        targetId: targetUserId,
        targetName: existingUser.email || existingUser.username || targetUserId,
        before: beforeSnapshot,
        after: afterSnapshot,
        changeNotes: `User plan changed from ${existingUser.plan} to ${targetPlan.name} (${effective})`
      });

      const normalized = await ensureAdminRole(updatedUser, storage) ?? updatedUser;

      res.json({
        user: await serializeAdminUser(normalized),
        applied: applyImmediately,
        effective,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid plan payload', details: error.errors });
      }
      console.error('Failed to change user plan:', error);
      res.status(500).json({ error: 'Unable to change plan', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.post('/api/admin/users/:id/coupons', requireAuth, requirePermission(PERMISSIONS.USER_MANAGEMENT_EDIT), async (req, res) => {
    try {
      const applyCouponSchema = z.object({
        code: proCouponCodeSchema,
        mode: z.enum(['preview', 'apply']).default('apply'),
      });

      const { code, mode } = applyCouponSchema.parse(req.body);
      const targetUserId = req.params.id;
      const actingUserId = (req as any).user?.id ?? null;

      const user = await storage.getUser(targetUserId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const coupon = await storage.getProCouponByCode(code);
      if (!coupon) {
        return res.status(404).json({ error: 'Coupon not found' });
      }

      const now = new Date();
      const expiresAt = coupon.expiresAt ? new Date(coupon.expiresAt) : null;
      const expired = expiresAt ? now > expiresAt : false;
      const alreadyRedeemed = await storage.getProCouponRedemption(coupon.id, user.id);
      const limitReached = coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions;
      const canApply = coupon.isActive && !expired && !limitReached;

      const preview = {
        coupon: serializeCoupon(coupon),
        alreadyRedeemed: Boolean(alreadyRedeemed),
        expired,
        limitReached,
        canApply,
      };

      if (mode === 'preview') {
        return res.json({ preview });
      }

      if (!canApply) {
        return res.status(400).json({ error: 'Coupon is not currently applicable', preview });
      }

      if (alreadyRedeemed) {
        return res.status(409).json({ error: 'Coupon already redeemed for this user', preview });
      }

      const redemption = await storage.createProCouponRedemption(coupon.id, user.id);
      const updatedCoupon = await storage.incrementProCouponRedemption(coupon.id) ?? coupon;

      await recordAuditEvent('user.coupon.applied', targetUserId, actingUserId, {
        code: updatedCoupon.code,
      });

      res.json({
        coupon: serializeCoupon(updatedCoupon),
        redemption: {
          id: redemption.id,
          redeemedAt: toIsoString(redemption.redeemedAt),
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid coupon payload', details: error.errors });
      }
      console.error('Failed to apply coupon:', error);
      res.status(500).json({ error: 'Unable to apply coupon', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.get('/api/admin/users/:id/audit-logs', requireAuth, requirePermission(PERMISSIONS.USER_MANAGEMENT_VIEW), async (req, res) => {
    try {
      const targetUserId = req.params.id;
      const limitParam = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
      const parsedLimit = typeof limitParam === 'string' ? Number.parseInt(limitParam, 10) : undefined;
      const limit = Number.isFinite(parsedLimit) ? Math.max(0, parsedLimit as number) : undefined;

      const logs = await storage.listAdminAuditLogsForUser(targetUserId, limit);
      res.json({ logs: logs.map(serializeAuditLog) });
    } catch (error) {
      console.error('Failed to load audit logs:', error);
      res.status(500).json({ error: 'Unable to load audit logs', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.get('/api/admin/templates', requireAuth, requirePermission(PERMISSIONS.TEMPLATES_VIEW), async (_req, res) => {
    try {
      const templates = await storage.listTemplates();
      res.json({ templates: templates.map(serializeTemplate) });
    } catch (error) {
      console.error('Failed to list templates:', error);
      res.status(500).json({ error: 'Unable to load templates', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.post('/api/admin/templates', requireAuth, requirePermission(PERMISSIONS.TEMPLATES_EDIT), async (req, res) => {
    try {
      const payload = templateCreateSchema.parse(req.body);
      const buffer = Buffer.from(payload.file.data, 'base64');
      if (!Number.isFinite(buffer.length)) {
        return res.status(400).json({ error: 'Invalid template file payload' });
      }
      if (buffer.byteLength > TEMPLATE_MAX_SIZE_BYTES) {
        const maxMb = Math.floor(TEMPLATE_MAX_SIZE_BYTES / (1024 * 1024));
        return res.status(413).json({ error: `Template files must be ${maxMb}MB or smaller.` });
      }

      const attachment = await storage.saveFile(
        TEMPLATE_FILE_OWNER,
        buffer,
        payload.file.name,
        payload.file.mimeType,
      );

      try {
        const template = await storage.createTemplate({
          name: payload.name,
          description: payload.description ?? null,
          fileId: attachment.id,
          fileName: payload.file.name,
          mimeType: payload.file.mimeType,
          fileSize: attachment.size,
          availableForFree: payload.availableForFree ?? false,
          availableForPro: payload.availableForPro ?? true,
          isActive: payload.isActive ?? true,
        });

        res.status(201).json({ template: serializeTemplate(template) });
      } catch (createError) {
        await storage.deleteFile(attachment.id, TEMPLATE_FILE_OWNER).catch(() => {});
        throw createError;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid template payload', details: error.errors });
      }
      console.error('Failed to create template:', error);
      res.status(500).json({ error: 'Unable to create template', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.patch('/api/admin/templates/:id', requireAuth, requirePermission(PERMISSIONS.TEMPLATES_EDIT), async (req, res) => {
    try {
      const payload = templateUpdateSchema.parse(req.body);
      const templateId = req.params.id;
      const existing = await storage.getTemplate(templateId);

      if (!existing) {
        return res.status(404).json({ error: 'Template not found' });
      }

      let newAttachment: { id: string; size: number } | null = null;
      let previousFileId: string | null = null;

      if (payload.file) {
        const buffer = Buffer.from(payload.file.data, 'base64');
        if (!Number.isFinite(buffer.length)) {
          return res.status(400).json({ error: 'Invalid template file payload' });
        }
        if (buffer.byteLength > TEMPLATE_MAX_SIZE_BYTES) {
          const maxMb = Math.floor(TEMPLATE_MAX_SIZE_BYTES / (1024 * 1024));
          return res.status(413).json({ error: `Template files must be ${maxMb}MB or smaller.` });
        }

        const attachment = await storage.saveFile(
          TEMPLATE_FILE_OWNER,
          buffer,
          payload.file.name,
          payload.file.mimeType,
        );
        newAttachment = { id: attachment.id, size: attachment.size };
        previousFileId = existing.fileId;
      }

      const updates: Partial<InsertTemplate> = {};
      if (payload.name !== undefined) {
        updates.name = payload.name;
      }
      if (payload.description !== undefined) {
        updates.description = payload.description ?? null;
      }
      if (payload.availableForFree !== undefined) {
        updates.availableForFree = payload.availableForFree;
      }
      if (payload.availableForPro !== undefined) {
        updates.availableForPro = payload.availableForPro;
      }
      if (payload.isActive !== undefined) {
        updates.isActive = payload.isActive;
      }
      if (newAttachment && payload.file) {
        updates.fileId = newAttachment.id;
        updates.fileName = payload.file.name;
        updates.mimeType = payload.file.mimeType;
        updates.fileSize = newAttachment.size;
      }

      const updated = await storage.updateTemplate(templateId, updates);
      if (!updated) {
        if (newAttachment) {
          await storage.deleteFile(newAttachment.id, TEMPLATE_FILE_OWNER).catch(() => {});
        }
        return res.status(404).json({ error: 'Template not found' });
      }

      if (newAttachment && previousFileId) {
        await storage.deleteFile(previousFileId, TEMPLATE_FILE_OWNER).catch(() => {});
      }

      res.json({ template: serializeTemplate(updated) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid template payload', details: error.errors });
      }
      console.error('Failed to update template:', error);
      res.status(500).json({ error: 'Unable to update template', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.delete('/api/admin/templates/:id', requireAuth, requirePermission(PERMISSIONS.TEMPLATES_EDIT), async (req, res) => {
    try {
      const templateId = req.params.id;
      const existing = await storage.getTemplate(templateId);
      if (!existing) {
        return res.status(404).json({ error: 'Template not found' });
      }

      const deleted = await storage.deleteTemplate(templateId);
      if (!deleted) {
        return res.status(404).json({ error: 'Template not found' });
      }

      await storage.deleteFile(existing.fileId, TEMPLATE_FILE_OWNER).catch(() => {});
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete template:', error);
      res.status(500).json({ error: 'Unable to delete template', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.get('/api/admin/templates/:id/file', requireAuth, requirePermission(PERMISSIONS.TEMPLATES_VIEW), fileAccessRateLimiter, async (req, res) => {
    try {
      const templateId = req.params.id;
      const template = await storage.getTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      const file = await storage.getFileForUser(template.fileId, TEMPLATE_FILE_OWNER);
      if (!file) {
        return res.status(404).json({ error: 'Template file not found' });
      }

      res.set({
        'Content-Type': file.mimeType,
        'Content-Length': file.size.toString(),
        'Content-Disposition': `attachment; filename="${file.name}"`,
        'Cache-Control': 'private, max-age=60',
      });
      res.send(file.buffer);
    } catch (error) {
      console.error('Failed to fetch template file:', error);
      res.status(500).json({ error: 'Unable to fetch template file', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.get('/api/admin/output-templates', requireAuth, requirePermission(PERMISSIONS.OUTPUT_TEMPLATES_VIEW), async (_req, res) => {
    try {
      const templates = await storage.listOutputTemplates();
      res.json({ templates: templates.map(serializeOutputTemplate) });
    } catch (error) {
      console.error('Failed to list output templates:', error);
      res.status(500).json({ error: 'Unable to load output templates', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.post('/api/admin/output-templates', requireAuth, requirePermission(PERMISSIONS.OUTPUT_TEMPLATES_EDIT), requireSuperAdmin, async (req, res) => {
    try {
      const payload = outputTemplateCreateSchema.parse(req.body);
      const template = await storage.createOutputTemplate({
        name: payload.name,
        category: payload.category,
        format: payload.format,
        description: payload.description ?? null,
        instructions: payload.instructions ?? null,
        requiredSections: payload.requiredSections,
        isActive: payload.isActive ?? true,
      });

      res.status(201).json({ template: serializeOutputTemplate(template) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid output template payload', details: error.errors });
      }
      console.error('Failed to create output template:', error);
      res.status(500).json({ error: 'Unable to create output template', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.patch('/api/admin/output-templates/:id', requireAuth, requirePermission(PERMISSIONS.OUTPUT_TEMPLATES_EDIT), requireSuperAdmin, async (req, res) => {
    try {
      const payload = outputTemplateUpdateSchema.parse(req.body);
      const templateId = req.params.id;
      const updated = await storage.updateOutputTemplate(templateId, payload);

      if (!updated) {
        return res.status(404).json({ error: 'Output template not found' });
      }

      res.json({ template: serializeOutputTemplate(updated) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid output template payload', details: error.errors });
      }
      console.error('Failed to update output template:', error);
      res.status(500).json({ error: 'Unable to update output template', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.delete('/api/admin/output-templates/:id', requireAuth, requirePermission(PERMISSIONS.OUTPUT_TEMPLATES_EDIT), requireSuperAdmin, async (req, res) => {
    try {
      const templateId = req.params.id;
      const deleted = await storage.deleteOutputTemplate(templateId);
      if (!deleted) {
        return res.status(404).json({ error: 'Output template not found' });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete output template:', error);
      res.status(500).json({ error: 'Unable to delete output template', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Model endpoints
  app.get('/api/models', requireAuth, async (req, res) => {
    const user = req.user as User;
    try {
      const models = await storage.getAvailableModels(user.id);

      // Only expose providers that have a platform API key configured
      const filtered = models.filter((model) => {
        switch (model.provider) {
          case 'openai':
            return Boolean(process.env.OPENAI_API_KEY);
          case 'anthropic':
            return Boolean(process.env.ANTHROPIC_API_KEY);
          case 'groq':
            return Boolean(process.env.GROQ_API_KEY);
          case 'perplexity':
            return Boolean(process.env.PERPLEXITY_API_KEY);
          case 'openrouter':
            return Boolean(process.env.OPENROUTER_API_KEY);
          default:
            return true;
        }
      });

      res.json({
        models: filtered.map((model) => ({
          id: model.id,
          provider: model.provider,
          modelId: model.modelId,
          displayName: model.displayName,
          description: model.description,
          capabilities: model.capabilities,
          basePricing: model.basePricing,
          contextWindow: model.contextWindow,
          maxOutputTokens: model.maxOutputTokens,
          isActive: model.isActive,
        })),
      });
    } catch (error) {
      console.error('Failed to fetch available models:', error);
      res
        .status(500)
        .json({ error: 'Unable to fetch models', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Admin model management endpoints
  app.get('/api/admin/models', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const models = await storage.listModels();
      res.json({ 
        models: models.map(model => ({
          id: model.id,
          provider: model.provider,
          modelId: model.modelId,
          displayName: model.displayName,
          description: model.description,
          capabilities: model.capabilities,
          basePricing: model.basePricing,
          contextWindow: model.contextWindow,
          maxOutputTokens: model.maxOutputTokens,
          isActive: model.isActive,
          createdAt: ensureIsoString(model.createdAt),
          updatedAt: ensureIsoString(model.updatedAt),
        }))
      });
    } catch (error) {
      console.error('Failed to list all models:', error);
      res.status(500).json({ error: 'Unable to list models', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.post('/api/admin/models', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const payload = insertModelSchema.parse(req.body);
      const model = await storage.createModel(payload);
      res.status(201).json({ 
        model: {
          id: model.id,
          provider: model.provider,
          modelId: model.modelId,
          displayName: model.displayName,
          description: model.description,
          capabilities: model.capabilities,
          basePricing: model.basePricing,
          contextWindow: model.contextWindow,
          maxOutputTokens: model.maxOutputTokens,
          isActive: model.isActive,
          createdAt: ensureIsoString(model.createdAt),
          updatedAt: ensureIsoString(model.updatedAt),
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid model payload', details: error.errors });
      }
      console.error('Failed to create model:', error);
      res.status(500).json({ error: 'Unable to create model', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.patch('/api/admin/models/:id', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const payload = updateModelSchema.parse(req.body);
      const modelId = req.params.id;
      const model = await storage.updateModel(modelId, payload);

      if (!model) {
        return res.status(404).json({ error: 'Model not found' });
      }

      res.json({ 
        model: {
          id: model.id,
          provider: model.provider,
          modelId: model.modelId,
          displayName: model.displayName,
          description: model.description,
          capabilities: model.capabilities,
          basePricing: model.basePricing,
          contextWindow: model.contextWindow,
          maxOutputTokens: model.maxOutputTokens,
          isActive: model.isActive,
          createdAt: ensureIsoString(model.createdAt),
          updatedAt: ensureIsoString(model.updatedAt),
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid model update payload', details: error.errors });
      }
      console.error('Failed to update model:', error);
      res.status(500).json({ error: 'Unable to update model', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.delete('/api/admin/models/:id', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const modelId = req.params.id;
      const deleted = await storage.deleteModel(modelId);

      if (!deleted) {
        return res.status(404).json({ error: 'Model not found' });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete model:', error);
      res.status(500).json({ error: 'Unable to delete model', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Analytics endpoints - Admin only
  app.get('/api/admin/analytics/feature-usage', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { startDate, endDate, feature, userId } = req.query;
      
      const analytics = new (await import('./analytics')).AnalyticsTracker(storage);
      
      const stats = await analytics.getFeatureUsageStats(
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined,
        userId as string | undefined
      );
      
      res.json(stats);
    } catch (error) {
      console.error('Failed to fetch feature usage analytics:', error);
      res.status(500).json({ error: 'Unable to load analytics', detail: error instanceof Error ? error.message : undefined });
    }
  });
  
  app.get('/api/admin/analytics/plan-audit', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { startDate, endDate, targetUserId } = req.query;
      
      const analytics = new (await import('./analytics')).AnalyticsTracker(storage);
      
      const auditLogs = await analytics.getPlanChangeAudit(
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined,
        targetUserId as string | undefined
      );
      
      res.json(auditLogs);
    } catch (error) {
      console.error('Failed to fetch plan change audit:', error);
      res.status(500).json({ error: 'Unable to load audit logs', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Expert endpoints - Admin CRUD
  app.get('/api/admin/experts', requireAuth, requirePermission(PERMISSIONS.EXPERT_LIBRARY_VIEW), async (_req, res) => {
    try {
      const experts = await storage.listExperts();
      res.json({ experts });
    } catch (error) {
      console.error('Failed to list experts:', error);
      res.status(500).json({ error: 'Unable to load experts', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.post('/api/admin/experts', requireAuth, requirePermission(PERMISSIONS.EXPERT_LIBRARY_EDIT), requireSuperAdmin, async (req, res) => {
    try {
      const payload = insertExpertSchema.parse(req.body);
      const expert = await storage.createExpert(payload);
      res.status(201).json({ expert });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid expert payload', details: error.errors });
      }
      console.error('Failed to create expert:', error);
      res.status(500).json({ error: 'Unable to create expert', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.patch('/api/admin/experts/:id', requireAuth, requirePermission(PERMISSIONS.EXPERT_LIBRARY_EDIT), requireSuperAdmin, async (req, res) => {
    try {
      const expertId = req.params.id;
      const payload = updateExpertSchema.parse(req.body);
      const expert = await storage.updateExpert(expertId, payload);
      
      if (!expert) {
        return res.status(404).json({ error: 'Expert not found' });
      }
      
      res.json({ expert });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid expert update payload', details: error.errors });
      }
      console.error('Failed to update expert:', error);
      res.status(500).json({ error: 'Unable to update expert', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.delete('/api/admin/experts/:id', requireAuth, requirePermission(PERMISSIONS.EXPERT_LIBRARY_EDIT), requireSuperAdmin, async (req, res) => {
    try {
      const expertId = req.params.id;
      const deleted = await storage.deleteExpert(expertId);
      
      if (!deleted) {
        return res.status(404).json({ error: 'Expert not found' });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete expert:', error);
      res.status(500).json({ error: 'Unable to delete expert', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.get('/api/admin/pro-coupons', requireAuth, requirePermission(PERMISSIONS.ACCESS_CODES_VIEW), async (_req, res) => {
    try {
      const coupons = await storage.listProCoupons();
      res.json({ coupons: coupons.map(serializeCoupon) });
    } catch (error) {
      console.error('Failed to list pro coupons:', error);
      res.status(500).json({ error: 'Unable to load coupons', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.post('/api/admin/pro-coupons', requireAuth, requirePermission(PERMISSIONS.ACCESS_CODES_EDIT), async (req, res) => {
    try {
      const payload = proCouponCreateSchema.parse(req.body);
      const coupon = await storage.createProCoupon({
        code: payload.code,
        label: payload.label ?? null,
        description: payload.description ?? null,
        maxRedemptions: payload.maxRedemptions ?? null,
        expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
        isActive: payload.isActive ?? true,
      });
      res.status(201).json({ coupon: serializeCoupon(coupon) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid coupon payload', details: error.errors });
      }
      if (error instanceof Error && error.message === 'Coupon code already exists') {
        return res.status(409).json({ error: 'A coupon with this code already exists.' });
      }
      console.error('Failed to create pro coupon:', error);
      res.status(500).json({ error: 'Unable to create coupon', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.put('/api/admin/pro-coupons/:id', requireAuth, requirePermission(PERMISSIONS.ACCESS_CODES_EDIT), async (req, res) => {
    try {
      const payload = proCouponUpdateSchema.parse(req.body);
      const updates: Partial<InsertProCoupon> = {};
      if (payload.code !== undefined) {
        updates.code = payload.code;
      }
      if (payload.label !== undefined) {
        updates.label = payload.label;
      }
      if (payload.description !== undefined) {
        updates.description = payload.description;
      }
      if (payload.maxRedemptions !== undefined) {
        updates.maxRedemptions = payload.maxRedemptions;
      }
      if (payload.expiresAt !== undefined) {
        updates.expiresAt = payload.expiresAt ? new Date(payload.expiresAt) : null;
      }
      if (payload.isActive !== undefined) {
        updates.isActive = payload.isActive;
      }

      const coupon = await storage.updateProCoupon(req.params.id, updates);
      if (!coupon) {
        return res.status(404).json({ error: 'Coupon not found' });
      }

      res.json({ coupon: serializeCoupon(coupon) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid coupon payload', details: error.errors });
      }
      if (error instanceof Error && error.message === 'Coupon code already exists') {
        return res.status(409).json({ error: 'A coupon with this code already exists.' });
      }
      console.error('Failed to update pro coupon:', error);
      res.status(500).json({ error: 'Unable to update coupon', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.delete('/api/admin/pro-coupons/:id', requireAuth, requirePermission(PERMISSIONS.ACCESS_CODES_EDIT), async (req, res) => {
    try {
      const deleted = await storage.deleteProCoupon(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Coupon not found' });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete pro coupon:', error);
      res.status(500).json({ error: 'Unable to delete coupon', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.get('/api/admin/tool-policies', requireAuth, requirePermission(PERMISSIONS.TOOL_POLICIES_VIEW), async (_req, res) => {
    try {
      const policies = await storage.listToolPolicies();
      res.json({ toolPolicies: policies.map(formatToolPolicy) });
    } catch (error) {
      console.error('Failed to list tool policies:', error);
      res.status(500).json({ error: 'Unable to load tool policies', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.post('/api/admin/tool-policies', requireAuth, requirePermission(PERMISSIONS.TOOL_POLICIES_EDIT), requireSuperAdmin, async (req, res) => {
    try {
      const result = toolPolicyCreateSchema.safeParse(req.body);
      if (!result.success) {
        const issue = result.error.issues[0];
        return res.status(400).json({ error: 'Invalid tool policy payload', detail: issue?.message ?? 'Validation failed' });
      }

      const payload = result.data;
      const insertPayload: InsertToolPolicy = {
        provider: payload.provider,
        toolName: payload.toolName,
        isEnabled: payload.isEnabled ?? true,
        safetyNote: payload.safetyNote?.trim() ? payload.safetyNote.trim() : null,
      };

      const toolPolicy = await storage.createToolPolicy(insertPayload);
      res.status(201).json({ toolPolicy: formatToolPolicy(toolPolicy) });
    } catch (error) {
      if (isToolPolicyConflictError(error)) {
        return res.status(409).json({ error: 'A tool policy already exists for this provider and tool.' });
      }
      console.error('Failed to create tool policy:', error);
      res.status(500).json({ error: 'Unable to create tool policy', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.patch('/api/admin/tool-policies/:id', requireAuth, requirePermission(PERMISSIONS.TOOL_POLICIES_EDIT), requireSuperAdmin, async (req, res) => {
    try {
      const result = toolPolicyUpdateSchema.safeParse(req.body);
      if (!result.success) {
        const issue = result.error.issues[0];
        return res.status(400).json({ error: 'Invalid tool policy payload', detail: issue?.message ?? 'Validation failed' });
      }

      const payload = result.data;
      const updates: UpdateToolPolicy = {};

      if (payload.provider !== undefined) {
        updates.provider = payload.provider;
      }
      if (payload.toolName !== undefined) {
        updates.toolName = payload.toolName;
      }
      if (payload.isEnabled !== undefined) {
        updates.isEnabled = payload.isEnabled;
      }
      if (payload.safetyNote !== undefined) {
        updates.safetyNote = payload.safetyNote === null
          ? null
          : payload.safetyNote.trim()
            ? payload.safetyNote.trim()
            : null;
      }

      const updatedPolicy = await storage.updateToolPolicy(req.params.id, updates);
      if (!updatedPolicy) {
        return res.status(404).json({ error: 'Tool policy not found' });
      }

      res.json({ toolPolicy: formatToolPolicy(updatedPolicy) });
    } catch (error) {
      if (isToolPolicyConflictError(error)) {
        return res.status(409).json({ error: 'A tool policy already exists for this provider and tool.' });
      }
      console.error('Failed to update tool policy:', error);
      res.status(500).json({ error: 'Unable to update tool policy', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.delete('/api/admin/tool-policies/:id', requireAuth, requirePermission(PERMISSIONS.TOOL_POLICIES_EDIT), requireSuperAdmin, async (req, res) => {
    try {
      const deleted = await storage.deleteToolPolicy(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Tool policy not found' });
      }
      res.status(204).end();
    } catch (error) {
      console.error('Failed to delete tool policy:', error);
      res.status(500).json({ error: 'Unable to delete tool policy', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Password Reset Flow
  
  // 1. POST /api/auth/forgot-password - Request password reset
  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const forgotPasswordSchema = z.object({
        email: z.string().email('Invalid email address'),
      });

      const { email } = forgotPasswordSchema.parse(req.body);

      // Check if user exists (but don't reveal this information)
      const user = await storage.getUserByEmail(email);
      
      if (user) {
        // Generate secure random token (32 bytes = 64 characters hex)
        const token = randomBytes(32).toString('hex');
        
        // Set expiration to 1 hour from now
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1);
        
        // Create password reset token in database
        await storage.createPasswordResetToken({
          userId: user.id,
          token,
          expiresAt,
          used: 'false',
        });
        
        // Generate reset URL
        const resetUrl = `${process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000'}/reset-password?token=${token}`;
        
        // Send reset email via GHL Email Service
        await ghlEmailService.sendPasswordResetEmail(email, token, resetUrl);
        
        console.log(`Password reset requested for ${email}`);
      } else {
        console.log(`Password reset requested for non-existent email: ${email}`);
      }
      
      // Always return success to avoid revealing if email exists (security best practice)
      res.json({ 
        message: 'If an account with that email exists, a password reset link has been sent.' 
      });
    } catch (error) {
      console.error('Forgot password error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: 'Failed to process password reset request', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // 2. GET /api/auth/verify-reset-token - Verify if reset token is valid
  app.get('/api/auth/verify-reset-token', async (req, res) => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== 'string') {
        return res.json({ 
          valid: false, 
          message: 'Token is required' 
        });
      }

      // Look up token in database
      const resetToken = await storage.getPasswordResetToken(token);

      if (!resetToken) {
        return res.json({ 
          valid: false, 
          message: 'Invalid or expired reset token' 
        });
      }

      // Check if token has been used
      if (resetToken.used === 'true') {
        return res.json({ 
          valid: false, 
          message: 'This reset link has already been used' 
        });
      }

      // Check if token is expired
      const now = new Date();
      if (now > resetToken.expiresAt) {
        return res.json({ 
          valid: false, 
          message: 'This reset link has expired' 
        });
      }

      // Token is valid
      res.json({ valid: true });
    } catch (error) {
      console.error('Verify reset token error:', error);
      res.status(500).json({
        valid: false,
        message: 'Failed to verify reset token',
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  });

  // 3. POST /api/auth/reset-password - Reset password with token
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const resetPasswordSchema = z.object({
        token: z.string().min(1, 'Token is required'),
        newPassword: z.string()
          .min(8, 'Password must be at least 8 characters')
          .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
          .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
          .regex(/[0-9]/, 'Password must contain at least one number'),
      });

      const { token, newPassword } = resetPasswordSchema.parse(req.body);

      // Look up token in database
      const resetToken = await storage.getPasswordResetToken(token);

      if (!resetToken) {
        return res.status(400).json({ 
          error: 'Invalid or expired reset token' 
        });
      }

      // Check if token has been used
      if (resetToken.used === 'true') {
        return res.status(400).json({ 
          error: 'This reset link has already been used' 
        });
      }

      // Check if token is expired
      const now = new Date();
      if (now > resetToken.expiresAt) {
        return res.status(400).json({ 
          error: 'This reset link has expired. Please request a new one.' 
        });
      }

      // Mark token as used (atomic operation to prevent race condition)
      const marked = await storage.markTokenAsUsed(token);
      if (!marked) {
        return res.status(400).json({ 
          error: 'This reset link has already been used' 
        });
      }

      // Hash the new password
      const hashedPassword = authService.hashPassword(newPassword);

      // Update user's password
      const updatedUser = await storage.updateUser(resetToken.userId, {
        password: hashedPassword,
      });

      if (!updatedUser) {
        return res.status(404).json({ 
          error: 'User not found' 
        });
      }

      console.log(`Password successfully reset for user ${resetToken.userId}`);

      res.json({ 
        message: 'Password has been successfully reset. You can now log in with your new password.' 
      });
    } catch (error) {
      console.error('Reset password error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: 'Failed to reset password', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // 4. POST /api/auth/change-password - Change password (authenticated users)
  app.post('/api/auth/change-password', isAuthenticated, async (req: any, res) => {
    try {
      const changePasswordSchema = z.object({
        currentPassword: z.string().min(1, 'Current password is required'),
        newPassword: z.string()
          .min(8, 'Password must be at least 8 characters')
          .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
          .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
          .regex(/[0-9]/, 'Password must contain at least one number'),
      });

      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

      // Get current user
      const userId = req.user.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Verify current password
      if (!user.password) {
        return res.status(400).json({ error: 'Password authentication is not enabled for this account' });
      }

      const passwordCheck = authService.verifyPassword(currentPassword, user.password);
      if (!passwordCheck.isValid) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      // Hash the new password
      const hashedPassword = authService.hashPassword(newPassword);

      // Update user's password
      const updatedUser = await storage.updateUser(userId, {
        password: hashedPassword,
      });

      if (!updatedUser) {
        return res.status(500).json({
          error: 'Failed to update password',
          detail: 'Password update did not persist to the database.',
        });
      }

      console.log(`Password successfully changed for user ${userId}`);

      res.json({ 
        message: 'Your password has been successfully changed.' 
      });
    } catch (error) {
      console.error('Change password error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: 'Failed to change password', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Upgrade to Pro plan endpoint
  app.post('/api/upgrade-pro', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;

      const upgradeSchema = z.object({
        accessCode: z.string()
      });

      const { accessCode } = upgradeSchema.parse(req.body);
      await authService.upgradeToProPlan(userId, accessCode);
      
      res.json({ 
        message: 'Successfully upgraded to Pro plan',
        plan: 'pro'
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Enter an access code to upgrade to Pro.' });
      }
      if (error instanceof CouponRedemptionError) {
        switch (error.code) {
          case 'PRO_COUPON_INVALID':
            return res.status(400).json({ error: 'The supplied Pro access code is invalid.' });
          case 'PRO_COUPON_INACTIVE':
            return res.status(400).json({ error: 'This coupon is not currently active.' });
          case 'PRO_COUPON_EXPIRED':
            return res.status(400).json({ error: 'This coupon has expired.' });
          case 'PRO_COUPON_FULLY_REDEEMED':
            return res.status(400).json({ error: 'This coupon has reached its redemption limit.' });
          case 'PRO_COUPON_ALREADY_USED':
            return res.status(400).json({ error: 'You have already redeemed this coupon.' });
          default:
            return res.status(400).json({ error: error.message });
        }
      }
      if (error instanceof Error && error.message === 'Pro upgrades are currently disabled') {
        return res.status(503).json({ error: 'Pro upgrades are currently disabled. Contact support to enable this flow.' });
      }
      console.error('Pro upgrade error:', error);
      res.status(500).json({ error: 'Failed to upgrade to Pro plan', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Audio transcription endpoint
  app.post('/api/transcribe', isAuthenticated, async (req, res) => {
    try {
      const transcribeSchema = z.object({
        audio: z.string(), // Base64 encoded audio data
        format: z.string().optional().default('webm'),
      });

      const { audio, format } = transcribeSchema.parse(req.body);
      
      // Validate audio size (max ~5MB base64 = ~3.75MB actual)
      const maxBase64Length = 5 * 1024 * 1024; // 5MB base64
      if (audio.length > maxBase64Length) {
        return res.status(413).json({ error: 'Audio file too large. Maximum 5MB allowed.' });
      }
      
      // Decode base64 audio
      const audioBuffer = Buffer.from(audio, 'base64');
      
      // Transcribe using Groq Whisper
      const result = await transcribeAudio(audioBuffer, format);
      
      res.json(result);
    } catch (error) {
      console.error('Transcription error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid audio data', details: error.errors });
      }
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Transcription failed',
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  });

  // File upload endpoint with analysis
  app.post('/api/uploads', requireAuth, uploadRateLimiter, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const fileUploadSchema = z.object({
        name: z.string().min(1).max(255),
        mimeType: z.string().min(1),
        data: z.string(), // Base64 encoded file data
        analyze: z.boolean().optional().default(true), // Whether to analyze content
      });

      const { name, mimeType, data, analyze } = fileUploadSchema.parse(req.body);
      
      // Decode base64 data
      const buffer = Buffer.from(data, 'base64');

      const planMeta = (req as any).resolvedPlan as ResolvedPlanMetadata | undefined;
      const planRecord = planMeta?.record;
      const fallbackMax = (planMeta?.isProTier ?? false) ? PRO_MAX_UPLOAD_BYTES : FREE_MAX_UPLOAD_BYTES;
      const maxSize = planRecord
        ? planRecord.maxFileSizeMb === null
          ? Infinity
          : (planRecord.maxFileSizeMb ?? 0) > 0
            ? planRecord.maxFileSizeMb * 1024 * 1024
            : fallbackMax
        : fallbackMax;

      if (buffer.length > maxSize) {
        const readableMax = formatBytes(maxSize);
        return res.status(400).json({
          error: `File too large. Maximum size is ${readableMax}.`
        });
      }
      
      let analyzedContent: string | undefined;
      let analysisMetadata: Record<string, unknown> | null = null;
      
      // Analyze file content if requested
      if (analyze) {
        try {
          const analysisResult = await fileAnalysisService.analyzeFile(buffer, name, mimeType);
          analyzedContent = analysisResult.content;
          analysisMetadata = {
            ...analysisResult.metadata,
            summary: analysisResult.summary
          };
        } catch (analysisError) {
          console.warn('File analysis failed:', analysisError);
          // Continue without analysis if it fails
          analysisMetadata = {
            analysisError: analysisError instanceof Error ? analysisError.message : 'Analysis failed'
          };
        }
      }

      // Save file to storage with analysis results
      const attachment = await storage.saveFile(
        userId,
        buffer,
        name,
        mimeType,
        analyzedContent,
        analysisMetadata,
      );

      // Include analysis summary in response if available
      const response = {
        ...attachment,
        ...(analyzedContent && {
          hasAnalysis: true,
          contentPreview: analyzedContent.slice(0, 500) + (analyzedContent.length > 500 ? '...' : ''),
          metadata: analysisMetadata
        })
      };
      
      res.json(response);
    } catch (error) {
      if (error instanceof FileQuotaExceededError) {
        return res.status(413).json({ error: error.message });
      }
      console.error('File upload error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid file data', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to upload file', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // File serving endpoint
  app.get('/api/files/:id', requireAuth, fileAccessRateLimiter, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const file = await storage.getFileForUser(id, userId);

      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }

      // Security: Define safe MIME types that can be displayed inline
      const safeMimeTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf',
        'text/plain'
      ];

      // Security: Block dangerous MIME types
      const dangerousMimeTypes = [
        'text/html', 'application/xhtml+xml',
        'image/svg+xml',
        'application/javascript', 'text/javascript'
      ];

      const mimeType = file.mimeType.toLowerCase();
      const isSafe = safeMimeTypes.includes(mimeType);
      const isDangerous = dangerousMimeTypes.some(dangerous => mimeType.includes(dangerous));

      // Security headers
      const headers: Record<string, string> = {
        'Content-Length': file.size.toString(),
        'Cache-Control': 'private, max-age=0, no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'none';"
      };

      // Force download for unsafe or dangerous files
      if (!isSafe || isDangerous) {
        headers['Content-Type'] = 'application/octet-stream';
        headers['Content-Disposition'] = `attachment; filename="${file.name}"`;
      } else {
        headers['Content-Type'] = file.mimeType;
        headers['Content-Disposition'] = `inline; filename="${file.name}"`;
      }
      
      res.set(headers);
      res.send(file.buffer);
    } catch (error) {
      console.error('File serving error:', error);
      res.status(500).json({ error: 'Failed to serve file', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Get file analysis content
  app.get('/api/files/:id/analysis', requireAuth, fileAccessRateLimiter, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const file = await storage.getFileForUser(id, userId);

      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }
      
      if (!file.analyzedContent) {
        return res.status(404).json({ error: 'No analysis available for this file' });
      }
      
      res.json({
        id: file.id,
        name: file.name,
        content: file.analyzedContent,
        metadata: file.metadata
      });
    } catch (error) {
      console.error('File analysis serving error:', error);
      res.status(500).json({ error: 'Failed to serve file analysis', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Chat completion endpoint
  app.post('/api/chat/completions', requireAuth, async (req, res) => {
    try {
      const prepared = await prepareChatCompletionRequest(req);

      if (!prepared.hasContent && !prepared.hasAttachments) {
        throw new HttpError(400, 'Message must have content or attachments');
      }

      let response: Awaited<ReturnType<typeof aiService.getChatCompletion>> | null = null;

      if (prepared.shouldCallAI) {
        response = await aiService.getChatCompletion({
          model: prepared.model,
          messages: prepared.enrichedMessages,
          userId: prepared.userId,
          projectId: prepared.chatProjectId,
          maxTokens: 4000,
          temperature: 0.7,
          metadata: prepared.metadata,
        });
      }

      const validationResult = response && prepared.outputTemplate && response.content
        ? validateOutputTemplateContent(prepared.outputTemplate, response.content)
        : null;

      const assistantMetadata = response
        ? buildAssistantMetadata({
            baseMetadata: prepared.metadata,
            outputTemplate: prepared.outputTemplate,
            executedTools: response.executedTools,
            thinkingContent: response.thinkingContent,
            validation: validationResult,
          })
        : undefined;

      await persistChatMessages({
        chatId: prepared.chatId,
        userId: prepared.userId,
        metadata: prepared.metadata,
        validatedAttachments: prepared.validatedAttachments,
        hasAttachments: prepared.hasAttachments,
        lastMessageContent: prepared.lastMessage.content,
        model: prepared.model,
        responseContent: response?.content ?? (prepared.hasAttachments ? 'Files received successfully.' : null),
        responseMetadata: assistantMetadata,
        usage: response?.usage,
      });

      if (response) {
        res.json({
          ...response,
          ...(assistantMetadata ? { metadata: assistantMetadata } : {}),
        });
      } else {
        res.json({
          content: prepared.hasAttachments ? 'Files received successfully.' : 'Message saved.',
          role: 'assistant',
        });
      }
    } catch (error) {
      console.error('Chat completion error:', error);
      if (error instanceof HttpError) {
        return res.status(error.status).json({
          error: error.message,
          ...(error.detail ? { detail: error.detail } : {}),
        });
      }

      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  });

  app.post('/api/chat/completions/stream', requireAuth, async (req, res) => {
    let connectionClosed = false;
    let sendEvent: ((event: string, data: Record<string, unknown>) => void) | null = null;

    const endConnection = () => {
      if (!connectionClosed) {
        connectionClosed = true;
        res.end();
      }
    };

    try {
      const prepared = await prepareChatCompletionRequest(req);

      if (!prepared.hasContent && !prepared.hasAttachments) {
        throw new HttpError(400, 'Message must have content or attachments');
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      if (typeof (res as any).flushHeaders === 'function') {
        (res as any).flushHeaders();
      }

      req.on('close', () => {
        connectionClosed = true;
      });

      sendEvent = (event: string, data: Record<string, unknown>) => {
        if (connectionClosed) {
          return;
        }
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      const fallbackContent = prepared.hasAttachments ? 'Files received successfully.' : 'Message saved.';

      if (!prepared.shouldCallAI) {
        sendEvent?.('text_delta', { text: fallbackContent });
        await persistChatMessages({
          chatId: prepared.chatId,
          userId: prepared.userId,
          metadata: prepared.metadata,
          validatedAttachments: prepared.validatedAttachments,
          hasAttachments: prepared.hasAttachments,
          lastMessageContent: prepared.lastMessage.content,
          model: prepared.model,
          responseContent: fallbackContent,
        });
        sendEvent?.('done', { content: fallbackContent });
        endConnection();
        return;
      }

      let assistantMetadata: Record<string, unknown> | undefined;

      let finalContent = '';
      let inCode = false;
      let expectingLang = false;
      let pendingLang = '';
      let currentLangRaw = '';
      let currentLang = 'text';

      const emitText = (text: string) => {
        if (!text) return;
        sendEvent?.('text_delta', { text });
        finalContent += text;
      };

      const emitCode = (text: string) => {
        if (!text) return;
        sendEvent?.('code_delta', { text });
        finalContent += text;
      };

      const startCode = (langToken: string) => {
        currentLangRaw = langToken;
        currentLang = langToken || 'text';
        sendEvent?.('code_start', { lang: currentLang, rawLang: currentLangRaw });
        finalContent += '```' + (langToken ? langToken : '') + '\n';
        inCode = true;
      };

      const endCode = () => {
        sendEvent?.('code_end', {});
        finalContent += '```';
        inCode = false;
        currentLangRaw = '';
        currentLang = 'text';
      };

      const processChunk = (chunk: string): void => {
        if (!chunk) {
          return;
        }

        if (expectingLang) {
          const newlineIndex = chunk.search(/\r?\n/);
          if (newlineIndex === -1) {
            pendingLang += chunk;
            return;
          }

          pendingLang += chunk.slice(0, newlineIndex);
          startCode(pendingLang.trim());
          pendingLang = '';
          expectingLang = false;

          let remainder = chunk.slice(newlineIndex);
          if (remainder.startsWith('\r\n')) {
            remainder = remainder.slice(2);
          } else if (remainder.startsWith('\n') || remainder.startsWith('\r')) {
            remainder = remainder.slice(1);
          }

          processChunk(remainder);
          return;
        }

        if (inCode) {
          const endIndex = chunk.indexOf('```');
          if (endIndex === -1) {
            emitCode(chunk);
            return;
          }

          const codePart = chunk.slice(0, endIndex);
          emitCode(codePart);
          endCode();

          const remainder = chunk.slice(endIndex + 3);
          processChunk(remainder);
          return;
        }

        const startIndex = chunk.indexOf('```');
        if (startIndex === -1) {
          emitText(chunk);
          return;
        }

        const textPart = chunk.slice(0, startIndex);
        emitText(textPart);

        const afterFence = chunk.slice(startIndex + 3);
        const newlineIndex = afterFence.search(/\r?\n/);
        if (newlineIndex === -1) {
          pendingLang = afterFence;
          expectingLang = true;
          return;
        }

        const langToken = afterFence.slice(0, newlineIndex).trim();
        startCode(langToken);

        let remainder = afterFence.slice(newlineIndex);
        if (remainder.startsWith('\r\n')) {
          remainder = remainder.slice(2);
        } else if (remainder.startsWith('\n') || remainder.startsWith('\r')) {
          remainder = remainder.slice(1);
        }

        processChunk(remainder);
      };

      for await (const chunk of aiService.streamChatCompletion({
        model: prepared.model,
        messages: prepared.enrichedMessages,
        userId: prepared.userId,
        projectId: prepared.chatProjectId,
        expertId: prepared.expertId,
        maxTokens: 4000,
        temperature: 0.7,
        metadata: prepared.metadata,
        stream: true,
      })) {
        if (connectionClosed) {
          break;
        }
        processChunk(chunk);
      }

      if (expectingLang) {
        emitText('```' + pendingLang);
      }

      if (inCode) {
        endCode();
      }

      const persistedContent = finalContent || fallbackContent;

      const validationResult = prepared.outputTemplate
        ? validateOutputTemplateContent(prepared.outputTemplate, persistedContent)
        : null;

      const baseAssistantMetadata = buildAssistantMetadata({
        baseMetadata: prepared.metadata,
        outputTemplate: prepared.outputTemplate,
        validation: validationResult,
      });

      if (baseAssistantMetadata) {
        assistantMetadata = { ...baseAssistantMetadata };
      }

      if (prepared.expertId) {
        assistantMetadata = {
          ...(assistantMetadata ?? {}),
          expertId: prepared.expertId,
        };
      }

      await persistChatMessages({
        chatId: prepared.chatId,
        userId: prepared.userId,
        metadata: prepared.metadata,
        validatedAttachments: prepared.validatedAttachments,
        hasAttachments: prepared.hasAttachments,
        lastMessageContent: prepared.lastMessage.content,
        model: prepared.model,
        responseContent: persistedContent,
        responseMetadata: assistantMetadata,
      });

      sendEvent?.('done', {
        content: persistedContent,
        ...(assistantMetadata ? { metadata: assistantMetadata } : {}),
      });

      endConnection();
    } catch (error) {
      console.error('Streaming chat completion error:', error);

      if (res.headersSent) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (sendEvent) {
          sendEvent('error', { message });
        } else {
          res.write('event: error\n');
          res.write(`data: ${JSON.stringify({ message })}\n\n`);
        }
        endConnection();
        return;
      }

      if (error instanceof HttpError) {
        return res.status(error.status).json({
          error: error.message,
          ...(error.detail ? { detail: error.detail } : {}),
        });
      }

      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  });

  // Get user chats
  // List chats for authenticated user (optional projectId filtering)
  app.get('/api/chats', requireAuth, async (req, res) => {
    try {
      // Use authenticated user's ID for security
      const userId = (req as any).user.id;
      
      // Get projectId from query parameter
      // projectId can be:
      // - undefined: return all chats
      // - 'global': return only global chats (projectId IS NULL)
      // - specific project ID: return only chats for that project
      const projectIdParam = req.query.projectId as string | undefined;
      let projectId: string | null | undefined;
      
      if (projectIdParam === 'global') {
        projectId = null; // Filter for global chats only
      } else if (projectIdParam) {
        projectId = projectIdParam; // Filter for specific project
      } else {
        projectId = undefined; // No filter, return all
      }
      
      const chats = await storage.getUserChats(userId, false, projectId);
      res.json(chats);
    } catch (error) {
      console.error('Get chats error:', error);
      res.status(500).json({ error: 'Failed to get chats', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Backward-compatible route with userId param (ignored, uses auth user)
  app.get('/api/chats/:userId', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const projectIdParam = req.query.projectId as string | undefined;
      let projectId: string | null | undefined;
      if (projectIdParam === 'global') {
        projectId = null;
      } else if (projectIdParam) {
        projectId = projectIdParam;
      } else {
        projectId = undefined;
      }
      const chats = await storage.getUserChats(userId, false, projectId);
      res.json(chats);
    } catch (error) {
      console.error('Get chats error:', error);
      res.status(500).json({ error: 'Failed to get chats', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Create new chat
  app.post('/api/chats', requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const isAdminRole = user?.role === 'admin' || user?.role === 'super_admin';

      // Parse the chat data (excluding userId which we'll add from auth)
      const parsed = insertChatSchema.parse(req.body);

      // Normalize model selection with sensible fallbacks
      let selectedModelId = parsed.model || getDefaultModel();
      let modelConfig = getModelConfig(selectedModelId);

      // If the selected model is not configured at runtime, fall back to default
      if (!modelConfig) {
        selectedModelId = getDefaultModel();
        modelConfig = getModelConfig(selectedModelId);
      }

      const chatData = { ...parsed, model: selectedModelId };
      const planMeta = (req as any).resolvedPlan as ResolvedPlanMetadata | undefined;
      const isProTier = planMeta?.isProTier ?? false;

      if (!isAdminRole && modelConfig && !isProTier && modelConfig.provider !== 'groq') {
        return res.status(403).json({
          error: 'Upgrade required',
          message: 'Free plan users can only access Groq models. Upgrade to Pro for OpenAI, Claude, and Perplexity.',
        });
      }

      // Ensure chat is created for the authenticated user
      const chatWithUser = {
        userId: (req as any).user.id,
        ...chatData,
      };
      const chat = await storage.createChat(chatWithUser);
      res.json(chat);
    } catch (error) {
      console.error('Create chat error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid chat data', details: error.errors });
      }
      res
        .status(500)
        .json({ error: 'Failed to create chat', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Get chat messages
  app.get('/api/chats/:chatId/messages', requireAuth, async (req, res) => {
    try {
      const { chatId } = req.params;
      const userId = (req as any).user.id;
      
      // Verify chat belongs to user
      const chat = await storage.getChat(chatId);
      if (!chat || chat.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const messages = await storage.getChatMessages(chatId);
      res.json(messages);
    } catch (error) {
      console.error('Get messages error:', error);
      res.status(500).json({ error: 'Failed to get messages', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Archive chat
  app.patch('/api/chats/:chatId/archive', requireAuth, async (req, res) => {
    try {
      const { chatId } = req.params;
      const userId = (req as any).user.id;
      
      // Verify chat belongs to user
      const chat = await storage.getChat(chatId);
      if (!chat || chat.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const archived = await storage.archiveChat(chatId);
      if (archived) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Chat not found' });
      }
    } catch (error) {
      console.error('Archive chat error:', error);
      res.status(500).json({ error: 'Failed to archive chat', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Get archived chats
  app.get('/api/chats/archived', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const archivedChats = await storage.getArchivedChats(userId);
      res.json(archivedChats);
    } catch (error) {
      console.error('Get archived chats error:', error);
      res.status(500).json({ error: 'Failed to get archived chats', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Restore archived chat
  app.patch('/api/chats/:chatId/restore', requireAuth, async (req, res) => {
    try {
      const { chatId } = req.params;
      const userId = (req as any).user.id;
      
      // Verify chat belongs to user
      const chat = await storage.getChat(chatId);
      if (!chat || chat.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const restored = await storage.updateChat(chatId, { status: 'active' });
      if (restored) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Chat not found' });
      }
    } catch (error) {
      console.error('Restore chat error:', error);
      res.status(500).json({ error: 'Failed to restore chat', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Rename chat
  app.patch('/api/chats/:chatId/rename', requireAuth, async (req, res) => {
    try {
      const { chatId } = req.params;
      const { title } = req.body;
      const userId = (req as any).user.id;
      
      // Validate title
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).json({ error: 'Title is required' });
      }
      
      if (title.length > 200) {
        return res.status(400).json({ error: 'Title must be 200 characters or less' });
      }
      
      // Verify chat belongs to user
      const chat = await storage.getChat(chatId);
      if (!chat || chat.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      // Update chat title
      const updated = await storage.updateChat(chatId, { title: title.trim() });
      if (updated) {
        res.json({ success: true, title: updated.title });
      } else {
        res.status(404).json({ error: 'Chat not found' });
      }
    } catch (error) {
      console.error('Rename chat error:', error);
      res.status(500).json({ error: 'Failed to rename chat', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Move chat to project (or back to global)
  app.patch('/api/chats/:chatId/move-to-project', requireAuth, async (req, res) => {
    try {
      const { chatId } = req.params;
      const { projectId } = req.body; // null to move to global, string to move to project
      const userId = (req as any).user.id;
      
      // Verify chat belongs to user
      const chat = await storage.getChat(chatId);
      if (!chat || chat.userId !== userId) {
        return res.status(403).json({ error: 'Access denied to this chat' });
      }
      
      // If moving to a project, verify user owns the project
      if (projectId) {
        const project = await storage.getProject(projectId);
        if (!project || project.userId !== userId) {
          return res.status(403).json({ error: 'Access denied to this project' });
        }
      }
      
      // Update chat's projectId
      const updated = await storage.updateChat(chatId, { projectId });
      if (updated) {
        res.json({ success: true, projectId });
      } else {
        res.status(404).json({ error: 'Chat not found' });
      }
    } catch (error) {
      console.error('Move chat to project error:', error);
      res.status(500).json({ error: 'Failed to move chat', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Delete chat
  app.delete('/api/chats/:chatId', requireAuth, async (req, res) => {
    try {
      const { chatId } = req.params;
      const userId = (req as any).user.id;
      
      // Verify chat belongs to user
      const chat = await storage.getChat(chatId);
      if (!chat || chat.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const deleted = await storage.deleteChat(chatId);
      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Chat not found' });
      }
    } catch (error) {
      console.error('Delete chat error:', error);
      res.status(500).json({ error: 'Failed to delete chat', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Reaction endpoints (protected by auth middleware)
  // Get reactions for a message
  app.get('/api/messages/:messageId/reactions', requireAuth, async (req, res) => {
    try {
      const { messageId } = req.params;
      const userId = (req as any).user.id;
      
      // Verify message belongs to a chat owned by user
      const message = await storage.getMessage(messageId);
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }
      
      const chat = await storage.getChat(message.chatId);
      if (!chat || chat.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const reactions = await storage.getMessageReactions(messageId);
      res.json(reactions);
    } catch (error) {
      console.error('Get reactions error:', error);
      res.status(500).json({ error: 'Failed to get reactions', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Create or update a reaction
  app.post('/api/messages/:messageId/reactions', requireAuth, async (req, res) => {
    try {
      const { messageId } = req.params;
      const requestBodySchema = z.object({ type: reactionTypeSchema });
      const { type } = requestBodySchema.parse(req.body);
      const userId = (req as any).user.id;

      // Verify message belongs to a chat owned by user
      const message = await storage.getMessage(messageId);
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }
      
      const chat = await storage.getChat(message.chatId);
      if (!chat || chat.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Check if user already has a reaction for this message
      const existingReaction = await storage.getUserReaction(messageId, userId);
      
      if (existingReaction) {
        // Update existing reaction
        const updatedReaction = await storage.updateReaction(existingReaction.id, type);
        res.json(updatedReaction);
      } else {
        // Create new reaction
        const newReaction = await storage.createReaction({ messageId, userId, type });
        res.json(newReaction);
      }
    } catch (error) {
      console.error('Create/update reaction error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid reaction data', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to save reaction', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Delete a reaction
  app.delete('/api/messages/:messageId/reactions', requireAuth, async (req, res) => {
    try {
      const { messageId } = req.params;
      const userId = (req as any).user.id;
      
      // Verify message belongs to a chat owned by user
      const message = await storage.getMessage(messageId);
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }
      
      const chat = await storage.getChat(message.chatId);
      if (!chat || chat.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const reaction = await storage.getUserReaction(messageId, userId);
      
      if (!reaction) {
        return res.status(404).json({ error: 'Reaction not found' });
      }
      
      const deleted = await storage.deleteReaction(reaction.id);
      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(500).json({
          error: 'Failed to delete reaction',
          detail: 'The reaction could not be removed from storage.',
        });
      }
    } catch (error) {
      console.error('Delete reaction error:', error);
      res.status(500).json({ error: 'Failed to delete reaction', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Usage metrics endpoints
  app.get('/api/usage/user/summary', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const { dateFrom, dateTo } = req.query;

      const from = parseDateParam(dateFrom);
      const to = parseDateParam(dateTo);

      // Fetch analytics events instead of old usage metrics
      const analyticsEvents = await storage.getAnalyticsEvents({ 
        userId,
        dateFrom: from,
        dateTo: to
      });

      // Map analytics events to UsageMetric format for buildUsageSummary
      const metrics = analyticsEvents.map(event => ({
        id: event.id,
        userId: event.userId,
        chatId: event.chatId || '',
        messageId: null,
        model: event.model,
        promptTokens: String(event.inputTokens),
        completionTokens: String(event.outputTokens),
        totalTokens: String(event.totalTokens),
        createdAt: event.createdAt,
      }));

      res.json(buildUsageSummary(metrics, { from, to }));
    } catch (error) {
      console.error('Get usage summary error:', error);
      res.status(500).json({ error: 'Failed to get usage summary', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.get('/api/usage/user', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const { dateFrom, dateTo } = req.query;

      const from = parseDateParam(dateFrom);
      const to = parseDateParam(dateTo);

      // Fetch analytics events instead of old usage metrics
      const analyticsEvents = await storage.getAnalyticsEvents({ 
        userId,
        dateFrom: from,
        dateTo: to
      });

      // Map analytics events to UsageMetric format
      const metrics = analyticsEvents.map(event => ({
        id: event.id,
        userId: event.userId,
        chatId: event.chatId || '',
        messageId: null,
        model: event.model,
        promptTokens: String(event.inputTokens),
        completionTokens: String(event.outputTokens),
        totalTokens: String(event.totalTokens),
        createdAt: event.createdAt,
      }));

      res.json(metrics);
    } catch (error) {
      console.error('Get user usage metrics error:', error);
      res.status(500).json({ error: 'Failed to get usage metrics', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.get('/api/usage/chat/:chatId', requireAuth, async (req, res) => {
    try {
      const { chatId } = req.params;
      const userId = (req as any).user.id;
      
      // Verify chat belongs to user
      const chat = await storage.getChat(chatId);
      if (!chat || chat.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const metrics = await storage.getChatUsageMetrics(chatId);
      res.json(metrics);
    } catch (error) {
      console.error('Get chat usage metrics error:', error);
      res.status(500).json({ error: 'Failed to get chat usage metrics', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // CSV export endpoint for analytics
  app.get('/api/usage/export/csv', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const { dateFrom, dateTo, provider } = req.query;

      const from = parseDateParam(dateFrom);
      const to = parseDateParam(dateTo);

      // Fetch analytics events with filters
      const analyticsEvents = await storage.getAnalyticsEvents({ 
        userId,
        dateFrom: from,
        dateTo: to,
        provider: provider as string | undefined,
      });

      // Helper function to escape CSV values
      const escapeCSV = (value: string | null | undefined): string => {
        if (!value) return '';
        // Replace newlines with spaces and escape quotes
        const cleaned = value.replace(/[\r\n]+/g, ' ').trim();
        // Wrap in quotes if contains comma, quote, or was multi-line
        if (cleaned.includes(',') || cleaned.includes('"') || value.includes('\n')) {
          return `"${cleaned.replace(/"/g, '""')}"`;
        }
        return cleaned;
      };

      // Generate CSV headers with all analytics fields
      const csvHeaders = [
        'Request ID',
        'Timestamp',
        'User ID',
        'Chat ID',
        'Project ID',
        'Expert ID',
        'Template ID',
        'Provider',
        'Model',
        'Status',
        'Input Tokens',
        'Output Tokens',
        'Total Tokens',
        'Tokens Estimated',
        'Latency (ms)',
        'Cost (USD)',
        'Error Code',
        'Error Message',
      ].join(',');

      // Generate CSV rows with all fields
      const csvRows = analyticsEvents.map(event => {
        const timestamp = event.createdAt ? new Date(event.createdAt).toISOString() : '';
        
        return [
          event.requestId || '',
          timestamp,
          event.userId || '',
          event.chatId || '',
          event.projectId || '',
          event.expertId || '',
          event.templateId || '',
          event.provider,
          event.model,
          event.status,
          event.inputTokens,
          event.outputTokens,
          event.totalTokens,
          event.tokensEstimated ? 'Yes' : 'No',
          event.latencyMs,
          event.costUsd,
          escapeCSV(event.errorCode),
          escapeCSV(event.errorMessage),
        ].join(',');
      });

      const csv = [csvHeaders, ...csvRows].join('\n');

      // Set headers for file download
      const filename = `usage-analytics-${new Date().toISOString().split('T')[0]}.csv`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      console.error('Export CSV error:', error);
      res.status(500).json({ error: 'Failed to export CSV', detail: error instanceof Error ? error.message : undefined });
    }
  });
  
  // User preferences endpoints
  app.get('/api/user/preferences', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const preferences = await storage.getUserPreferences(userId);
      
      if (!preferences) {
        // Return default preferences if none exist
        return res.json({
          personalizationEnabled: false,
          customInstructions: '',
          name: '',
          occupation: '',
          bio: '',
          profileImageUrl: '',
          memories: [],
          chatHistoryEnabled: true,
          autonomousCodeExecution: true
        });
      }

      res.json({
        personalizationEnabled: preferences.personalizationEnabled === 'true',
        customInstructions: preferences.customInstructions || '',
        name: preferences.name || '',
        occupation: preferences.occupation || '',
        bio: preferences.bio || '',
        profileImageUrl: preferences.profileImageUrl || '',
        memories: preferences.memories || [],
        chatHistoryEnabled: preferences.chatHistoryEnabled === 'true',
        autonomousCodeExecution: preferences.autonomousCodeExecution === 'true'
      });
    } catch (error) {
      console.error('Get user preferences error:', error);
      res.status(500).json({ error: 'Failed to get user preferences', detail: error instanceof Error ? error.message : undefined });
    }
  });
  
  app.post('/api/user/preferences', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const { personalizationEnabled, customInstructions, name, occupation, bio, profileImageUrl, memories, chatHistoryEnabled, autonomousCodeExecution } = req.body;
      
      const preferences = await storage.saveUserPreferences(userId, {
        userId,
        personalizationEnabled: personalizationEnabled ? 'true' : 'false',
        customInstructions,
        name,
        occupation,
        bio,
        profileImageUrl,
        memories: memories || [],
        chatHistoryEnabled: chatHistoryEnabled !== false ? 'true' : 'false',
        autonomousCodeExecution: autonomousCodeExecution !== false ? 'true' : 'false'
      });

      res.json({
        personalizationEnabled: preferences.personalizationEnabled === 'true',
        customInstructions: preferences.customInstructions || '',
        name: preferences.name || '',
        occupation: preferences.occupation || '',
        bio: preferences.bio || '',
        profileImageUrl: preferences.profileImageUrl || '',
        memories: preferences.memories || [],
        chatHistoryEnabled: preferences.chatHistoryEnabled === 'true',
        autonomousCodeExecution: preferences.autonomousCodeExecution === 'true'
      });
    } catch (error) {
      console.error('Save user preferences error:', error);
      res.status(500).json({ error: 'Failed to save user preferences', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // User API key management
  app.get('/api/user/api-keys', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const keys = await storage.getUserApiKeys(userId);
      const response = keys.map(key => ({
        provider: key.provider,
        configured: Boolean(key.apiKey),
        lastFour: key.apiKeyLastFour,
        updatedAt: key.updatedAt,
        createdAt: key.createdAt,
      }));
      res.json(response);
    } catch (error) {
      console.error('Get user API keys error:', error);
      res.status(500).json({ error: 'Failed to fetch API keys', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.post('/api/user/api-keys', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const bodySchema = z.object({
        provider: apiProviderSchema,
        apiKey: z.string().min(1, 'API key is required').max(200),
      });

      const { provider, apiKey } = bodySchema.parse(req.body);
      const sanitizedKey = apiKey.trim();

      if (!sanitizedKey) {
        return res.status(400).json({ error: 'API key is required' });
      }

      const record = await storage.upsertUserApiKey(userId, provider, sanitizedKey);

      res.json({
        provider: record.provider,
        configured: true,
        lastFour: record.apiKeyLastFour,
        updatedAt: record.updatedAt,
      });
    } catch (error) {
      console.error('Save user API key error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: 'Failed to save API key', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.delete('/api/user/api-keys/:provider', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const provider = apiProviderSchema.parse(req.params.provider);

      const deleted = await storage.deleteUserApiKey(userId, provider);

      if (!deleted) {
        return res.status(404).json({ error: 'API key not found' });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Delete user API key error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: 'Failed to delete API key', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // User endpoint to list active experts
  app.get('/api/experts', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      
      // Get user's plan details
      const plan = await storage.getUserPlanWithDetails(userId);
      
      // Check if plan allows experts
      if (!plan || !plan.allowExperts) {
        // Check if we should show an upsell message
        if (plan?.showExpertsUpsell) {
          return res.json({ 
            experts: [],
            showUpsell: true,
            upsellMessage: 'Upgrade to Pro or Enterprise to access AI Experts'
          });
        }
        // Otherwise just return empty list
        return res.json({ experts: [] });
      }

      // Get available experts based on user's plan
      const planFilteredExperts = await storage.getAvailableExperts(userId);

      // Also filter by release if applicable
      const release = await storage.getActiveRelease().catch(() => undefined);
      const releaseAllowed = release ? new Set((release.expertIds ?? []).filter(Boolean)) : null;
      
      // Apply both filters: plan and release
      let filtered = planFilteredExperts;
      if (releaseAllowed) {
        filtered = planFilteredExperts.filter((expert) => releaseAllowed.has(expert.id));
      }

      res.json({ experts: filtered });
    } catch (error) {
      console.error('Failed to list active experts:', error);
      res.status(500).json({ error: 'Unable to load experts', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // User endpoint to list available templates
  app.get('/api/templates', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      
      // Get user's plan to check if templates are allowed
      const plan = await storage.getUserPlan(userId);
      
      // Check if templates are allowed for this plan
      if (plan && !plan.allowTemplates) {
        // Check if we should show upsell message
        if (plan.showTemplatesUpsell) {
          return res.json({
            templates: [],
            planRestricted: true,
            upsellMessage: 'Upgrade to access document templates for your conversations'
          });
        }
        // Otherwise just return empty list
        return res.json({ templates: [] });
      }

      // Get available templates based on user's plan
      const availableTemplates = await storage.getAvailableTemplates(userId);
      
      // Also filter by release if applicable
      const release = await storage.getActiveRelease().catch(() => undefined);
      const releaseAllowed = release ? new Set((release.templateIds ?? []).filter(Boolean)) : null;
      
      // Apply both filters: plan and release
      let filtered = availableTemplates;
      if (releaseAllowed) {
        filtered = availableTemplates.filter((template) => releaseAllowed.has(template.id));
      }

      res.json({ templates: filtered.map(serializeTemplate) });
    } catch (error) {
      console.error('Failed to list templates:', error);
      res.status(500).json({ error: 'Unable to load templates', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.get('/api/templates/:id/file', requireAuth, fileAccessRateLimiter, async (req, res) => {
    try {
      const templateId = req.params.id;
      const user = (req as any).user as User;

      const template = await storage.getTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      const resolvedPlan = await authService.getResolvedPlanMetadataForUserId(user.id);
      const release = await storage.getActiveRelease().catch(() => undefined);
      if (!isTemplateAccessibleToUser(template, resolvedPlan ?? undefined, release)) {
        return res.status(404).json({ error: 'Template not available' });
      }

      const file = await storage.getFileForUser(template.fileId, TEMPLATE_FILE_OWNER);
      if (!file) {
        return res.status(404).json({ error: 'Template file not found' });
      }

      res.set({
        'Content-Type': file.mimeType,
        'Content-Length': file.size.toString(),
        'Content-Disposition': `attachment; filename="${file.name}"`,
        'Cache-Control': 'private, max-age=60',
      });
      res.send(file.buffer);
    } catch (error) {
      console.error('Failed to fetch template file:', error);
      res.status(500).json({ error: 'Unable to fetch template file', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.get('/api/output-templates', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      
      // Get user's plan to check if templates are allowed
      const plan = await storage.getUserPlan(userId);
      
      // Check if templates are allowed for this plan
      if (plan && !plan.allowTemplates) {
        // Check if we should show upsell message
        if (plan.showTemplatesUpsell) {
          return res.json({
            templates: [],
            planRestricted: true,
            upsellMessage: 'Upgrade to access output templates for structured responses'
          });
        }
        // Otherwise just return empty list
        return res.json({ templates: [] });
      }

      // Get available output templates based on user's plan
      const availableTemplates = await storage.getAvailableOutputTemplates(userId);
      
      // Also filter by release if applicable
      const release = await storage.getActiveRelease().catch(() => undefined);
      const releaseAllowed = release ? new Set((release.outputTemplateIds ?? []).filter(Boolean)) : null;
      
      // Apply both filters: plan and release
      let filtered = availableTemplates;
      if (releaseAllowed) {
        filtered = availableTemplates.filter((template) => releaseAllowed.has(template.id));
      }

      res.json({ templates: filtered.map(serializeOutputTemplate) });
    } catch (error) {
      console.error('Failed to list output templates:', error);
      res.status(500).json({ error: 'Unable to load output templates', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.get('/api/integrations/n8n/workflows', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const apiKeyRecord = await storage.getUserApiKey(userId, 'n8n');

      if (!apiKeyRecord?.apiKey) {
        return res.status(400).json({ error: 'N8N API key not configured' });
      }

      const configuredBaseUrl = (process.env.N8N_BASE_URL || DEFAULT_N8N_BASE_URL).trim();
      let baseUrl: string;

      try {
        const parsed = new URL(configuredBaseUrl);
        baseUrl = parsed.toString().replace(/\/$/, '');
      } catch (urlError) {
        console.error('Invalid N8N base URL configuration:', urlError);
        return res.status(500).json({ error: 'Invalid N8N base URL configuration' });
      }

      let n8nResponse: globalThis.Response;
      const sanitizedKey = apiKeyRecord.apiKey.trim();
      const requestHeaders: Record<string, string> = {
        'X-N8N-API-KEY': sanitizedKey,
        Accept: 'application/json',
      };

      if (sanitizedKey.toLowerCase().startsWith('n8n_pat_')) {
        requestHeaders.Authorization = `Bearer ${sanitizedKey}`;
      }

      try {
        n8nResponse = await fetch(`${baseUrl}/rest/workflows`, {
          headers: requestHeaders,
        });
      } catch (networkError) {
        console.error('N8N workflow fetch network error:', networkError);
        return res.status(502).json({
          error: 'Could not reach N8N instance',
          detail: networkError instanceof Error ? networkError.message : String(networkError),
        });
      }

      if (!n8nResponse.ok) {
        const detail = await n8nResponse.text();
        return res.status(n8nResponse.status).json({
          error: 'Failed to fetch workflows from N8N',
          detail: detail.slice(0, 500),
        });
      }

      let payload: unknown;
      try {
        payload = await n8nResponse.json();
      } catch (parseError) {
        console.error('Failed to parse N8N workflow response:', parseError);
        return res.status(502).json({ error: 'N8N responded with invalid JSON' });
      }

      const workflowsArray: any[] = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as any)?.data)
          ? (payload as any).data
          : [];

      const normalizeWebhookUrls = (workflow: any): string[] => {
        const collected = new Set<string>();
        const candidates: unknown[] = [];

        if (Array.isArray(workflow?.webhookUrls)) {
          candidates.push(...workflow.webhookUrls);
        }

        if (workflow?.webhookUrls && typeof workflow.webhookUrls === 'object' && !Array.isArray(workflow.webhookUrls)) {
          for (const value of Object.values(workflow.webhookUrls as Record<string, unknown>)) {
            if (Array.isArray(value)) {
              candidates.push(...value);
            } else {
              candidates.push(value);
            }
          }
        }

        if (Array.isArray(workflow?.webhooks)) {
          candidates.push(...workflow.webhooks);
        }

        for (const value of candidates) {
          if (typeof value === 'string') {
            collected.add(value);
            continue;
          }

          if (value && typeof value === 'object') {
            const url = (value as any).url;
            const path = (value as any).path;

            if (typeof url === 'string') {
              collected.add(url);
            } else if (typeof path === 'string') {
              collected.add(`${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`);
            }
          }
        }

        return Array.from(collected);
      };

      const workflows = workflowsArray
        .filter((workflow) => workflow && (workflow.id ?? workflow.name))
        .map((workflow) => {
          const idValue = workflow.id ?? workflow.name;
          const id = typeof idValue === 'string' ? idValue : String(idValue);
          const name = typeof workflow.name === 'string' ? workflow.name : `Workflow ${id}`;
          const tags = Array.isArray(workflow.tags)
            ? workflow.tags
                .map((tag: any) => {
                  if (typeof tag === 'string') return tag;
                  if (tag && typeof tag.name === 'string') return tag.name;
                  return null;
                })
                .filter((tag: string | null): tag is string => Boolean(tag))
            : [];

          return {
            id,
            name,
            active: Boolean(workflow.active),
            versionId: workflow.versionId ?? null,
            tags,
            description:
              typeof workflow.description === 'string'
                ? workflow.description
                : typeof workflow.notes === 'string'
                  ? workflow.notes
                  : null,
            createdAt: workflow.createdAt ?? null,
            updatedAt: workflow.updatedAt ?? workflow.updatedAtAt ?? null,
            webhookUrls: normalizeWebhookUrls(workflow),
          };
        });

      res.json({ baseUrl, workflows });
    } catch (error) {
      console.error('N8N workflow fetch error:', error);
      res.status(500).json({
        error: 'Failed to fetch workflows from N8N',
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  });

  app.get('/api/integrations/n8n/agents', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const agents = await storage.getN8nAgents(userId);
      res.json(agents);
    } catch (error) {
      console.error('Fetch N8N agents error:', error);
      res.status(500).json({
        error: 'Failed to fetch N8N agents',
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  });

  app.post('/api/integrations/n8n/agents', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const payload = createN8nAgentSchema.parse(req.body);
      const agent = await storage.createN8nAgent(userId, {
        ...payload,
        metadata: payload.metadata ?? null,
      });
      res.status(201).json(agent);
    } catch (error) {
      console.error('Create N8N agent error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({
        error: 'Failed to save N8N agent',
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  });

  app.delete('/api/integrations/n8n/agents/:id', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const deleted = await storage.deleteN8nAgent(userId, id);

      if (!deleted) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Delete N8N agent error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({
        error: 'Failed to delete N8N agent',
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  });

  const n8nTestSchema = z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']).default('POST'),
    payload: z.unknown().optional(),
    headers: z.record(z.string(), z.string()).optional(),
  });

  app.post('/api/integrations/n8n/agents/:id/test', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const agent = await findUserN8nAgent(userId, id);

      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      if (!agent.webhookUrl) {
        return res.status(400).json({ error: 'Agent does not have a webhook URL configured' });
      }

      const input = n8nTestSchema.parse(req.body ?? {});

      const forwardedHeaders: Record<string, string> = {};
      for (const [headerName, value] of Object.entries(req.headers)) {
        if (!value) continue;
        const lower = headerName.toLowerCase();
        if (lower === 'host' || lower === 'content-length' || lower === 'connection') {
          continue;
        }

        if (typeof value === 'string') {
          forwardedHeaders[headerName] = value;
        } else if (Array.isArray(value) && value.length > 0) {
          forwardedHeaders[headerName] = value.join(', ');
        }
      }

      if (input.headers) {
        for (const [headerName, headerValue] of Object.entries(input.headers)) {
          forwardedHeaders[headerName] = headerValue;
        }
      }

      let requestBody: BodyInit | undefined;
      const methodAllowsBody = input.method !== 'GET' && input.method !== 'HEAD';
      if (methodAllowsBody && typeof input.payload !== 'undefined') {
        if (typeof input.payload === 'string') {
          requestBody = input.payload;
        } else {
          requestBody = JSON.stringify(input.payload);
          const hasContentType = Object.keys(forwardedHeaders).some(
            (name) => name.toLowerCase() === 'content-type',
          );
          if (!hasContentType) {
            forwardedHeaders['Content-Type'] = 'application/json';
          }
        }
      }

      let status: 'success' | 'error' = 'success';
      let httpStatus: number | null = null;
      let payloadExcerpt: string | null = null;
      let errorDetails: string | null = null;

      try {
        const response = await fetch(agent.webhookUrl, {
          method: input.method,
          headers: forwardedHeaders,
          body: requestBody,
        });

        httpStatus = response.status;
        const text = await response.text();
        payloadExcerpt = text ? text.slice(0, 2000) : null;

        if (!response.ok) {
          status = 'error';
          errorDetails = `Webhook responded with status ${response.status}`;
        }
      } catch (networkError) {
        status = 'error';
        errorDetails = networkError instanceof Error ? networkError.message : String(networkError);
      }

      if (errorDetails) {
        errorDetails = errorDetails.slice(0, 500);
      }

      const run = await storage.createN8nAgentRun(agent.id, {
        status,
        httpStatus,
        payloadExcerpt,
        errorDetails,
      });

      const responseStatus = status === 'success' ? 200 : httpStatus ?? 502;
      res.status(responseStatus).json({
        run: {
          ...run,
          createdAt: ensureIsoString(run.createdAt),
        },
      });
    } catch (error) {
      console.error('Test N8N agent webhook error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message ?? 'Invalid test payload' });
      }
      res.status(500).json({
        error: 'Failed to trigger N8N webhook',
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  });

  app.get('/api/integrations/n8n/agents/:id/runs', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const agent = await findUserN8nAgent(userId, id);

      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
      let limit: number | undefined = undefined;
      if (typeof limitRaw === 'string' && limitRaw.trim() !== '') {
        const parsed = Number(limitRaw);
        if (Number.isFinite(parsed) && parsed >= 0) {
          limit = Math.min(100, Math.floor(parsed));
        }
      }

      const effectiveLimit = typeof limit === 'number' ? limit : 20;
      const runs = await storage.listN8nAgentRuns(agent.id, effectiveLimit);

      res.json({
        runs: runs.map((run) => ({
          ...run,
          createdAt: ensureIsoString(run.createdAt),
        })),
      });
    } catch (error) {
      console.error('List N8N agent runs error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message ?? 'Invalid agent identifier' });
      }
      res.status(500).json({
        error: 'Failed to load N8N agent runs',
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  });

  // Google Drive OAuth routes
  app.get('/auth/google', requireAuth, (req, res) => {
    try {
      const redirectUri = `${req.protocol}://${req.get('host')}/auth/google/callback`;
      
      console.log('Google OAuth setup - Client ID:', process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + '...');
      console.log('Google OAuth setup - Redirect URI:', redirectUri);
      
      const driveService = new GoogleDriveService(
        process.env.GOOGLE_CLIENT_ID!,
        process.env.GOOGLE_CLIENT_SECRET!,
        redirectUri
      );
      
      // Generate CSRF protection state
      const state = randomUUID();
      res.cookie('oauth_state', state, {
        httpOnly: true,
        secure: req.protocol === 'https',
        sameSite: 'lax',
        maxAge: 10 * 60 * 1000, // 10 minutes
      });
      
      const authUrl = driveService.getAuthUrl(state);
      console.log('Generated auth URL:', authUrl.substring(0, 150) + '...');
      res.redirect(authUrl);
    } catch (error) {
      console.error('Google OAuth init error:', error);
      res.status(500).json({ error: 'Failed to initiate Google authentication', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.get('/auth/google/callback', requireAuth, async (req, res) => {
    try {
      const { code, state } = req.query;
      const storedState = req.cookies.oauth_state;
      
      // Verify CSRF state
      if (!state || !storedState || state !== storedState) {
        return res.redirect('/google-drive?error=invalid_state');
      }
      
      // Clear state cookie
      res.clearCookie('oauth_state');
      
      if (!code) {
        return res.redirect('/google-drive?error=no_code');
      }
      
      const userId = (req as any).user.id;
      const redirectUri = `${req.protocol}://${req.get('host')}/auth/google/callback`;
      
      const driveService = new GoogleDriveService(
        process.env.GOOGLE_CLIENT_ID!,
        process.env.GOOGLE_CLIENT_SECRET!,
        redirectUri
      );
      
      const tokens = await driveService.exchangeCodeForTokens(code as string);
      
      // Save tokens to database
      await storage.saveOAuthToken({
        userId,
        provider: 'google',
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        scopes: tokens.scope ? tokens.scope.split(' ') : null,
      });
      
      // Redirect to Google Drive page with success message
      res.redirect('/google-drive?connected=true');
    } catch (error) {
      console.error('Google OAuth callback error:', error);
      res.redirect('/google-drive?error=auth_failed');
    }
  });

  // Google Drive files list
  app.get('/api/google-drive/files', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const { pageToken } = req.query;
      
      const token = await storage.getOAuthToken(userId, 'google');
      
      if (!token) {
        return res.status(401).json({ error: 'Google Drive not connected', needsAuth: true });
      }
      
      const redirectUri = `${req.protocol}://${req.get('host')}/auth/google/callback`;
      const driveService = new GoogleDriveService(
        process.env.GOOGLE_CLIENT_ID!,
        process.env.GOOGLE_CLIENT_SECRET!,
        redirectUri
      );
      
      driveService.setTokens(
        token.accessToken,
        token.refreshToken || undefined,
        token.tokenExpiry ? new Date(token.tokenExpiry).getTime() : undefined
      );
      
      // Pre-emptively refresh token if expiring soon (within 60 seconds)
      const expiryTime = token.tokenExpiry ? new Date(token.tokenExpiry).getTime() : 0;
      const now = Date.now();
      if (expiryTime && (expiryTime - now < 60000)) {
        const newTokens = await driveService.refreshTokenIfNeeded();
        await storage.updateOAuthToken(userId, 'google', {
          accessToken: newTokens.access_token!,
          refreshToken: newTokens.refresh_token || token.refreshToken,
          tokenExpiry: newTokens.expiry_date ? new Date(newTokens.expiry_date) : null,
        });
      }
      
      const files = await driveService.listFiles(20, pageToken as string | undefined);
      
      res.json(files);
    } catch (error) {
      console.error('Google Drive files error:', error);
      res.status(500).json({ error: 'Failed to fetch Google Drive files', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Google Drive file content
  app.get('/api/google-drive/file/:fileId', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const { fileId } = req.params;
      
      const token = await storage.getOAuthToken(userId, 'google');
      
      if (!token) {
        return res.status(401).json({ error: 'Google Drive not connected', needsAuth: true });
      }
      
      const redirectUri = `${req.protocol}://${req.get('host')}/auth/google/callback`;
      const driveService = new GoogleDriveService(
        process.env.GOOGLE_CLIENT_ID!,
        process.env.GOOGLE_CLIENT_SECRET!,
        redirectUri
      );
      
      driveService.setTokens(
        token.accessToken,
        token.refreshToken || undefined,
        token.tokenExpiry ? new Date(token.tokenExpiry).getTime() : undefined
      );
      
      // Pre-emptively refresh token if expiring soon
      const expiryTime = token.tokenExpiry ? new Date(token.tokenExpiry).getTime() : 0;
      const now = Date.now();
      if (expiryTime && (expiryTime - now < 60000)) {
        const newTokens = await driveService.refreshTokenIfNeeded();
        await storage.updateOAuthToken(userId, 'google', {
          accessToken: newTokens.access_token!,
          refreshToken: newTokens.refresh_token || token.refreshToken,
          tokenExpiry: newTokens.expiry_date ? new Date(newTokens.expiry_date) : null,
        });
      }
      
      const content = await driveService.getFileContent(fileId);
      const metadata = await driveService.getFileMetadata(fileId);
      
      res.json({
        content,
        metadata,
      });
    } catch (error) {
      console.error('Google Drive file content error:', error);
      res.status(500).json({ error: 'Failed to fetch file content', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Disconnect Google Drive
  app.delete('/api/google-drive/disconnect', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const deleted = await storage.deleteOAuthToken(userId, 'google');
      
      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Google Drive not connected' });
      }
    } catch (error) {
      console.error('Google Drive disconnect error:', error);
      res.status(500).json({ error: 'Failed to disconnect Google Drive', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Google Drive integration status
  app.get('/api/integrations/google-drive/status', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const token = await storage.getOAuthToken(userId, 'google');

      if (!token) {
        return res.json({ connected: false, needsAuth: true });
      }

      const hasDriveScope = token.scopes?.includes('https://www.googleapis.com/auth/drive.readonly');
      if (!hasDriveScope) {
        return res.json({ connected: false, needsAuth: true });
      }

      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        console.warn('Google OAuth environment variables are not configured.');
        return res.json({ connected: false, needsAuth: true, error: 'Google integration not configured' });
      }

      const redirectUri = `${req.protocol}://${req.get('host')}/auth/google/callback`;
      const driveService = new GoogleDriveService(
        process.env.GOOGLE_CLIENT_ID!,
        process.env.GOOGLE_CLIENT_SECRET!,
        redirectUri
      );

      driveService.setTokens(
        token.accessToken,
        token.refreshToken || undefined,
        token.tokenExpiry ? new Date(token.tokenExpiry).getTime() : undefined
      );

      const expiryTime = token.tokenExpiry ? new Date(token.tokenExpiry).getTime() : null;
      if (expiryTime && expiryTime <= Date.now()) {
        if (!token.refreshToken) {
          return res.json({ connected: false, needsAuth: true, error: 'Google Drive session expired' });
        }

        try {
          const refreshedTokens = await driveService.refreshTokenIfNeeded();
          await storage.updateOAuthToken(userId, 'google', {
            accessToken: refreshedTokens.access_token!,
            refreshToken: refreshedTokens.refresh_token || token.refreshToken,
            tokenExpiry: refreshedTokens.expiry_date ? new Date(refreshedTokens.expiry_date) : null,
            scopes: refreshedTokens.scope ? refreshedTokens.scope.split(' ') : token.scopes,
          });
        } catch (refreshError) {
          console.error('Google Drive token refresh failed:', refreshError);
          return res.json({ connected: false, needsAuth: true, error: 'Token refresh failed' });
        }
      }

      res.json({ connected: true, needsAuth: false });
    } catch (error) {
      console.error('Google Drive status check error:', error);
      res.json({ connected: false, needsAuth: true, error: 'Failed to verify connection' });
    }
  });

  // Notion Integration Routes
  app.get('/api/integrations/notion/status', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const status = await checkNotionConnection(userId);
      res.json(status);
    } catch (error) {
      console.error('Notion status check error:', error);
      res.json({ connected: false, needsAuth: true, error: 'Failed to check connection' });
    }
  });

  app.get('/api/integrations/notion/databases', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const databases = await getNotionDatabases(userId);
      res.json({ databases });
    } catch (error: any) {
      console.error('Notion databases error:', error);
      if (error.message === NOTION_NOT_CONNECTED_ERROR) {
        return res.status(401).json({ error: NOTION_NOT_CONNECTED_ERROR, needsAuth: true });
      }
      res.status(500).json({ error: 'Failed to fetch Notion databases', detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.get('/api/integrations/notion/pages', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const pages = await getNotionPages(userId);
      res.json({ pages });
    } catch (error: any) {
      console.error('Notion pages error:', error);
      if (error.message === NOTION_NOT_CONNECTED_ERROR) {
        return res.status(401).json({ error: NOTION_NOT_CONNECTED_ERROR, needsAuth: true });
      }
      res.status(500).json({ error: 'Failed to fetch Notion pages', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Gmail Integration Routes
  app.get('/api/integrations/gmail/status', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const token = await storage.getOAuthToken(userId, 'google');
      
      if (!token || !token.scopes?.includes('https://www.googleapis.com/auth/gmail.readonly')) {
        return res.json({ connected: false, needsAuth: true });
      }
      
      res.json({ connected: true });
    } catch (error) {
      console.error('Gmail status check error:', error);
      res.json({ connected: false, error: 'Failed to check connection' });
    }
  });

  // Calendar Integration Routes
  app.get('/api/integrations/calendar/status', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const token = await storage.getOAuthToken(userId, 'google');
      
      if (!token || !token.scopes?.includes('https://www.googleapis.com/auth/calendar.readonly')) {
        return res.json({ connected: false, needsAuth: true });
      }
      
      res.json({ connected: true });
    } catch (error) {
      console.error('Calendar status check error:', error);
      res.json({ connected: false, error: 'Failed to check connection' });
    }
  });

  // Knowledge Base Routes
  
  // Get effective knowledge base (combines all levels based on user's plan)
  app.get('/api/knowledge', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const items = await storage.getEffectiveKnowledgeBase(userId);
      res.json(items);
    } catch (error) {
      console.error('Get effective knowledge base error:', error);
      res.status(500).json({ error: 'Failed to fetch knowledge items', detail: error instanceof Error ? error.message : undefined });
    }
  });
  
  // Get system knowledge items (visible to all based on plan)
  app.get('/api/knowledge/system', requireAuth, async (req, res) => {
    try {
      const items = await storage.getSystemKnowledgeItems();
      res.json(items);
    } catch (error) {
      console.error('Get system knowledge items error:', error);
      res.status(500).json({ error: 'Failed to fetch system knowledge items', detail: error instanceof Error ? error.message : undefined });
    }
  });
  
  // Get team knowledge items
  app.get('/api/knowledge/team/:teamId', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const { teamId } = req.params;
      
      // Check if user is a member of the team
      const teams = await storage.getUserTeams(userId);
      const isMember = teams.some(team => team.id === teamId);
      
      if (!isMember) {
        return res.status(403).json({ error: 'You are not a member of this team' });
      }
      
      const items = await storage.getTeamKnowledgeItems(teamId);
      res.json(items);
    } catch (error) {
      console.error('Get team knowledge items error:', error);
      res.status(500).json({ error: 'Failed to fetch team knowledge items', detail: error instanceof Error ? error.message : undefined });
    }
  });
  
  // Get user's personal knowledge items
  app.get('/api/knowledge/user', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const items = await storage.getKnowledgeItems(userId);
      res.json(items);
    } catch (error) {
      console.error('Get user knowledge items error:', error);
      res.status(500).json({ error: 'Failed to fetch user knowledge items', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Create system knowledge item (Super Admin only)
  app.post('/api/knowledge/system', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      
      const systemKnowledgeSchema = z.object({
        type: z.enum(['file', 'url', 'text']),
        title: z.string().min(1).max(255),
        content: z.string().min(1),
        sourceUrl: z.string().url().optional(),
        fileName: z.string().optional(),
        fileType: z.string().optional(),
        fileSize: z.string().optional(),
        metadata: z.record(z.unknown()).optional(),
      });
      
      const data = systemKnowledgeSchema.parse(req.body);
      
      const knowledgeItem = await storage.createSystemKnowledgeItem(data, userId);
      res.json(knowledgeItem);
    } catch (error) {
      console.error('Create system knowledge item error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid system knowledge data', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to create system knowledge item', detail: error instanceof Error ? error.message : undefined });
    }
  });
  
  // Create team knowledge item (Team admin/owner only)
  app.post('/api/knowledge/team/:teamId', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const { teamId } = req.params;
      
      // Check if user is an admin or owner of the team
      const member = await storage.getTeamMember(teamId, userId);
      if (!member || member.status !== 'active' || (member.role !== 'admin' && member.role !== 'owner')) {
        return res.status(403).json({ error: 'Only team admins or owners can add team knowledge items' });
      }
      
      const teamKnowledgeSchema = z.object({
        type: z.enum(['file', 'url', 'text']),
        title: z.string().min(1).max(255),
        content: z.string().min(1),
        sourceUrl: z.string().url().optional(),
        fileName: z.string().optional(),
        fileType: z.string().optional(),
        fileSize: z.string().optional(),
        metadata: z.record(z.unknown()).optional(),
      });
      
      const data = teamKnowledgeSchema.parse(req.body);
      
      const knowledgeItem = await storage.createTeamKnowledgeItem(teamId, data, userId);
      res.json(knowledgeItem);
    } catch (error) {
      console.error('Create team knowledge item error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid team knowledge data', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to create team knowledge item', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Upload file, extract text content, store in knowledge_items (user scope by default)
  app.post('/api/knowledge/file', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const planMeta = (req as any).resolvedPlan as ResolvedPlanMetadata | undefined;

      const fileUploadSchema = z.object({
        name: z.string().min(1).max(255),
        mimeType: z.string().min(1),
        data: z.string(), // Base64 encoded file data
      });

      const { name, mimeType, data } = fileUploadSchema.parse(req.body);

      // Decode base64 data
      const buffer = Buffer.from(data, 'base64');

      // File size limit based on user plan
      const planRecord = planMeta?.record;
      const fallbackLimit = (planMeta?.isProTier ?? false) ? PRO_MAX_UPLOAD_BYTES : FREE_MAX_UPLOAD_BYTES;
      const maxSize = planRecord
        ? planRecord.maxFileSizeMb === null
          ? Infinity
          : (planRecord.maxFileSizeMb ?? 0) > 0
            ? planRecord.maxFileSizeMb * 1024 * 1024
            : fallbackLimit
        : fallbackLimit;

      if (buffer.length > maxSize) {
        const readableMax = formatBytes(maxSize);
        const planLabel = planMeta?.label ?? ((planMeta?.isProTier ?? false) ? 'Pro' : 'Free');
        return res.status(413).json({
          error: `File too large. Maximum size is ${readableMax} for ${planLabel} users.`
        });
      }

      // Extract content from file
      let content: string;
      let metadata: any = {};
      
      try {
        const analysisResult = await fileAnalysisService.analyzeFile(buffer, name, mimeType);
        content = analysisResult.content;
        metadata = {
          ...analysisResult.metadata,
          summary: analysisResult.summary
        };
      } catch (analysisError) {
        console.error('File analysis failed:', analysisError);
        return res.status(400).json({ 
          error: `Failed to extract content from file: ${analysisError instanceof Error ? analysisError.message : 'Unknown error'}` 
        });
      }
      
      // Create knowledge item with user scope
      const knowledgeItem = await storage.createKnowledgeItem({
        userId,
        scope: 'user',
        scopeId: userId,
        type: 'file',
        title: name,
        content,
        fileName: name,
        fileType: mimeType,
        fileSize: buffer.length.toString(),
        metadata
      });
      
      res.json(knowledgeItem);
    } catch (error) {
      console.error('File upload to knowledge base error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid file data', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to upload file to knowledge base', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Fetch URL content, extract text, store in knowledge_items
  app.post('/api/knowledge/url', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      
      const urlSchema = z.object({
        url: z.string().url(),
        title: z.string().min(1).max(255).optional(),
      });

      const { url, title } = urlSchema.parse(req.body);
      
      let fetchResponse: globalThis.Response;
      let finalUrl: URL;
      try {
        const result = await fetchWithSsrfProtection(url);
        fetchResponse = result.response;
        finalUrl = result.finalUrl;
      } catch (error) {
        if (error instanceof UnsafeRemoteURLError) {
          return res.status(400).json({ error: error.message });
        }
        if ((error as Error).name === 'AbortError') {
          return res.status(408).json({ error: 'Request timeout: URL took too long to respond' });
        }
        return res.status(500).json({
          error: `Failed to fetch URL: ${(error as Error).message || 'Network error'}`
        });
      }

      if (!fetchResponse.ok) {
        return res.status(fetchResponse.status).json({
          error: `Failed to fetch URL: ${fetchResponse.status} ${fetchResponse.statusText}`
        });
      }
      
      // Extract text from HTML
      let content: string;
      let pageTitle: string;

      try {
        const contentLengthHeader = fetchResponse.headers.get('content-length');
        if (contentLengthHeader) {
          const declaredSize = Number(contentLengthHeader);
          if (!Number.isNaN(declaredSize) && declaredSize > REMOTE_CONTENT_BYTE_LIMIT) {
            return res.status(413).json({
              error: 'Fetched content exceeds the 2MB safety limit.',
            });
          }
        }

        const reader = fetchResponse.body?.getReader();
        if (!reader) {
          return res.status(500).json({
            error: 'Unable to read remote content stream.',
            detail: 'Remote response did not expose a readable body.',
          });
        }

        const decoder = new TextDecoder();
        let received = 0;
        let html = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            received += value.byteLength;
            if (received > REMOTE_CONTENT_BYTE_LIMIT) {
              return res.status(413).json({
                error: 'Fetched content exceeds the 2MB safety limit.',
              });
            }
            html += decoder.decode(value, { stream: true });
          }
        }
        html += decoder.decode();
        const contentType = fetchResponse.headers.get('content-type') || '';

        if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
          return res.status(400).json({
            error: `Unsupported content type: ${contentType}. Only HTML and plain text are supported.`
          });
        }
        
        // Extract title from HTML
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        pageTitle = titleMatch ? titleMatch[1].trim() : finalUrl.hostname;
        
        // Strip HTML tags and extract meaningful content
        content = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove styles
          .replace(/<[^>]+>/g, ' ') // Remove all HTML tags
          .replace(/&nbsp;/g, ' ') // Replace &nbsp;
          .replace(/&amp;/g, '&') // Replace &amp;
          .replace(/&lt;/g, '<') // Replace &lt;
          .replace(/&gt;/g, '>') // Replace &gt;
          .replace(/&quot;/g, '"') // Replace &quot;
          .replace(/&#39;/g, "'") // Replace &#39;
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim();
        
        if (!content || content.length < 10) {
          return res.status(400).json({ 
            error: 'Could not extract meaningful content from URL' 
          });
        }
      } catch (parseError) {
        console.error('HTML parsing error:', parseError);
        return res.status(500).json({
          error: 'Failed to parse URL content',
          detail: parseError instanceof Error ? parseError.message : undefined,
        });
      }
      
      // Create knowledge item with user scope
      const knowledgeItem = await storage.createKnowledgeItem({
        userId,
        scope: 'user',
        scopeId: userId,
        type: 'url',
        title: title || pageTitle,
        content,
        sourceUrl: url,
        metadata: {
          fetchedAt: new Date().toISOString(),
          contentLength: content.length,
          url
        }
      });
      
      res.json(knowledgeItem);
    } catch (error) {
      console.error('URL fetch to knowledge base error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid URL data', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to fetch URL content', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Store user-provided text directly in knowledge_items
  app.post('/api/knowledge/text', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      
      const textSchema = insertKnowledgeItemSchema.pick({
        title: true,
        content: true,
      }).extend({
        title: z.string().min(1).max(255),
        content: z.string().min(1),
      });

      const { title, content } = textSchema.parse(req.body);
      
      // Create knowledge item with user scope
      const knowledgeItem = await storage.createKnowledgeItem({
        userId,
        scope: 'user',
        scopeId: userId,
        type: 'text',
        title,
        content,
        metadata: {
          createdAt: new Date().toISOString(),
          contentLength: content.length,
        }
      });
      
      res.json(knowledgeItem);
    } catch (error) {
      console.error('Text storage to knowledge base error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid text data', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to store text in knowledge base', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Delete a knowledge item
  app.delete('/api/knowledge/:id', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const { id } = req.params;
      
      // Verify the item belongs to the user before deleting
      const item = await storage.getKnowledgeItem(id);
      
      if (!item) {
        return res.status(404).json({ error: 'Knowledge item not found' });
      }
      
      if (item.userId !== userId) {
        return res.status(403).json({ error: 'Not authorized to delete this knowledge item' });
      }
      
      const deleted = await storage.deleteKnowledgeItem(id);
      
      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Knowledge item not found' });
      }
    } catch (error) {
      console.error('Delete knowledge item error:', error);
      res.status(500).json({ error: 'Failed to delete knowledge item', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // ============================================================================
  // PROJECT ROUTES
  // ============================================================================

  // 1. GET /api/projects - Get user's projects
  app.get('/api/projects', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const projects = await storage.getUserProjects(userId);
      res.json(projects);
    } catch (error) {
      console.error('Get projects error:', error);
      res.status(500).json({ error: 'Failed to get projects', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // 2. POST /api/projects - Create new project
  app.post('/api/projects', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const projectData = insertProjectSchema.parse(req.body);
      
      const project = await storage.createProject(userId, projectData);
      res.status(201).json(project);
    } catch (error) {
      console.error('Create project error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid project data', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to create project', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // 3. GET /api/projects/:id - Get project by ID (check ownership or public access)
  app.get('/api/projects/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req as any).user.id;
      
      const project = await storage.getProject(id);
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Check access: owner or public project
      if (project.userId !== userId && project.isPublic !== 'true') {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      // Sanitize response for non-owners
      if (project.userId !== userId) {
        const { shareToken, isPublic, ...publicProject } = project;
        return res.json(publicProject);
      }
      
      res.json(project);
    } catch (error) {
      console.error('Get project error:', error);
      res.status(500).json({ error: 'Failed to get project', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // 4. PATCH /api/projects/:id - Update project (check ownership)
  app.patch('/api/projects/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req as any).user.id;
      
      const project = await storage.getProject(id);
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      if (project.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      // Validate partial update with restrictive schema (only name, description, customInstructions)
      const updateData = updateProjectSchema.parse(req.body);
      
      const updatedProject = await storage.updateProject(id, updateData);
      
      if (!updatedProject) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      res.json(updatedProject);
    } catch (error) {
      console.error('Update project error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid project data', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to update project', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // 5. DELETE /api/projects/:id - Delete project (check ownership)
  app.delete('/api/projects/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req as any).user.id;
      
      const project = await storage.getProject(id);
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      if (project.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const deleted = await storage.deleteProject(id);
      
      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Project not found' });
      }
    } catch (error) {
      console.error('Delete project error:', error);
      res.status(500).json({ error: 'Failed to delete project', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // 6. POST /api/projects/:id/share - Generate share token and make project public
  app.post('/api/projects/:id/share', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req as any).user.id;
      
      const project = await storage.getProject(id);
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      if (project.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const shareToken = await storage.generateShareToken(id);

      if (!shareToken) {
        return res.status(500).json({
          error: 'Failed to generate share token',
          detail: 'The project did not return a share token after generation.',
        });
      }
      
      res.json({ shareToken, shareUrl: `/projects/shared/${shareToken}` });
    } catch (error) {
      console.error('Generate share token error:', error);
      res.status(500).json({ error: 'Failed to generate share token', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // 6b. DELETE /api/projects/:id/share - Revoke share token and make project private
  app.delete('/api/projects/:id/share', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req as any).user.id;
      
      const project = await storage.getProject(id);
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      if (project.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      // Set isPublic to false and clear shareToken
      const updated = await storage.updateProject(id, { isPublic: "false", shareToken: null });
      
      if (updated) {
        res.json({ success: true });
      } else {
        res.status(500).json({
          error: 'Failed to revoke share link',
          detail: 'The project record was not updated to remove its share token.',
        });
      }
    } catch (error) {
      console.error('Revoke share token error:', error);
      res.status(500).json({ error: 'Failed to revoke share link', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // 7. GET /api/projects/shared/:shareToken - Get project via share token (no auth required)
  app.get('/api/projects/shared/:shareToken', async (req, res) => {
    try {
      const { shareToken } = req.params;
      
      const project = await storage.getProjectByShareToken(shareToken);
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      if (project.isPublic !== 'true') {
        return res.status(403).json({ error: 'Project is not public' });
      }
      
      // Return sanitized response excluding sensitive fields
      res.json({
        id: project.id,
        name: project.name,
        description: project.description,
        customInstructions: project.customInstructions,
        userId: project.userId,
        createdAt: project.createdAt
      });
    } catch (error) {
      console.error('Get shared project error:', error);
      res.status(500).json({ error: 'Failed to get shared project', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // 8. GET /api/projects/:id/knowledge - Get project knowledge items (check access)
  app.get('/api/projects/:id/knowledge', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req as any).user.id;
      
      const project = await storage.getProject(id);
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Check access: owner or public project
      if (project.userId !== userId && project.isPublic !== 'true') {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const knowledgeItems = await storage.getProjectKnowledge(id);
      res.json(knowledgeItems);
    } catch (error) {
      console.error('Get project knowledge error:', error);
      res.status(500).json({ error: 'Failed to get project knowledge', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // 9. POST /api/projects/:id/knowledge/file - Upload file to project knowledge
  app.post('/api/projects/:id/knowledge/file', requireAuth, async (req, res) => {
    try {
      const { id: projectId } = req.params;
      const userId = (req as any).user.id;
      
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      if (project.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const fileUploadSchema = z.object({
        name: z.string().min(1).max(255),
        mimeType: z.string().min(1),
        data: z.string(),
      });

      const { name, mimeType, data } = fileUploadSchema.parse(req.body);
      
      const buffer = Buffer.from(data, 'base64');

      const planMeta = (req as any).resolvedPlan as ResolvedPlanMetadata | undefined;
      const isProTier = planMeta?.isProTier ?? false;
      const maxSize = isProTier ? 5 * 1024 * 1024 * 1024 : 10 * 1024 * 1024;
      if (buffer.length > maxSize) {
        const readableMax = formatBytes(maxSize);
        const planLabel = planMeta?.label ?? (isProTier ? 'Pro' : 'Free');
        return res.status(400).json({
          error: `File too large. Maximum size is ${readableMax} for ${planLabel} users.`
        });
      }
      
      let content: string;
      let metadata: any;
      
      try {
        const analysisResult = await fileAnalysisService.analyzeFile(buffer, name, mimeType);
        content = analysisResult.content;
        metadata = {
          ...analysisResult.metadata,
          summary: analysisResult.summary
        };
      } catch (analysisError) {
        console.error('File analysis failed:', analysisError);
        return res.status(400).json({ 
          error: `Failed to extract content from file: ${analysisError instanceof Error ? analysisError.message : 'Unknown error'}` 
        });
      }
      
      const knowledgeItem = await storage.createProjectKnowledge({
        projectId,
        type: 'file',
        title: name,
        content,
        fileName: name,
        fileType: mimeType,
        fileSize: buffer.length.toString(),
        metadata
      });
      
      res.status(201).json(knowledgeItem);
    } catch (error) {
      console.error('File upload to project knowledge error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid file data', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to upload file to project knowledge', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // 10. POST /api/projects/:id/knowledge/url - Add URL to project knowledge
  app.post('/api/projects/:id/knowledge/url', requireAuth, async (req, res) => {
    try {
      const { id: projectId } = req.params;
      const userId = (req as any).user.id;
      
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      if (project.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const urlSchema = z.object({
        url: z.string().url(),
        title: z.string().min(1).max(255).optional(),
      });

      const { url, title } = urlSchema.parse(req.body);
      
      let fetchResponse: globalThis.Response;
      let finalUrl: URL;
      try {
        const result = await fetchWithSsrfProtection(url);
        fetchResponse = result.response;
        finalUrl = result.finalUrl;
      } catch (error) {
        if (error instanceof UnsafeRemoteURLError) {
          return res.status(400).json({ error: error.message });
        }
        if ((error as Error).name === 'AbortError') {
          return res.status(408).json({ error: 'Request timeout: URL took too long to respond' });
        }
        return res.status(500).json({
          error: `Failed to fetch URL: ${(error as Error).message || 'Network error'}`
        });
      }

      if (!fetchResponse.ok) {
        return res.status(fetchResponse.status).json({
          error: `Failed to fetch URL: ${fetchResponse.status} ${fetchResponse.statusText}`
        });
      }
      
      let content: string;
      let pageTitle: string;

      try {
        const contentLengthHeader = fetchResponse.headers.get('content-length');
        if (contentLengthHeader) {
          const declaredSize = Number(contentLengthHeader);
          if (!Number.isNaN(declaredSize) && declaredSize > REMOTE_CONTENT_BYTE_LIMIT) {
            return res.status(413).json({
              error: 'Fetched content exceeds the 2MB safety limit.',
            });
          }
        }

        const reader = fetchResponse.body?.getReader();
        if (!reader) {
          return res.status(500).json({
            error: 'Unable to read remote content stream.',
            detail: 'Remote response did not expose a readable body.',
          });
        }

        const decoder = new TextDecoder();
        let received = 0;
        let html = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            received += value.byteLength;
            if (received > REMOTE_CONTENT_BYTE_LIMIT) {
              return res.status(413).json({
                error: 'Fetched content exceeds the 2MB safety limit.',
              });
            }
            html += decoder.decode(value, { stream: true });
          }
        }
        html += decoder.decode();
        const contentType = fetchResponse.headers.get('content-type') || '';

        if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
          return res.status(400).json({
            error: `Unsupported content type: ${contentType}. Only HTML and plain text are supported.`
          });
        }
        
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        pageTitle = titleMatch ? titleMatch[1].trim() : finalUrl.hostname;
        
        content = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\s+/g, ' ')
          .trim();
        
        if (!content || content.length < 10) {
          return res.status(400).json({ 
            error: 'Could not extract meaningful content from URL' 
          });
        }
      } catch (parseError) {
        console.error('HTML parsing error:', parseError);
        return res.status(500).json({
          error: 'Failed to parse URL content',
          detail: parseError instanceof Error ? parseError.message : undefined,
        });
      }
      
      const knowledgeItem = await storage.createProjectKnowledge({
        projectId,
        type: 'url',
        title: title || pageTitle,
        content,
        sourceUrl: url,
        metadata: {
          fetchedAt: new Date().toISOString(),
          contentLength: content.length,
          url
        }
      });
      
      res.status(201).json(knowledgeItem);
    } catch (error) {
      console.error('URL fetch to project knowledge error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid URL data', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to fetch URL content', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // 11. POST /api/projects/:id/knowledge/text - Add text to project knowledge
  app.post('/api/projects/:id/knowledge/text', requireAuth, async (req, res) => {
    try {
      const { id: projectId } = req.params;
      const userId = (req as any).user.id;
      
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      if (project.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const textSchema = z.object({
        title: z.string().min(1).max(255),
        content: z.string().min(1),
      });

      const { title, content } = textSchema.parse(req.body);
      
      const knowledgeItem = await storage.createProjectKnowledge({
        projectId,
        type: 'text',
        title,
        content,
        metadata: {
          createdAt: new Date().toISOString(),
          contentLength: content.length,
        }
      });
      
      res.status(201).json(knowledgeItem);
    } catch (error) {
      console.error('Text storage to project knowledge error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid text data', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to store text in project knowledge', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // 12. DELETE /api/projects/:id/knowledge/:knowledgeId - Delete project knowledge item
  app.delete('/api/projects/:id/knowledge/:knowledgeId', requireAuth, async (req, res) => {
    try {
      const { id: projectId, knowledgeId } = req.params;
      const userId = (req as any).user.id;
      
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      if (project.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const deleted = await storage.deleteProjectKnowledge(knowledgeId);
      
      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Knowledge item not found' });
      }
    } catch (error) {
      console.error('Delete project knowledge error:', error);
      res.status(500).json({ error: 'Failed to delete knowledge item', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // 13. GET /api/projects/:id/files - Get project files (check access)
  app.get('/api/projects/:id/files', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req as any).user.id;
      
      const project = await storage.getProject(id);
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Check access: owner or public project
      if (project.userId !== userId && project.isPublic !== 'true') {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const files = await storage.getProjectFiles(id);
      res.json(files);
    } catch (error) {
      console.error('Get project files error:', error);
      res.status(500).json({ error: 'Failed to get project files', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // 14. POST /api/projects/:id/files - Upload file to project
  app.post('/api/projects/:id/files', requireAuth, async (req, res) => {
    try {
      const { id: projectId } = req.params;
      const userId = (req as any).user.id;
      
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      if (project.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      // Get user's plan for file size limit
      const planMeta = (req as any).resolvedPlan as ResolvedPlanMetadata | undefined;
      const isProTier = planMeta?.isProTier ?? false;
      const maxSize = isProTier ? 5 * 1024 * 1024 * 1024 : 10 * 1024 * 1024; // 5GB for pro, 10MB for free
      
      const fileUploadSchema = z.object({
        fileUrl: z.string().url('A valid file URL is required'),
        fileName: z.string().min(1).max(255).optional(),
      });

      const fileData = fileUploadSchema.parse(req.body);

      let headResponse: globalThis.Response;
      try {
        headResponse = await fetch(fileData.fileUrl, { method: 'HEAD' });
      } catch (fetchError) {
        console.error('HEAD request for project file failed:', fetchError);
        return res.status(400).json({ error: 'Unable to verify uploaded file metadata' });
      }

      if (!headResponse.ok) {
        return res.status(400).json({ error: 'Unable to validate uploaded file metadata' });
      }

      const contentLengthHeader = headResponse.headers.get('content-length');
      if (!contentLengthHeader) {
        return res.status(400).json({ error: 'File size could not be verified' });
      }

      const fileSizeNum = Number.parseInt(contentLengthHeader, 10);
      if (!Number.isFinite(fileSizeNum) || fileSizeNum < 0) {
        return res.status(400).json({ error: 'File size is invalid' });
      }

      if (fileSizeNum > maxSize) {
        const readableMax = formatBytes(maxSize);
        const planLabel = planMeta?.label ?? (isProTier ? 'Pro' : 'Free');
        return res.status(400).json({
          error: `File too large. Maximum size is ${readableMax} for ${planLabel} users.`
        });
      }

      const contentType = headResponse.headers.get('content-type') ?? 'application/octet-stream';
      const contentDisposition = headResponse.headers.get('content-disposition');

      let resolvedFileName = fileData.fileName ?? null;
      if (contentDisposition) {
        const encodedNameMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
        const quotedNameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
        const encodedValue = encodedNameMatch?.[1];
        const quotedValue = quotedNameMatch?.[1];
        if (encodedValue) {
          try {
            resolvedFileName = decodeURIComponent(encodedValue);
          } catch {
            resolvedFileName = encodedValue;
          }
        } else if (quotedValue) {
          resolvedFileName = quotedValue;
        }
      }

      if (!resolvedFileName) {
        try {
          const parsedUrl = new URL(fileData.fileUrl);
          const segments = parsedUrl.pathname.split('/').filter(Boolean);
          resolvedFileName = segments.pop() || 'file';
        } catch {
          resolvedFileName = 'file';
        }
      }

      if (resolvedFileName.length > 255) {
        resolvedFileName = resolvedFileName.slice(0, 255);
      }

      const projectFile = await storage.createProjectFile({
        projectId,
        fileName: resolvedFileName,
        fileType: contentType,
        fileSize: fileSizeNum.toString(),
        fileUrl: fileData.fileUrl,
      });
      
      res.status(201).json(projectFile);
    } catch (error) {
      console.error('Upload project file error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid file data', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to upload project file', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // 15. DELETE /api/projects/:id/files/:fileId - Delete project file
  app.delete('/api/projects/:id/files/:fileId', requireAuth, async (req, res) => {
    try {
      const { id: projectId, fileId } = req.params;
      const userId = (req as any).user.id;
      
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      if (project.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const deleted = await storage.deleteProjectFile(fileId);
      
      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Project file not found' });
      }
    } catch (error) {
      console.error('Delete project file error:', error);
      res.status(500).json({ error: 'Failed to delete project file', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // 16. POST /api/chats/:id/move - Move chat to/from project
  app.post('/api/chats/:id/move', requireAuth, async (req, res) => {
    try {
      const { id: chatId } = req.params;
      const userId = (req as any).user.id;
      
      const chat = await storage.getChat(chatId);
      
      if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
      }
      
      if (chat.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const moveSchema = z.object({
        projectId: z.string().nullable(),
      });

      const { projectId } = moveSchema.parse(req.body);
      
      // If moving to a project, verify project exists and user has access
      if (projectId) {
        const project = await storage.getProject(projectId);
        
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }
        
        if (project.userId !== userId) {
          return res.status(403).json({ error: 'Access denied to project' });
        }
      }
      
      const updatedChat = await storage.moveChatToProject(chatId, projectId);
      
      if (!updatedChat) {
        return res.status(404).json({ error: 'Chat not found' });
      }
      
      res.json(updatedChat);
    } catch (error) {
      console.error('Move chat error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid move data', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to move chat', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // ==== PLAN MANAGEMENT ROUTES (Super Admin Only) ====

  // List all plans
  app.get('/api/admin/plans', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const plans = await storage.listPlans();
      res.json(plans);
    } catch (error) {
      console.error('Failed to fetch plans:', error);
      if (respondWithMissingTables(res, error, 'fetch plans')) {
        return;
      }
      res.status(500).json({ error: 'Unable to load plans' });
    }
  });

  // Get specific plan details
  app.get('/api/plans/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const plan = await storage.getPlan(id);
      
      if (!plan) {
        return res.status(404).json({ error: 'Plan not found' });
      }
      
      res.json(plan);
    } catch (error) {
      console.error('Failed to fetch plan:', error);
      if (respondWithMissingTables(res, error, 'fetch plan')) {
        return;
      }
      res.status(500).json({ error: 'Unable to load plan' });
    }
  });

  // Create new plan (Super Admin only)
  app.post('/api/admin/plans', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const planData = req.body;
      
      // Validate required fields
      if (!planData.name) {
        return res.status(400).json({ error: 'Plan name is required' });
      }
      
      const newPlan = await storage.createPlan(planData);
      res.status(201).json(newPlan);
    } catch (error) {
      console.error('Failed to create plan:', error);
      if (respondWithMissingTables(res, error, 'create plan')) {
        return;
      }
      res.status(500).json({ error: 'Unable to create plan', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Update plan (Super Admin only)
  app.patch('/api/admin/plans/:id', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const actorUserId = (req as any).user?.id || (req as any).session?.userId;
      
      // Get the original plan for audit logging
      const originalPlan = await storage.getPlan(id);
      if (!originalPlan) {
        return res.status(404).json({ error: 'Plan not found' });
      }
      
      const updatedPlan = await storage.updatePlan(id, updates);
      
      if (!updatedPlan) {
        return res.status(404).json({ error: 'Plan not found' });
      }
      
      // Audit the plan modification
      await auditPlanModification(storage, actorUserId, {
        targetType: 'plan',
        targetId: id,
        targetName: updatedPlan.name,
        before: buildPlanAuditSnapshot({ plan: originalPlan }),
        after: buildPlanAuditSnapshot({ plan: updatedPlan }),
        changeNotes: `Plan ${originalPlan.name} updated`,
      });
      
      res.json(updatedPlan);
    } catch (error) {
      console.error('Failed to update plan:', error);
      if (respondWithMissingTables(res, error, 'update plan')) {
        return;
      }
      res.status(500).json({ error: 'Unable to update plan', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // Delete plan (Super Admin only)
  app.delete('/api/admin/plans/:id', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      const deleted = await storage.deletePlan(id);
      
      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(400).json({ error: 'Cannot delete plan - it may be in use by users' });
      }
    } catch (error) {
      console.error('Failed to delete plan:', error);
      if (respondWithMissingTables(res, error, 'delete plan')) {
        return;
      }
      res.status(500).json({ error: 'Unable to delete plan', detail: error instanceof Error ? error.message : undefined });
    }
  });

  // ==== TEAMS ROUTES (Enterprise Plan Only) ====

  // Helper function to check Enterprise plan access
  const requireEnterprisePlan = async (req: any, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const capabilities = await authService.getEffectiveCapabilities(userId);
      if (!capabilities.teams || !capabilities.teams.enabled) {
        return res.status(403).json({ error: 'Teams feature requires Enterprise plan' });
      }
      next();
    } catch (error) {
      console.error('Enterprise plan check error:', error);
      res.status(500).json({ error: 'Unable to verify plan access' });
    }
  };

  // Get user's teams
  app.get('/api/teams', requireAuth, requireEnterprisePlan, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      const teams = await storage.getUserTeams(userId);
      res.json(teams);
    } catch (error) {
      console.error('Failed to fetch teams:', error);
      res.status(500).json({ error: 'Unable to load teams' });
    }
  });

  // Get specific team details
  app.get('/api/teams/:id', requireAuth, requireEnterprisePlan, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      const { id } = req.params;
      
      const team = await storage.getTeam(id);
      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      // Check if user is a member
      const member = await storage.getTeamMember(id, userId);
      if (!member || member.status !== 'active') {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json(team);
    } catch (error) {
      console.error('Failed to fetch team:', error);
      res.status(500).json({ error: 'Unable to load team' });
    }
  });

  // Create a new team
  app.post('/api/teams', requireAuth, requireEnterprisePlan, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      const { name, description } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Team name is required' });
      }

      // Check team creation limit
      const platformSettings = await storage.getPlatformSettings();
      const maxTeams = platformSettings.data.teams.maxTeamsPerOrg;
      const existingTeams = await storage.getTeamsByOwner(userId);

      if (maxTeams !== null && existingTeams.length >= maxTeams) {
        return res.status(403).json({ 
          error: `Team limit reached. Maximum ${maxTeams} teams allowed.` 
        });
      }

      const team = await storage.createTeam({
        name: name.trim(),
        description: description?.trim() || null,
        ownerId: userId,
      });

      res.status(201).json(team);
    } catch (error) {
      console.error('Failed to create team:', error);
      res.status(500).json({ error: 'Unable to create team' });
    }
  });

  // Update team
  app.patch('/api/teams/:id', requireAuth, requireEnterprisePlan, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      const { id } = req.params;
      const { name, description, settings } = req.body;

      const team = await storage.getTeam(id);
      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      // Check if user is owner or admin
      const member = await storage.getTeamMember(id, userId);
      if (!member || !['owner', 'admin'].includes(member.role)) {
        return res.status(403).json({ error: 'Only team owners and admins can update team settings' });
      }

      const updates: Partial<typeof team> = {};
      if (name !== undefined) updates.name = name.trim();
      if (description !== undefined) updates.description = description?.trim() || null;
      if (settings !== undefined) updates.settings = settings;

      const updated = await storage.updateTeam(id, updates);
      res.json(updated);
    } catch (error) {
      console.error('Failed to update team:', error);
      res.status(500).json({ error: 'Unable to update team' });
    }
  });

  // Delete team
  app.delete('/api/teams/:id', requireAuth, requireEnterprisePlan, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      const { id } = req.params;

      const team = await storage.getTeam(id);
      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      // Only owner can delete team
      if (team.ownerId !== userId) {
        return res.status(403).json({ error: 'Only the team owner can delete the team' });
      }

      await storage.deleteTeam(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete team:', error);
      res.status(500).json({ error: 'Unable to delete team' });
    }
  });

  // Get team members
  app.get('/api/teams/:id/members', requireAuth, requireEnterprisePlan, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      const { id } = req.params;

      // Check access
      const member = await storage.getTeamMember(id, userId);
      if (!member || member.status !== 'active') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const members = await storage.getTeamMembers(id);
      
      // Fetch user details for each member
      const membersWithDetails = await Promise.all(
        members.map(async (m) => {
          const user = await storage.getUser(m.userId);
          return {
            ...m,
            user: user ? {
              id: user.id,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
              profileImageUrl: user.profileImageUrl,
            } : null,
          };
        })
      );

      res.json(membersWithDetails);
    } catch (error) {
      console.error('Failed to fetch team members:', error);
      res.status(500).json({ error: 'Unable to load team members' });
    }
  });

  // Invite member to team
  app.post('/api/teams/:id/invitations', requireAuth, requireEnterprisePlan, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      const { id: teamId } = req.params;
      const { email, role = 'member' } = req.body;

      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({ error: 'Valid email is required' });
      }

      const team = await storage.getTeam(teamId);
      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      // Check if user has permission to invite
      const member = await storage.getTeamMember(teamId, userId);
      if (!member || !['owner', 'admin'].includes(member.role)) {
        return res.status(403).json({ error: 'Only team owners and admins can invite members' });
      }

      // Check member limit
      const platformSettings = await storage.getPlatformSettings();
      const maxMembers = platformSettings.data.teams.maxMembersPerTeam;
      const currentCount = await storage.getTeamMemberCount(teamId);

      if (maxMembers !== null && currentCount >= maxMembers) {
        return res.status(403).json({ 
          error: `Member limit reached. Maximum ${maxMembers} members allowed.` 
        });
      }

      // Check if user is already a member
      const existingUser = await storage.getUserByEmail(email.toLowerCase());
      if (existingUser) {
        const existingMember = await storage.getTeamMember(teamId, existingUser.id);
        if (existingMember) {
          return res.status(400).json({ error: 'User is already a team member' });
        }
      }

      // Check for pending invitation
      const existingInvitations = await storage.getTeamInvitations(teamId);
      const pendingInvite = existingInvitations.find(
        inv => inv.email.toLowerCase() === email.toLowerCase() && inv.status === 'pending'
      );
      if (pendingInvite) {
        return res.status(400).json({ error: 'Invitation already sent to this email' });
      }

      // Create invitation
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const invitation = await storage.createTeamInvitation({
        teamId,
        email: email.toLowerCase(),
        role: ['owner', 'admin', 'member'].includes(role) ? role : 'member',
        invitedBy: userId,
        token,
        expiresAt,
      });

      // Send invitation email (using GoHighLevel)
      try {
        const inviteUrl = `${req.protocol}://${req.get('host')}/teams/accept-invitation?token=${token}`;
        await ghlEmailService.sendTeamInvitation(email, team.name, inviteUrl);
      } catch (emailError) {
        console.error('Failed to send invitation email:', emailError);
        // Continue anyway - user can still use the invitation
      }

      res.status(201).json(invitation);
    } catch (error) {
      console.error('Failed to create invitation:', error);
      res.status(500).json({ error: 'Unable to send invitation' });
    }
  });

  // Get team invitations
  app.get('/api/teams/:id/invitations', requireAuth, requireEnterprisePlan, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      const { id: teamId } = req.params;

      // Check if user has permission
      const member = await storage.getTeamMember(teamId, userId);
      if (!member || !['owner', 'admin'].includes(member.role)) {
        return res.status(403).json({ error: 'Only team owners and admins can view invitations' });
      }

      const invitations = await storage.getTeamInvitations(teamId);
      res.json(invitations);
    } catch (error) {
      console.error('Failed to fetch invitations:', error);
      res.status(500).json({ error: 'Unable to load invitations' });
    }
  });

  // Validate team invitation (get details without accepting)
  app.get('/api/teams/invitations/:token/validate', async (req, res) => {
    try {
      const { token } = req.params;

      if (!token) {
        return res.status(400).json({ error: 'Invitation token is required' });
      }

      const invitation = await storage.getTeamInvitationByToken(token);
      if (!invitation) {
        return res.status(404).json({ error: 'Invalid invitation token' });
      }

      if (invitation.status !== 'pending') {
        return res.status(400).json({ error: 'Invitation has already been processed' });
      }

      if (new Date() > invitation.expiresAt) {
        await storage.updateTeamInvitation(invitation.id, { status: 'expired' });
        return res.status(400).json({ error: 'Invitation has expired' });
      }

      const team = await storage.getTeam(invitation.teamId);
      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      const inviter = await storage.getUser(invitation.invitedBy);
      
      res.json({
        teamName: team.name,
        teamDescription: team.description,
        inviterEmail: inviter?.email || 'Unknown',
        role: invitation.role,
      });
    } catch (error) {
      console.error('Failed to validate invitation:', error);
      res.status(500).json({ error: 'Unable to validate invitation' });
    }
  });

  // Accept team invitation
  app.post('/api/teams/invitations/:token/accept', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      const { token } = req.params;

      if (!token) {
        return res.status(400).json({ error: 'Invitation token is required' });
      }

      const invitation = await storage.getTeamInvitationByToken(token);
      if (!invitation) {
        return res.status(404).json({ error: 'Invalid invitation token' });
      }

      if (invitation.status !== 'pending') {
        return res.status(400).json({ error: 'Invitation has already been processed' });
      }

      if (new Date() > invitation.expiresAt) {
        await storage.updateTeamInvitation(invitation.id, { status: 'expired' });
        return res.status(400).json({ error: 'Invitation has expired' });
      }

      // Verify email matches
      const user = await storage.getUser(userId);
      if (!user || user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
        return res.status(403).json({ error: 'This invitation is for a different email address' });
      }

      // Check if already a member
      const existingMember = await storage.getTeamMember(invitation.teamId, userId);
      if (existingMember) {
        await storage.updateTeamInvitation(invitation.id, { 
          status: 'accepted',
          acceptedAt: new Date(),
        });
        return res.json({ message: 'You are already a member of this team' });
      }

      // Add user to team
      await storage.addTeamMember({
        teamId: invitation.teamId,
        userId,
        role: ((['owner','admin','member'] as const).includes(invitation.role as any)
          ? (invitation.role as any)
          : 'member'),
        status: 'active',
        invitedBy: invitation.invitedBy,
      });

      // Mark invitation as accepted
      await storage.updateTeamInvitation(invitation.id, {
        status: 'accepted',
        acceptedAt: new Date(),
      });

      const team = await storage.getTeam(invitation.teamId);
      res.json({ success: true, team });
    } catch (error) {
      console.error('Failed to accept invitation:', error);
      res.status(500).json({ error: 'Unable to accept invitation' });
    }
  });

  // Remove team member
  app.delete('/api/teams/:teamId/members/:userId', requireAuth, requireEnterprisePlan, async (req: any, res) => {
    try {
      const actorId = req.user?.id || req.session?.userId;
      const { teamId, userId } = req.params;

      const team = await storage.getTeam(teamId);
      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      // Check if actor has permission
      const actorMember = await storage.getTeamMember(teamId, actorId);
      if (!actorMember || !['owner', 'admin'].includes(actorMember.role)) {
        return res.status(403).json({ error: 'Only team owners and admins can remove members' });
      }

      // Can't remove the owner
      if (userId === team.ownerId) {
        return res.status(400).json({ error: 'Cannot remove team owner' });
      }

      await storage.removeTeamMember(teamId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to remove member:', error);
      res.status(500).json({ error: 'Unable to remove member' });
    }
  });

  // Update team member role
  app.patch('/api/teams/:teamId/members/:memberId', requireAuth, requireEnterprisePlan, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      const { teamId, memberId } = req.params;
      const { role } = req.body;

      if (!['member', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be "member" or "admin"' });
      }

      // Check if user is owner
      const team = await storage.getTeam(teamId);
      if (!team || team.ownerId !== userId) {
        return res.status(403).json({ error: 'Only team owner can change member roles' });
      }

      const updated = await storage.updateTeamMember(memberId, { role });
      res.json(updated);
    } catch (error) {
      console.error('Failed to update member role:', error);
      res.status(500).json({ error: 'Unable to update member role' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

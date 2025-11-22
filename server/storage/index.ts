import {
  type User, type InsertUser, type UpsertUser, type Chat, type InsertChat, type Message, type InsertMessage,
  type Attachment, type Reaction, type InsertReaction, type UsageMetric, type InsertUsageMetric,
  type OAuthToken, type InsertOAuthToken, type UserPreferences, type InsertUserPreferences,
  type KnowledgeItem, type InsertKnowledgeItem,
  type Project, type InsertProject, type ProjectKnowledge, type InsertProjectKnowledge,
  type ProjectFile, type InsertProjectFile,
  type PasswordResetToken, type InsertPasswordResetToken,
  type UserApiKey, type InsertUserApiKey,
  type PlatformSettings, type PlatformSettingsData,
  type N8nAgent, type InsertN8nAgent, type N8nAgentRun, type InsertN8nAgentRun,
  type ProCoupon, type InsertProCoupon, type ProCouponRedemption, type InsertProCouponRedemption,
  type Template, type InsertTemplate,
  type OutputTemplate, type InsertOutputTemplate,
  type AdminAuditLog, type InsertAdminAuditLog,
  type SystemPrompt,
  type Release, type InsertRelease,
  type Expert, type InsertExpert, type UpdateExpert,
  type ToolPolicy, type InsertToolPolicy, type UpdateToolPolicy, type ToolPolicyProvider,
  type AnalyticsEvent, type InsertAnalyticsEvent,
  type ProviderPricing, type InsertProviderPricing,
  type Team, type InsertTeam, type TeamMember, type InsertTeamMember, type TeamInvitation, type InsertTeamInvitation,
  type UserStatus,
  type Plan, type InsertPlan, type UpdatePlan,
  type Model, type InsertModel, type UpdateModel,
  type EffectiveCapabilities,
  defaultPlatformSettings, platformSettingsDataSchema,
  users, chats, messages, reactions, usageMetrics, oauthTokens, userPreferences, knowledgeItems,
  projects, projectKnowledge, projectFiles, passwordResetTokens, userApiKeys, platformSettings, n8nAgents, n8nAgentRuns,
  proCoupons, proCouponRedemptions, templates, outputTemplates, adminAuditLogs, systemPrompts, releases, experts, toolPolicies,
  analyticsEvents, providerPricing, teams, teamMembers, teamInvitations, plans, models
} from "../../shared/schema.js";
import { randomUUID } from "crypto";
import { nanoid } from "nanoid";
import { db } from "../db.js";
import { DEFAULT_SYSTEM_PROMPT } from "../system-prompts.js";
import { eq, and, gte, lte, desc, asc, sql, inArray, ne, lt, or, isNull } from "drizzle-orm";
import {
  createFileStorage,
  type FileRecord,
  type FileStorageAdapter,
  InMemoryFileStorage,
} from "./file-store.js";
import { encryptSecret, decryptSecret } from "../security/secret-storage.js";

export type StoredFile = FileRecord;

// modify the interface with any CRUD methods
// you might need

export interface CreateReleaseOptions {
  label: string;
  systemPromptId?: string | null;
  expertIds?: string[];
  templateIds?: string[];
  outputTemplateIds?: string[];
  toolPolicyIds?: string[];
  changeNotes?: string | null;
}

export interface ReleaseTransitionOptions {
  changeNotes: string;
  actorUserId?: string | null;
}

const sanitizePlatformKeyAssignments = (data: PlatformSettingsData): PlatformSettingsData => {
  const clone = structuredClone(data);
  for (const settings of Object.values(clone.apiProviders)) {
    const allowedSet = new Set(settings.allowedModels);
    const provided = Array.isArray(settings.platformKeyAllowedModels)
      ? settings.platformKeyAllowedModels.filter((modelId): modelId is string => typeof modelId === 'string')
      : [];
    const filtered = provided.filter(modelId => allowedSet.has(modelId));
    const unique = new Set(filtered);
    settings.platformKeyAllowedModels = settings.allowedModels.filter(modelId => unique.has(modelId));
  }
  return clone;
};

const applyPlatformKeyDefaults = (
  data: PlatformSettingsData,
  raw: unknown,
): PlatformSettingsData => {
  const sanitized = sanitizePlatformKeyAssignments(data);
  const rawProviders =
    raw && typeof raw === 'object' && raw !== null && 'apiProviders' in (raw as Record<string, unknown>)
      ? (raw as Record<string, unknown>).apiProviders
      : undefined;

  for (const [provider, settings] of Object.entries(sanitized.apiProviders)) {
    const rawProvider = rawProviders && typeof rawProviders === 'object' ? (rawProviders as any)[provider] : undefined;
    const hasExplicitField =
      rawProvider && typeof rawProvider === 'object'
        ? Object.prototype.hasOwnProperty.call(rawProvider, 'platformKeyAllowedModels')
        : false;

    if (!hasExplicitField && settings.platformKeyAllowedModels.length === 0) {
      settings.platformKeyAllowedModels = [...settings.allowedModels];
    }
  }

  return sanitized;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const mergePlatformSettingsWithDefaults = <T>(defaults: T, overrides: unknown): T => {
  if (Array.isArray(defaults)) {
    const value = Array.isArray(overrides) ? structuredClone(overrides) : structuredClone(defaults);
    return value as unknown as T;
  }

  if (!isPlainObject(defaults)) {
    return (overrides ?? defaults) as T;
  }

  const base: Record<string, unknown> = { ...defaults };

  if (!isPlainObject(overrides)) {
    if (overrides === undefined || overrides === null) {
      return base as T;
    }
    return structuredClone(overrides) as T;
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      continue;
    }

    const existing = base[key];

    if (value === null) {
      if (isPlainObject(existing)) {
        continue;
      }
      base[key] = null;
      continue;
    }

    if (Array.isArray(existing) && Array.isArray(value)) {
      base[key] = structuredClone(value);
      continue;
    }

    if (isPlainObject(existing) && isPlainObject(value)) {
      base[key] = mergePlatformSettingsWithDefaults(existing, value);
      continue;
    }

    base[key] = structuredClone(value);
  }

  return base as T;
};

const parsePlatformSettingsData = (input: unknown): PlatformSettingsData => {
  const rawClone =
    input === undefined || input === null || !isPlainObject(input) ? undefined : structuredClone(input);
  const merged = mergePlatformSettingsWithDefaults(structuredClone(defaultPlatformSettings), rawClone ?? {});
  const parsed = platformSettingsDataSchema.parse(structuredClone(merged));
  return applyPlatformKeyDefaults(parsed, rawClone ?? merged);
};

const preparePlatformSettingsPayload = (data: PlatformSettingsData): PlatformSettingsData => {
  const rawClone = structuredClone(data);
  const parsed = platformSettingsDataSchema.parse(rawClone);
  return sanitizePlatformKeyAssignments(parsed);
};

export interface CreateSystemPromptOptions {
  content: string;
  label?: string | null;
  notes?: string | null;
  createdByUserId?: string | null;
  activate?: boolean;
  activatedByUserId?: string | null;
}

export interface UpdateSystemPromptOptions {
  content?: string;
  label?: string | null;
  notes?: string | null;
}

export interface IStorage {
  // Plan methods
  createPlan(plan: InsertPlan): Promise<Plan>;
  updatePlan(id: string, updates: UpdatePlan): Promise<Plan | undefined>;
  deletePlan(id: string): Promise<boolean>;
  getPlan(id: string): Promise<Plan | undefined>;
  getPlanBySlug(slug: string): Promise<Plan | undefined>;
  listPlans(): Promise<Plan[]>;
  getUserPlan(userId: string): Promise<Plan | undefined>;
  resolveUserPlan(user: User): Promise<Plan | undefined>;

  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  listUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  updateUserStatus(id: string, status: UserStatus): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>; // For Replit Auth
  hasAdminUser(): Promise<boolean>;
  
  // Effective Capabilities method
  getEffectiveCapabilities(userId: string): Promise<EffectiveCapabilities | undefined>;
  
  // Chat methods
  getChat(id: string): Promise<Chat | undefined>;
  getUserChats(userId: string, includeArchived?: boolean, projectId?: string | null): Promise<Chat[]>;
  getArchivedChats(userId: string): Promise<Chat[]>;
  createChat(chat: InsertChat & { userId: string }): Promise<Chat>;
  updateChat(id: string, updates: Partial<InsertChat>): Promise<Chat | undefined>;
  archiveChat(id: string): Promise<boolean>;
  deleteChat(id: string): Promise<boolean>;
  
  // Message methods
  getMessage(id: string): Promise<Message | undefined>;
  getChatMessages(chatId: string): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  getMessagesSince(userId: string, since: Date): Promise<Message[]>;
  
  // Reaction methods
  getMessageReactions(messageId: string): Promise<Reaction[]>;
  getUserReaction(messageId: string, userId: string): Promise<Reaction | undefined>;
  createReaction(reaction: InsertReaction): Promise<Reaction>;
  updateReaction(id: string, type: 'thumbs_up' | 'thumbs_down'): Promise<Reaction | undefined>;
  deleteReaction(id: string): Promise<boolean>;
  
  // Usage tracking methods
  createUsageMetric(metric: InsertUsageMetric): Promise<UsageMetric>;
  getUserUsageMetrics(userId: string, dateFrom?: Date, dateTo?: Date): Promise<UsageMetric[]>;
  getChatUsageMetrics(chatId: string): Promise<UsageMetric[]>;
  
  // OAuth token methods
  getOAuthToken(userId: string, provider: string): Promise<OAuthToken | undefined>;
  saveOAuthToken(token: InsertOAuthToken): Promise<OAuthToken>;
  updateOAuthToken(userId: string, provider: string, updates: Partial<InsertOAuthToken>): Promise<OAuthToken | undefined>;
  deleteOAuthToken(userId: string, provider: string): Promise<boolean>;

  // User preferences methods
  getUserPreferences(userId: string): Promise<UserPreferences | undefined>;
  saveUserPreferences(userId: string, preferences: InsertUserPreferences): Promise<UserPreferences>;
  getUserTeamPins(userId: string): Promise<string[]>;

  // User API key methods
  getUserApiKeys(userId: string): Promise<UserApiKey[]>;
  getUserApiKey(userId: string, provider: UserApiKey['provider']): Promise<UserApiKey | undefined>;
  upsertUserApiKey(userId: string, provider: UserApiKey['provider'], apiKey: string): Promise<UserApiKey>;
  deleteUserApiKey(userId: string, provider: UserApiKey['provider']): Promise<boolean>;

  // Pro coupon methods
  listProCoupons(): Promise<ProCoupon[]>;
  createProCoupon(coupon: InsertProCoupon): Promise<ProCoupon>;
  updateProCoupon(id: string, updates: Partial<InsertProCoupon>): Promise<ProCoupon | undefined>;
  deleteProCoupon(id: string): Promise<boolean>;
  getProCouponByCode(code: string): Promise<ProCoupon | undefined>;
  getProCouponRedemption(couponId: string, userId: string): Promise<ProCouponRedemption | undefined>;
  createProCouponRedemption(couponId: string, userId: string): Promise<ProCouponRedemption>;
  incrementProCouponRedemption(couponId: string): Promise<ProCoupon | undefined>;
  deleteProCouponRedemption(redemptionId: string): Promise<boolean>;

  // N8N agent methods
  getN8nAgents(userId: string): Promise<N8nAgent[]>;
  createN8nAgent(userId: string, agent: InsertN8nAgent): Promise<N8nAgent>;
  deleteN8nAgent(userId: string, agentId: string): Promise<boolean>;
  createN8nAgentRun(agentId: string, run: Omit<InsertN8nAgentRun, 'agentId'>): Promise<N8nAgentRun>;
  listN8nAgentRuns(agentId: string, limit?: number): Promise<N8nAgentRun[]>;

  // File methods
  saveFile(
    ownerId: string,
    buffer: Buffer,
    name: string,
    mimeType: string,
    analyzedContent?: string,
    metadata?: Record<string, unknown> | null,
  ): Promise<Attachment>;
  getFileForUser(id: string, ownerId: string): Promise<StoredFile | undefined>;
  deleteFile(id: string, ownerId: string): Promise<boolean>;
  
  // Knowledge item methods
  getKnowledgeItems(userId: string): Promise<KnowledgeItem[]>;
  getKnowledgeItem(id: string): Promise<KnowledgeItem | undefined>;
  createKnowledgeItem(item: InsertKnowledgeItem): Promise<KnowledgeItem>;
  deleteKnowledgeItem(id: string): Promise<boolean>;
  
  // Multi-level knowledge base methods
  getEffectiveKnowledgeBase(userId: string): Promise<KnowledgeItem[]>;
  getSystemKnowledgeItems(): Promise<KnowledgeItem[]>;
  getTeamKnowledgeItems(teamId: string): Promise<KnowledgeItem[]>;
  getUserTeams(userId: string): Promise<Team[]>;
  createSystemKnowledgeItem(item: Omit<InsertKnowledgeItem, 'userId' | 'scope' | 'scopeId'>, createdBy: string): Promise<KnowledgeItem>;
  createTeamKnowledgeItem(teamId: string, item: Omit<InsertKnowledgeItem, 'userId' | 'scope' | 'scopeId'>, createdBy: string): Promise<KnowledgeItem>;
  updateKnowledgeItem(id: string, updates: Partial<KnowledgeItem>): Promise<KnowledgeItem | undefined>;
  
  // Project methods
  getProject(id: string): Promise<Project | undefined>;
  getProjectByShareToken(shareToken: string): Promise<Project | undefined>;
  getUserProjects(userId: string): Promise<Project[]>;
  createProject(userId: string, project: InsertProject): Promise<Project>;
  updateProject(id: string, updates: Partial<Project>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;
  generateShareToken(projectId: string): Promise<string | undefined>;
  
  // Project knowledge methods
  getProjectKnowledge(projectId: string): Promise<ProjectKnowledge[]>;
  createProjectKnowledge(item: InsertProjectKnowledge): Promise<ProjectKnowledge>;
  deleteProjectKnowledge(id: string): Promise<boolean>;
  
  // Project file methods
  getProjectFiles(projectId: string): Promise<ProjectFile[]>;
  createProjectFile(file: InsertProjectFile): Promise<ProjectFile>;
  deleteProjectFile(id: string): Promise<boolean>;
  
  // Chat migration methods
  moveChatToProject(chatId: string, projectId: string | null): Promise<Chat | undefined>;

  // Password reset token methods
  createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  markTokenAsUsed(token: string): Promise<boolean>;
  deleteExpiredTokens(): Promise<number>;

  // Platform settings methods
  getPlatformSettings(): Promise<PlatformSettings>;
  upsertPlatformSettings(data: PlatformSettingsData): Promise<PlatformSettings>;

  // System prompt methods
  listSystemPrompts(): Promise<SystemPrompt[]>;
  getSystemPrompt(id: string): Promise<SystemPrompt | undefined>;
  getActiveSystemPrompt(): Promise<SystemPrompt | undefined>;
  createSystemPrompt(options: CreateSystemPromptOptions): Promise<SystemPrompt>;
  updateSystemPrompt(id: string, updates: UpdateSystemPromptOptions): Promise<SystemPrompt | undefined>;
  activateSystemPrompt(id: string, activatedByUserId?: string | null): Promise<SystemPrompt | undefined>;

  // Release methods
  listReleases(): Promise<Release[]>;
  getRelease(id: string): Promise<Release | undefined>;
  getActiveRelease(): Promise<Release | undefined>;
  createRelease(options: CreateReleaseOptions): Promise<Release>;
  publishRelease(id: string, options: ReleaseTransitionOptions): Promise<Release | undefined>;
  rollbackRelease(id: string, options: ReleaseTransitionOptions): Promise<Release | undefined>;

  // Expert methods
  listExperts(): Promise<Expert[]>;
  listActiveExperts(): Promise<Expert[]>;
  getExpert(id: string): Promise<Expert | undefined>;
  createExpert(expert: InsertExpert): Promise<Expert>;
  updateExpert(id: string, updates: UpdateExpert): Promise<Expert | undefined>;
  deleteExpert(id: string): Promise<boolean>;
  getAvailableExperts(userId: string): Promise<Expert[]>;
  getUserPlanWithDetails(userId: string): Promise<Plan | undefined>;

  // Template methods
  listTemplates(): Promise<Template[]>;
  getTemplate(id: string): Promise<Template | undefined>;
  createTemplate(template: InsertTemplate): Promise<Template>;
  updateTemplate(id: string, updates: Partial<InsertTemplate>): Promise<Template | undefined>;
  deleteTemplate(id: string): Promise<boolean>;
  getAvailableTemplates(userId: string): Promise<Template[]>;

  // Output template methods
  listOutputTemplates(): Promise<OutputTemplate[]>;
  getOutputTemplate(id: string): Promise<OutputTemplate | undefined>;
  createOutputTemplate(template: InsertOutputTemplate): Promise<OutputTemplate>;
  updateOutputTemplate(id: string, updates: Partial<InsertOutputTemplate>): Promise<OutputTemplate | undefined>;
  deleteOutputTemplate(id: string): Promise<boolean>;
  getAvailableOutputTemplates(userId: string): Promise<OutputTemplate[]>;

  // Tool policy methods
  listToolPolicies(): Promise<ToolPolicy[]>;
  listToolPoliciesByProvider(provider: ToolPolicyProvider): Promise<ToolPolicy[]>;
  getToolPolicy(id: string): Promise<ToolPolicy | undefined>;
  createToolPolicy(policy: InsertToolPolicy): Promise<ToolPolicy>;
  updateToolPolicy(id: string, updates: UpdateToolPolicy): Promise<ToolPolicy | undefined>;
  deleteToolPolicy(id: string): Promise<boolean>;

  // Audit log methods
  createAdminAuditLog(entry: InsertAdminAuditLog): Promise<AdminAuditLog>;
  listAdminAuditLogsForUser(userId: string, limit?: number): Promise<AdminAuditLog[]>;
  getAdminAuditLogs(filters?: {
    targetUserId?: string;
    actorUserId?: string;
    actions?: string[];
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<AdminAuditLog[]>;

  // Analytics event methods
  createAnalyticsEvent(event: InsertAnalyticsEvent): Promise<AnalyticsEvent>;
  getAnalyticsEvents(filters?: {
    userId?: string;
    projectId?: string | null;
    provider?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<AnalyticsEvent[]>;

  // Provider pricing methods
  listProviderPricing(): Promise<ProviderPricing[]>;
  getProviderPricing(provider: string, model: string): Promise<ProviderPricing | undefined>;
  upsertProviderPricing(pricing: InsertProviderPricing): Promise<ProviderPricing>;

  // Model methods
  listModels(): Promise<Model[]>;
  getModel(id: string): Promise<Model | undefined>;
  createModel(model: InsertModel): Promise<Model>;
  updateModel(id: string, updates: UpdateModel): Promise<Model | undefined>;
  deleteModel(id: string): Promise<boolean>;
  getAvailableModels(userId: string): Promise<Model[]>;
  getModelByModelId(modelId: string): Promise<Model | undefined>;

  // Team methods
  getTeam(id: string): Promise<Team | undefined>;
  getUserTeams(userId: string): Promise<Team[]>;
  getTeamsByOwner(ownerId: string): Promise<Team[]>;
  createTeam(team: InsertTeam): Promise<Team>;
  updateTeam(id: string, updates: Partial<InsertTeam>): Promise<Team | undefined>;
  deleteTeam(id: string): Promise<boolean>;

  // Team member methods
  getTeamMembers(teamId: string): Promise<TeamMember[]>;
  getTeamMember(teamId: string, userId: string): Promise<TeamMember | undefined>;
  getUserTeamMemberships(userId: string): Promise<TeamMember[]>;
  addTeamMember(member: InsertTeamMember): Promise<TeamMember>;
  updateTeamMember(id: string, updates: Partial<InsertTeamMember>): Promise<TeamMember | undefined>;
  removeTeamMember(teamId: string, userId: string): Promise<boolean>;
  getTeamMemberCount(teamId: string): Promise<number>;

  // Team invitation methods
  getTeamInvitation(id: string): Promise<TeamInvitation | undefined>;
  getTeamInvitationByToken(token: string): Promise<TeamInvitation | undefined>;
  getTeamInvitations(teamId: string): Promise<TeamInvitation[]>;
  getUserInvitations(email: string): Promise<TeamInvitation[]>;
  createTeamInvitation(invitation: InsertTeamInvitation): Promise<TeamInvitation>;
  updateTeamInvitation(id: string, updates: Partial<TeamInvitation>): Promise<TeamInvitation | undefined>;
  deleteTeamInvitation(id: string): Promise<boolean>;
  deleteExpiredInvitations(): Promise<number>;
}

export class MemStorage {
  private users: Map<string, User>;
  private chats: Map<string, Chat>;
  private messages: Map<string, Message>;
  private reactions: Map<string, Reaction>;
  private usageMetrics: Map<string, UsageMetric>;
  private oauthTokens: Map<string, OAuthToken>;
  private userPreferences: Map<string, UserPreferences>;
  private userApiKeys: Map<string, Map<string, UserApiKey>>;
  private knowledgeItems: Map<string, KnowledgeItem>;
  private projects: Map<string, Project>;
  private projectKnowledgeMap: Map<string, ProjectKnowledge>;
  private projectFilesMap: Map<string, ProjectFile>;
  private passwordResetTokensMap: Map<string, PasswordResetToken>;
  private n8nAgentsMap: Map<string, N8nAgent>;
  private n8nAgentRunsMap: Map<string, N8nAgentRun[]>;
  private teams: Map<string, Team>;
  private teamMembers: Map<string, TeamMember>;
  private fileStorage: InMemoryFileStorage;
  private platformSettings: PlatformSettings;
  private proCouponsMap: Map<string, ProCoupon>;
  private proCouponRedemptionsMap: Map<string, ProCouponRedemption>;
  private proCouponRedemptionsById: Map<string, ProCouponRedemption>;
  private templatesMap: Map<string, Template>;
  private outputTemplatesMap: Map<string, OutputTemplate>;
  private toolPoliciesMap: Map<string, ToolPolicy>;
  private toolPolicyKeyIndex: Map<string, string>;
  private adminAuditLogEntries: Map<string, AdminAuditLog>;
  private systemPromptsMap: Map<string, SystemPrompt>;
  private activeSystemPromptId: string | null;
  private systemPromptVersionCounter: number;
  private releasesMap: Map<string, Release>;
  private activeReleaseId: string | null;
  private releaseVersionCounter: number;
  private plansMap: Map<string, Plan>;
  private planSlugIndex: Map<string, string>;
  private modelsMap: Map<string, Model>;

  constructor() {
    this.users = new Map();
    this.chats = new Map();
    this.messages = new Map();
    this.reactions = new Map();
    this.usageMetrics = new Map();
    this.oauthTokens = new Map();
    this.userPreferences = new Map();
    this.userApiKeys = new Map();
    this.knowledgeItems = new Map();
    this.projects = new Map();
    this.projectKnowledgeMap = new Map();
    this.projectFilesMap = new Map();
    this.passwordResetTokensMap = new Map();
    this.n8nAgentsMap = new Map();
    this.n8nAgentRunsMap = new Map();
    this.teams = new Map();
    this.teamMembers = new Map();
    this.fileStorage = new InMemoryFileStorage();
    this.proCouponsMap = new Map();
    this.proCouponRedemptionsMap = new Map();
    this.proCouponRedemptionsById = new Map();
    this.templatesMap = new Map();
    this.outputTemplatesMap = new Map();
    this.toolPoliciesMap = new Map();
    this.toolPolicyKeyIndex = new Map();
    this.adminAuditLogEntries = new Map();
    this.systemPromptsMap = new Map();
    this.activeSystemPromptId = null;
    this.systemPromptVersionCounter = 0;
    this.releasesMap = new Map();
    this.activeReleaseId = null;
    this.releaseVersionCounter = 0;
    this.plansMap = new Map();
    this.planSlugIndex = new Map();
    this.modelsMap = new Map();
    const now = new Date();
    this.platformSettings = {
      id: 'global',
      data: preparePlatformSettingsPayload(defaultPlatformSettings),
      createdAt: now,
      updatedAt: now,
    };

    const seededPlans = this.seedDefaultPlans(now);
    const proPlan = seededPlans.find(plan => plan.slug === 'pro') ?? null;

    const superAdminId = randomUUID();
    const superAdminUser: User = {
      id: superAdminId,
      username: 'superadmin',
      password: null,
      email: 'superadmin@example.com',
      avatar: null,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
      plan: proPlan?.slug ?? 'pro',
      planId: proPlan?.id ?? null,
      proAccessCode: null,
      role: 'super_admin',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(superAdminId, superAdminUser);

    const defaultPromptId = randomUUID();
    const defaultPrompt: SystemPrompt = {
      id: defaultPromptId,
      version: 1,
      label: 'Default prompt',
      content: DEFAULT_SYSTEM_PROMPT,
      notes: 'Seeded default system prompt',
      createdByUserId: null,
      activatedByUserId: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      activatedAt: now,
    };
    this.systemPromptsMap.set(defaultPromptId, defaultPrompt);
    this.activeSystemPromptId = defaultPromptId;
    this.systemPromptVersionCounter = 1;

    const defaultReleaseId = randomUUID();
    const defaultRelease: Release = {
      id: defaultReleaseId,
      version: 1,
      label: 'Seed release',
      status: 'active',
      changeNotes: 'Initial platform release',
      systemPromptId: defaultPromptId,
      expertIds: [],
      templateIds: [],
      outputTemplateIds: [],
      toolPolicyIds: [],
      isActive: true,
      publishedAt: now,
      publishedByUserId: superAdminId,
      createdAt: now,
      updatedAt: now,
    };
    this.releasesMap.set(defaultReleaseId, defaultRelease);
    this.activeReleaseId = defaultReleaseId;
    this.releaseVersionCounter = 1;
  }

  private normalizePlanSlug(slug?: string | null): string | null {
    if (!slug || typeof slug !== 'string') {
      return null;
    }
    const normalized = slug.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
  }

  private async normalizeUserPlanAssignment(
    input: { plan?: string | null; planId?: string | null },
  ): Promise<{ plan?: string; planId?: string | null }> {
    const hasPlanField = Object.prototype.hasOwnProperty.call(input, 'plan');
    const hasPlanIdField = Object.prototype.hasOwnProperty.call(input, 'planId');

    if (!hasPlanField && !hasPlanIdField) {
      return {};
    }

    let planRecord: Plan | undefined;
    const planIdValue = hasPlanIdField ? input.planId ?? null : undefined;

    if (planIdValue) {
      planRecord = this.plansMap.get(planIdValue);
      if (!planRecord) {
        planRecord = await this.getPlan(planIdValue).catch(() => undefined);
      }
    }

    let normalizedSlug: string | null = null;

    if (!planRecord && hasPlanField) {
      normalizedSlug = this.normalizePlanSlug(input.plan);
      if (normalizedSlug) {
        planRecord = await this.getPlanBySlug(normalizedSlug);
      }
    }

    if (planRecord) {
      return {
        planId: planRecord.id,
        plan: planRecord.slug ?? this.normalizePlanSlug(planRecord.name) ?? planRecord.id,
      };
    }

    if (hasPlanField) {
      normalizedSlug = normalizedSlug ?? this.normalizePlanSlug(input.plan);
      return {
        plan: normalizedSlug ?? 'free',
        ...(hasPlanIdField ? { planId: input.planId ?? null } : {}),
      };
    }

    return {
      planId: null,
      plan: 'free',
    };
  }

  private indexPlan(plan: Plan): void {
    const normalized = this.normalizePlanSlug(plan.slug) ?? this.normalizePlanSlug(plan.name);
    if (normalized) {
      this.planSlugIndex.set(normalized, plan.id);
    }
  }

  private removePlanFromIndex(plan: Plan): void {
    const normalized = this.normalizePlanSlug(plan.slug) ?? this.normalizePlanSlug(plan.name);
    if (!normalized) {
      return;
    }
    const indexedId = this.planSlugIndex.get(normalized);
    if (indexedId === plan.id) {
      this.planSlugIndex.delete(normalized);
    }
  }

  private seedDefaultPlans(now: Date): Plan[] {
    const defaults: Plan[] = [
      {
        id: randomUUID(),
        name: 'Free',
        slug: 'free',
        tier: 'free',
        description: 'Get started with basic features',
        allowExperts: false,
        allowTemplates: false,
        allowModels: true,
        allowKbSystem: false,
        allowKbOrg: false,
        allowKbTeam: false,
        allowKbUser: true,
        allowMemory: true,
        allowAgents: false,
        allowApiAccess: false,
        showExpertsUpsell: true,
        showTemplatesUpsell: true,
        showApiUpsell: true,
        dailyMessageLimit: 10,
        maxFileSizeMb: 10,
        storageQuotaGb: 1,
        modelsAllowed: ['claude-3.5-haiku-20241022'],
        expertsAllowed: [],
        templatesAllowed: [],
        priceMonthlyUsd: 0,
        priceAnnualUsd: 0,
        isProTier: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        name: 'Pro',
        slug: 'pro',
        tier: 'pro',
        description: 'Full access to experts and templates',
        allowExperts: true,
        allowTemplates: true,
        allowModels: true,
        allowKbSystem: false,
        allowKbOrg: false,
        allowKbTeam: false,
        allowKbUser: true,
        allowMemory: true,
        allowAgents: false,
        allowApiAccess: false,
        showExpertsUpsell: false,
        showTemplatesUpsell: false,
        showApiUpsell: true,
        dailyMessageLimit: null,
        maxFileSizeMb: 50,
        storageQuotaGb: 10,
        modelsAllowed: [
          'claude-3.5-haiku-20241022',
          'claude-3.5-sonnet-20241022',
          'gpt-4-turbo',
          'gpt-4',
        ],
        expertsAllowed: [],
        templatesAllowed: [],
        priceMonthlyUsd: 20,
        priceAnnualUsd: 200,
        isProTier: true,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        name: 'Enterprise',
        slug: 'enterprise',
        tier: 'enterprise',
        description: 'Complete platform access with all features',
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
        maxFileSizeMb: null,
        storageQuotaGb: null,
        modelsAllowed: [],
        expertsAllowed: [],
        templatesAllowed: [],
        priceMonthlyUsd: 100,
        priceAnnualUsd: 1000,
        isProTier: true,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ];

    for (const plan of defaults) {
      this.plansMap.set(plan.id, structuredClone(plan));
      this.indexPlan(plan);
    }

    return defaults.map(plan => structuredClone(plan));
  }

  private normalizeCouponCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private parseDate(value: Date | string | null | undefined): Date | null {
    if (!value) {
      return null;
    }
    if (value instanceof Date) {
      return value;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  }

  private normalizeIdList(ids?: string[] | null): string[] {
    if (!ids) {
      return [];
    }

    const unique = new Set<string>();
    const normalized: string[] = [];
    for (const rawId of ids) {
      if (typeof rawId !== 'string') {
        continue;
      }
      const trimmed = rawId.trim();
      if (!trimmed) {
        continue;
      }
      if (!unique.has(trimmed)) {
        unique.add(trimmed);
        normalized.push(trimmed);
      }
    }

    return normalized;
  }

  private getToolPolicyKey(provider: string, toolName: string): string {
    return `${provider.trim().toLowerCase()}::${toolName.trim().toLowerCase()}`;
  }

  private cloneToolPolicy(policy: ToolPolicy): ToolPolicy {
    return {
      ...policy,
      // Guard against null timestamps returned by the DB type
      createdAt: this.parseDate(policy.createdAt) ?? new Date(0),
      updatedAt: this.parseDate(policy.updatedAt) ?? new Date(0),
    };
  }

  async listSystemPrompts(): Promise<SystemPrompt[]> {
    return Array.from(this.systemPromptsMap.values())
      .sort((a, b) => b.version - a.version)
      .map((prompt) => structuredClone(prompt));
  }

  async getSystemPrompt(id: string): Promise<SystemPrompt | undefined> {
    const prompt = this.systemPromptsMap.get(id);
    return prompt ? structuredClone(prompt) : undefined;
  }

  async getActiveSystemPrompt(): Promise<SystemPrompt | undefined> {
    if (this.activeReleaseId) {
      const release = this.releasesMap.get(this.activeReleaseId);
      if (release?.systemPromptId) {
        const prompt = this.systemPromptsMap.get(release.systemPromptId);
        if (prompt) {
          this.activeSystemPromptId = release.systemPromptId;
          return structuredClone(prompt);
        }
      }
    }

    if (this.activeSystemPromptId) {
      const prompt = this.systemPromptsMap.get(this.activeSystemPromptId);
      if (prompt) {
        return structuredClone(prompt);
      }
    }

    const active = Array.from(this.systemPromptsMap.values()).find((prompt) => prompt.isActive);
    return active ? structuredClone(active) : undefined;
  }

  async createSystemPrompt(options: CreateSystemPromptOptions): Promise<SystemPrompt> {
    const now = new Date();
    const id = randomUUID();
    const nextVersion = this.systemPromptVersionCounter + 1;
    const activatedBy = options.activate ? options.activatedByUserId ?? options.createdByUserId ?? null : null;

    if (options.activate) {
      for (const [key, prompt] of this.systemPromptsMap.entries()) {
        const updated: SystemPrompt = {
          ...prompt,
          isActive: false,
          activatedAt: null,
          activatedByUserId: null,
          updatedAt: now,
        };
        this.systemPromptsMap.set(key, updated);
      }
      this.activeSystemPromptId = id;
    }

    const record: SystemPrompt = {
      id,
      version: nextVersion,
      label: options.label ?? null,
      content: options.content,
      notes: options.notes ?? null,
      createdByUserId: options.createdByUserId ?? null,
      activatedByUserId: options.activate ? activatedBy : null,
      isActive: options.activate ?? false,
      createdAt: now,
      updatedAt: now,
      activatedAt: options.activate ? now : null,
    };

    this.systemPromptsMap.set(id, record);
    this.systemPromptVersionCounter = nextVersion;

    if (record.isActive) {
      this.activeSystemPromptId = id;
    }

    return structuredClone(record);
  }

  async updateSystemPrompt(id: string, updates: UpdateSystemPromptOptions): Promise<SystemPrompt | undefined> {
    const existing = this.systemPromptsMap.get(id);
    if (!existing) {
      return undefined;
    }

    const updated: SystemPrompt = {
      ...existing,
      updatedAt: new Date(),
    };

    if (updates.content !== undefined) {
      updated.content = updates.content;
    }
    if (updates.label !== undefined) {
      updated.label = updates.label ?? null;
    }
    if (updates.notes !== undefined) {
      updated.notes = updates.notes ?? null;
    }

    this.systemPromptsMap.set(id, updated);

    if (updated.isActive) {
      this.activeSystemPromptId = id;
    }

    return structuredClone(updated);
  }

  async activateSystemPrompt(id: string, activatedByUserId?: string | null): Promise<SystemPrompt | undefined> {
    const target = this.systemPromptsMap.get(id);
    if (!target) {
      return undefined;
    }

    const now = new Date();
    for (const [key, prompt] of this.systemPromptsMap.entries()) {
      const isTarget = key === id;
      const updated: SystemPrompt = {
        ...prompt,
        isActive: isTarget,
        activatedAt: isTarget ? now : null,
        activatedByUserId: isTarget ? (activatedByUserId ?? null) : null,
        updatedAt: now,
      };
      this.systemPromptsMap.set(key, updated);
    }

    this.activeSystemPromptId = id;
    const activated = this.systemPromptsMap.get(id)!;
    return structuredClone(activated);
  }

  async listReleases(): Promise<Release[]> {
    return Array.from(this.releasesMap.values())
      .sort((a, b) => b.version - a.version)
      .map((release) => structuredClone(release));
  }

  async getRelease(id: string): Promise<Release | undefined> {
    const release = this.releasesMap.get(id);
    return release ? structuredClone(release) : undefined;
  }

  async getActiveRelease(): Promise<Release | undefined> {
    if (this.activeReleaseId) {
      const release = this.releasesMap.get(this.activeReleaseId);
      if (release) {
        return structuredClone(release);
      }
    }

    const active = Array.from(this.releasesMap.values()).find((release) => release.isActive);
    if (active) {
      this.activeReleaseId = active.id;
      return structuredClone(active);
    }

    return undefined;
  }

  async createRelease(options: CreateReleaseOptions): Promise<Release> {
    const now = new Date();
    const id = randomUUID();
    const nextVersion = this.releaseVersionCounter + 1;

    const release: Release = {
      id,
      version: nextVersion,
      label: options.label,
      status: 'draft',
      changeNotes: options.changeNotes ?? null,
      systemPromptId: options.systemPromptId ?? null,
      expertIds: this.normalizeIdList(options.expertIds),
      templateIds: this.normalizeIdList(options.templateIds),
      outputTemplateIds: this.normalizeIdList(options.outputTemplateIds),
      toolPolicyIds: this.normalizeIdList(options.toolPolicyIds),
      isActive: false,
      publishedAt: null,
      publishedByUserId: null,
      createdAt: now,
      updatedAt: now,
    };

    this.releasesMap.set(id, release);
    this.releaseVersionCounter = nextVersion;
    return structuredClone(release);
  }

  async publishRelease(id: string, options: ReleaseTransitionOptions): Promise<Release | undefined> {
    const release = this.releasesMap.get(id);
    if (!release) {
      return undefined;
    }

    const now = new Date();

    if (this.activeReleaseId && this.activeReleaseId !== id) {
      const current = this.releasesMap.get(this.activeReleaseId);
      if (current) {
        this.releasesMap.set(current.id, {
          ...current,
          status: 'archived',
          isActive: false,
          updatedAt: now,
        });
      }
    }

    const updated: Release = {
      ...release,
      status: 'active',
      isActive: true,
      changeNotes: options.changeNotes,
      publishedAt: now,
      publishedByUserId: options.actorUserId ?? null,
      updatedAt: now,
    };

    this.releasesMap.set(id, updated);
    this.activeReleaseId = id;

    if (updated.systemPromptId) {
      for (const [key, prompt] of this.systemPromptsMap.entries()) {
        const isTarget = key === updated.systemPromptId;
        this.systemPromptsMap.set(key, {
          ...prompt,
          isActive: isTarget,
          activatedAt: isTarget ? now : null,
          activatedByUserId: isTarget ? options.actorUserId ?? null : null,
          updatedAt: now,
        });
      }
      this.activeSystemPromptId = updated.systemPromptId;
    } else {
      for (const [key, prompt] of this.systemPromptsMap.entries()) {
        this.systemPromptsMap.set(key, {
          ...prompt,
          isActive: false,
          activatedAt: null,
          activatedByUserId: null,
          updatedAt: now,
        });
      }
      this.activeSystemPromptId = null;
    }

    return structuredClone(updated);
  }

  async rollbackRelease(id: string, options: ReleaseTransitionOptions): Promise<Release | undefined> {
    return this.publishRelease(id, options);
  }

  // Plan methods
  async createPlan(plan: InsertPlan): Promise<Plan> {
    const id = randomUUID();
    const now = new Date();
    const slug = this.normalizePlanSlug(plan.slug) ?? this.normalizePlanSlug(plan.name) ?? id;
    const tier = plan.tier?.trim().toLowerCase() ?? "custom";
    const newPlan: Plan = {
      ...plan,
      id,
      slug,
      tier,
      description: plan.description ?? null,
      allowExperts: plan.allowExperts ?? false,
      allowTemplates: plan.allowTemplates ?? false,
      allowModels: plan.allowModels ?? true,
      allowKbSystem: plan.allowKbSystem ?? false,
      allowKbOrg: plan.allowKbOrg ?? false,
      allowKbTeam: plan.allowKbTeam ?? false,
      allowKbUser: plan.allowKbUser ?? true,
      allowMemory: plan.allowMemory ?? true,
      allowAgents: plan.allowAgents ?? false,
      allowApiAccess: plan.allowApiAccess ?? false,
      showExpertsUpsell: plan.showExpertsUpsell ?? false,
      showTemplatesUpsell: plan.showTemplatesUpsell ?? false,
      showApiUpsell: plan.showApiUpsell ?? false,
      dailyMessageLimit: plan.dailyMessageLimit ?? null,
      maxFileSizeMb: plan.maxFileSizeMb ?? 10,
      storageQuotaGb: plan.storageQuotaGb ?? 1,
      isProTier: plan.isProTier ?? false,
      isActive: plan.isActive ?? true,
      priceMonthlyUsd: plan.priceMonthlyUsd ?? null,
      priceAnnualUsd: plan.priceAnnualUsd ?? null,
      // Ensure we always store mutable string[] and filter invalids
      modelsAllowed: this.normalizeIdList((plan.modelsAllowed as string[] | null | undefined) ?? []),
      expertsAllowed: this.normalizeIdList((plan.expertsAllowed as string[] | null | undefined) ?? []),
      templatesAllowed: this.normalizeIdList((plan.templatesAllowed as string[] | null | undefined) ?? []),
      createdAt: now,
      updatedAt: now,
    };
    this.plansMap.set(id, newPlan);
    this.indexPlan(newPlan);
    return newPlan;
  }

  async updatePlan(id: string, updates: UpdatePlan): Promise<Plan | undefined> {
    const existingPlan = this.plansMap.get(id);
    if (!existingPlan) return undefined;

    const nextSlug = this.normalizePlanSlug(updates.slug ?? existingPlan.slug ?? existingPlan.name) ?? existingPlan.slug;
    const nextTier =
      updates.tier !== undefined ? updates.tier?.trim().toLowerCase() ?? "custom" : existingPlan.tier;
    const updatedPlan: Plan = {
      ...existingPlan,
      ...updates,
      allowExperts: updates.allowExperts ?? existingPlan.allowExperts,
      allowTemplates: updates.allowTemplates ?? existingPlan.allowTemplates,
      allowModels: updates.allowModels ?? existingPlan.allowModels,
      allowKbSystem: updates.allowKbSystem ?? existingPlan.allowKbSystem,
      allowKbOrg: updates.allowKbOrg ?? existingPlan.allowKbOrg,
      allowKbTeam: updates.allowKbTeam ?? existingPlan.allowKbTeam,
      allowKbUser: updates.allowKbUser ?? existingPlan.allowKbUser,
      allowMemory: updates.allowMemory ?? existingPlan.allowMemory,
      allowAgents: updates.allowAgents ?? existingPlan.allowAgents,
      allowApiAccess: updates.allowApiAccess ?? existingPlan.allowApiAccess,
      showExpertsUpsell: updates.showExpertsUpsell ?? existingPlan.showExpertsUpsell,
      showTemplatesUpsell: updates.showTemplatesUpsell ?? existingPlan.showTemplatesUpsell,
      showApiUpsell: updates.showApiUpsell ?? existingPlan.showApiUpsell,
      dailyMessageLimit: (updates.dailyMessageLimit ?? existingPlan.dailyMessageLimit) ?? null,
      maxFileSizeMb: (updates.maxFileSizeMb ?? existingPlan.maxFileSizeMb) ?? 10,
      storageQuotaGb: (updates.storageQuotaGb ?? existingPlan.storageQuotaGb) ?? 1,
      isProTier: updates.isProTier ?? existingPlan.isProTier,
      isActive: updates.isActive ?? existingPlan.isActive,
      // Normalize array fields to concrete mutable arrays
      modelsAllowed: this.normalizeIdList(
        (updates.modelsAllowed as string[] | null | undefined) ?? existingPlan.modelsAllowed ?? []
      ),
      expertsAllowed: this.normalizeIdList(
        (updates.expertsAllowed as string[] | null | undefined) ?? existingPlan.expertsAllowed ?? []
      ),
      templatesAllowed: this.normalizeIdList(
        (updates.templatesAllowed as string[] | null | undefined) ?? existingPlan.templatesAllowed ?? []
      ),
      slug: nextSlug,
      tier: nextTier,
      updatedAt: new Date(),
    };
    if ((existingPlan.slug ?? existingPlan.name) !== (updatedPlan.slug ?? updatedPlan.name)) {
      this.removePlanFromIndex(existingPlan);
    }
    this.plansMap.set(id, updatedPlan);
    this.indexPlan(updatedPlan);
    return updatedPlan;
  }

  async deletePlan(id: string): Promise<boolean> {
    // Check if any users are using this plan
    const usersWithPlan = Array.from(this.users.values()).filter(user => user.planId === id);
    if (usersWithPlan.length > 0) {
      return false; // Can't delete a plan that's in use
    }
    const existingPlan = this.plansMap.get(id);
    if (existingPlan) {
      this.removePlanFromIndex(existingPlan);
    }
    return this.plansMap.delete(id);
  }

  async getPlan(id: string): Promise<Plan | undefined> {
    return this.plansMap.get(id);
  }

  async getPlanBySlug(slug: string): Promise<Plan | undefined> {
    const normalized = this.normalizePlanSlug(slug);
    if (!normalized) {
      return undefined;
    }
    const planId = this.planSlugIndex.get(normalized);
    if (planId) {
      const plan = this.plansMap.get(planId);
      if (plan) {
        return plan;
      }
    }

    // Fallback to searching by name if slug index misses (legacy data)
    for (const plan of this.plansMap.values()) {
      if (this.normalizePlanSlug(plan.name) === normalized) {
        this.planSlugIndex.set(normalized, plan.id);
        return plan;
      }
    }

    return undefined;
  }

  async listPlans(): Promise<Plan[]> {
    return Array.from(this.plansMap.values()).sort((a, b) => {
      // Sort by name
      return a.name.localeCompare(b.name);
    });
  }

  async getUserPlan(userId: string): Promise<Plan | undefined> {
    const user = await this.getUser(userId);
    if (!user) return undefined;

    return this.resolveUserPlan(user);
  }

  async resolveUserPlan(user: User): Promise<Plan | undefined> {
    if (user.planId) {
      const plan = this.plansMap.get(user.planId);
      if (plan) {
        return plan;
      }
    }

    const normalizedLegacy = this.normalizePlanSlug(user.plan);
    if (normalizedLegacy) {
      const plan = await this.getPlanBySlug(normalizedLegacy);
      if (plan) {
        return plan;
      }
    }

    return undefined;
  }

  async getEffectiveCapabilities(userId: string): Promise<EffectiveCapabilities | undefined> {
    const user = await this.getUser(userId);
    if (!user) return undefined;

    // Get user's plan details
    const plan = await this.getUserPlan(userId);

    // Default to free plan if no plan found
    const effectivePlan = plan || {
      id: 'free',
      name: 'Free',
      slug: 'free',
      tier: 'free',
      description: 'Fallback free plan',
      allowExperts: false,
      allowTemplates: false,
      allowModels: true,
      allowKbSystem: false,
      allowKbOrg: false,
      allowKbTeam: false,
      allowKbUser: true,
      allowMemory: true,
      allowAgents: false,
      allowApiAccess: false,
      showExpertsUpsell: true,
      showTemplatesUpsell: true,
      showApiUpsell: true,
      dailyMessageLimit: 10,
      maxFileSizeMb: 10,
      storageQuotaGb: 1,
      modelsAllowed: [],
      expertsAllowed: [],
      templatesAllowed: [],
      isProTier: false,
      isActive: true,
      priceMonthlyUsd: 0,
      priceAnnualUsd: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Plan;

    const planSlug = this.normalizePlanSlug(effectivePlan.slug ?? effectivePlan.name) ?? 'free';
    const isEnterprisePlan =
      planSlug.includes('enterprise') ||
      effectivePlan.allowAgents ||
      effectivePlan.allowKbOrg ||
      effectivePlan.allowKbTeam;
    const computedProTier =
      isEnterprisePlan ||
      planSlug.includes('pro') ||
      effectivePlan.allowExperts ||
      effectivePlan.allowTemplates ||
      effectivePlan.allowApiAccess ||
      (effectivePlan.priceMonthlyUsd ?? 0) > 0 ||
      (effectivePlan.priceAnnualUsd ?? 0) > 0;
    const isProTierPlan = effectivePlan.isProTier ?? computedProTier;
    const tier = isEnterprisePlan ? 'enterprise' : isProTierPlan ? 'pro' : 'free';

    // Get user's team memberships for enterprise features
    const userTeams = await this.getUserTeams(userId);
    const isEnterprise = isEnterprisePlan || userTeams.length > 0;

    // Build capabilities object
    const capabilities: EffectiveCapabilities = {
      plan: {
        id: effectivePlan.id ?? planSlug,
        name: effectivePlan.name ?? planSlug,
        slug: planSlug,
        tier,
        isProTier: isProTierPlan,
      },
      limits: {
        daily_message_limit: effectivePlan.dailyMessageLimit || null,
        max_file_size_mb: effectivePlan.maxFileSizeMb || 10,
        storage_quota_gb: effectivePlan.storageQuotaGb || 1,
      },
      features: {
        experts: {
          allowed: effectivePlan.allowExperts || false,
          upsell: effectivePlan.showExpertsUpsell || false,
        },
        templates: {
          allowed: effectivePlan.allowTemplates || false,
          upsell: effectivePlan.showTemplatesUpsell || false,
        },
        models: {
          allowed: effectivePlan.allowModels !== false, // Default to true
        },
        kb: {
          system: effectivePlan.allowKbSystem || false,
          team: effectivePlan.allowKbTeam || false,
          user: effectivePlan.allowKbUser !== false, // Default to true
        },
        memory: effectivePlan.allowMemory !== false, // Default to true
        agents: effectivePlan.allowAgents || false,
        api_access: {
          allowed: effectivePlan.allowApiAccess || false,
          upsell: effectivePlan.showApiUpsell || false,
        },
      },
      allowlists: {
        experts: effectivePlan.expertsAllowed || [],
        templates: effectivePlan.templatesAllowed || [],
        models: effectivePlan.modelsAllowed || [],
      },
      teams: {
        enabled: isEnterprise,
        maxTeamsPerOrg: isEnterprise ? 10 : 0,
        maxMembersPerTeam: isEnterprise ? 50 : 0,
      },
    };

    return capabilities;
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async listUsers(): Promise<User[]> {
    return Array.from(this.users.values()).sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }

  async hasAdminUser(): Promise<boolean> {
    return Array.from(this.users.values()).some((user) => user.role === 'admin' || user.role === 'super_admin');
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const planAssignment = await this.normalizeUserPlanAssignment({
      plan: insertUser.plan ?? null,
      planId: insertUser.planId ?? null,
    });

    const user: User = {
      ...insertUser,
      id,
      username: insertUser.username ?? null,
      password: insertUser.password ?? null,
      email: insertUser.email ?? null,
      avatar: insertUser.avatar ?? null,
      firstName: insertUser.firstName ?? null,
      lastName: insertUser.lastName ?? null,
      profileImageUrl: insertUser.profileImageUrl ?? null,
      plan: planAssignment.plan ?? this.normalizePlanSlug(insertUser.plan) ?? 'free',
      planId: planAssignment.planId ?? null,
      proAccessCode: insertUser.proAccessCode ?? null,
      role: insertUser.role ?? 'user',
      status: insertUser.status ?? 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }
  
  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const existingUser = this.users.get(id);
    if (!existingUser) return undefined;

    const planUpdates = await this.normalizeUserPlanAssignment(updates);

    const updatedUser: User = {
      ...existingUser,
      ...updates,
      ...planUpdates,
      updatedAt: new Date(),
    };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async updateUserStatus(id: string, status: UserStatus): Promise<User | undefined> {
    return this.updateUser(id, { status });
  }
  
  async upsertUser(userData: UpsertUser): Promise<User> {
    const existingUser = userData.id ? await this.getUser(userData.id) : undefined;

    if (existingUser) {
      const planUpdates = await this.normalizeUserPlanAssignment(userData);
      // Update existing user
      const updatedUser = {
        ...existingUser,
        ...userData,
        ...planUpdates,
        updatedAt: new Date(),
      };
      this.users.set(existingUser.id, updatedUser as User);
      return updatedUser as User;
    } else {
      // Create new user
      const id = userData.id || randomUUID();
      const planAssignment = await this.normalizeUserPlanAssignment(userData);
      const newUser: User = {
        id,
        username: userData.username || null,
        password: userData.password || null,
        email: userData.email || null,
        avatar: userData.avatar || null,
        firstName: userData.firstName || null,
        lastName: userData.lastName || null,
        profileImageUrl: userData.profileImageUrl || null,
        plan: planAssignment.plan ?? this.normalizePlanSlug(userData.plan) ?? 'free',
        planId: planAssignment.planId ?? null,
        proAccessCode: userData.proAccessCode || null,
        role: userData.role || 'user',
        status: userData.status || 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.users.set(id, newUser);
      return newUser;
    }
  }

  // Chat methods
  async getChat(id: string): Promise<Chat | undefined> {
    return this.chats.get(id);
  }

  async getUserChats(userId: string, includeArchived = false, projectId?: string | null): Promise<Chat[]> {
    return Array.from(this.chats.values()).filter(
      (chat) => {
        // Filter by user
        if (chat.userId !== userId) return false;
        
        // Filter by status
        const statusMatch = includeArchived ? chat.status !== 'deleted' : chat.status === 'active';
        if (!statusMatch) return false;
        
        // Filter by projectId
        // If projectId is undefined, return all chats regardless of project
        // If projectId is null, return only global chats (chat.projectId === null)
        // If projectId is a string, return only chats for that specific project
        if (projectId !== undefined) {
          if (projectId === null) {
            return chat.projectId === null;
          } else {
            return chat.projectId === projectId;
          }
        }
        
        return true;
      }
    ).sort((a, b) => new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime());
  }

  async getArchivedChats(userId: string): Promise<Chat[]> {
    return Array.from(this.chats.values()).filter(
      (chat) => chat.userId === userId && chat.status === 'archived'
    ).sort((a, b) => new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime());
  }

  async createChat(insertChat: InsertChat & { userId: string }): Promise<Chat> {
    const id = randomUUID();
    const now = new Date();
    const chat: Chat = {
      ...insertChat,
      id,
      userId: insertChat.userId,
      projectId: insertChat.projectId || null,
      model: insertChat.model || 'compound',
      status: 'active',
      createdAt: now,
      updatedAt: now
    };
    this.chats.set(id, chat);
    return chat;
  }

  async updateChat(id: string, updates: Partial<InsertChat>): Promise<Chat | undefined> {
    const existingChat = this.chats.get(id);
    if (!existingChat) return undefined;
    
    const updatedChat: Chat = {
      ...existingChat,
      ...updates,
      updatedAt: new Date()
    };
    this.chats.set(id, updatedChat);
    return updatedChat;
  }

  async archiveChat(id: string): Promise<boolean> {
    const chat = this.chats.get(id);
    if (!chat) return false;
    
    const updatedChat: Chat = {
      ...chat,
      status: 'archived',
      updatedAt: new Date()
    };
    this.chats.set(id, updatedChat);
    return true;
  }

  async deleteChat(id: string): Promise<boolean> {
    const chat = this.chats.get(id);
    if (!chat) return false;
    
    const updatedChat: Chat = {
      ...chat,
      status: 'deleted',
      updatedAt: new Date()
    };
    this.chats.set(id, updatedChat);
    return true;
  }

  // Message methods
  async getMessage(id: string): Promise<Message | undefined> {
    return this.messages.get(id);
  }

  async getChatMessages(chatId: string): Promise<Message[]> {
    return Array.from(this.messages.values()).filter(
      (message) => message.chatId === chatId
    ).sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = randomUUID();
    const message: Message = {
      ...insertMessage,
      id,
      attachments: insertMessage.attachments || null,
      metadata: insertMessage.metadata || null,
      createdAt: new Date()
    };
    this.messages.set(id, message);
    return message;
  }
  
  async getMessagesSince(userId: string, since: Date): Promise<Message[]> {
    // Get all chats for the user
    const userChats = await this.getUserChats(userId, true);
    const chatIds = userChats.map(chat => chat.id);
    
    // Get all messages from user's chats since the given date
    return Array.from(this.messages.values()).filter(
      message => chatIds.includes(message.chatId) && 
      new Date(message.createdAt!) >= since &&
      message.role === 'user' // Only count user messages for rate limiting
    );
  }

  // File methods
  async saveFile(
    ownerId: string,
    buffer: Buffer,
    name: string,
    mimeType: string,
    analyzedContent?: string,
    metadata: Record<string, unknown> | null = null,
  ): Promise<Attachment> {
    const record = await this.fileStorage.put({
      ownerId,
      buffer,
      name,
      mimeType,
      analyzedContent,
      metadata,
    });

    return {
      id: record.id,
      name: record.name,
      mimeType: record.mimeType,
      size: record.size,
      url: await this.fileStorage.getSignedUrl(record.id),
    };
  }

  async getFileForUser(id: string, ownerId: string): Promise<StoredFile | undefined> {
    const record = await this.fileStorage.get(id);
    if (!record || record.ownerId !== ownerId) {
      return undefined;
    }
    return record;
  }

  async deleteFile(id: string, ownerId: string): Promise<boolean> {
    const record = await this.fileStorage.get(id);
    if (!record || record.ownerId !== ownerId) {
      return false;
    }
    await this.fileStorage.delete(id);
    return true;
  }

  // Reaction methods
  async getMessageReactions(messageId: string): Promise<Reaction[]> {
    return Array.from(this.reactions.values()).filter(
      reaction => reaction.messageId === messageId
    );
  }

  async getUserReaction(messageId: string, userId: string): Promise<Reaction | undefined> {
    return Array.from(this.reactions.values()).find(
      reaction => reaction.messageId === messageId && reaction.userId === userId
    );
  }

  async createReaction(insertReaction: InsertReaction): Promise<Reaction> {
    const id = randomUUID();
    const reaction: Reaction = {
      ...insertReaction,
      id,
      createdAt: new Date()
    };
    this.reactions.set(id, reaction);
    return reaction;
  }

  async updateReaction(id: string, type: 'thumbs_up' | 'thumbs_down'): Promise<Reaction | undefined> {
    const reaction = this.reactions.get(id);
    if (!reaction) return undefined;
    
    const updatedReaction: Reaction = {
      ...reaction,
      type
    };
    this.reactions.set(id, updatedReaction);
    return updatedReaction;
  }

  async deleteReaction(id: string): Promise<boolean> {
    return this.reactions.delete(id);
  }

  // Usage tracking methods
  async createUsageMetric(insertMetric: InsertUsageMetric): Promise<UsageMetric> {
    const id = randomUUID();
    const metric: UsageMetric = {
      ...insertMetric,
      id,
      messageId: insertMetric.messageId || null,
      promptTokens: insertMetric.promptTokens || "0",
      completionTokens: insertMetric.completionTokens || "0",
      totalTokens: insertMetric.totalTokens || "0",
      createdAt: new Date()
    };
    this.usageMetrics.set(id, metric);
    return metric;
  }

  async getUserUsageMetrics(userId: string, dateFrom?: Date, dateTo?: Date): Promise<UsageMetric[]> {
    return Array.from(this.usageMetrics.values()).filter(metric => {
      if (metric.userId !== userId) return false;
      if (dateFrom && new Date(metric.createdAt!) < dateFrom) return false;
      if (dateTo && new Date(metric.createdAt!) > dateTo) return false;
      return true;
    }).sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async getChatUsageMetrics(chatId: string): Promise<UsageMetric[]> {
    return Array.from(this.usageMetrics.values()).filter(
      metric => metric.chatId === chatId
    ).sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  // OAuth token methods
  async getOAuthToken(userId: string, provider: string): Promise<OAuthToken | undefined> {
    return Array.from(this.oauthTokens.values()).find(
      token => token.userId === userId && token.provider === provider
    );
  }

  async saveOAuthToken(insertToken: InsertOAuthToken): Promise<OAuthToken> {
    const id = randomUUID();
    const now = new Date();
    const token: OAuthToken = {
      ...insertToken,
      id,
      refreshToken: insertToken.refreshToken || null,
      tokenExpiry: insertToken.tokenExpiry || null,
      scopes: insertToken.scopes || null,
      createdAt: now,
      updatedAt: now
    };
    this.oauthTokens.set(id, token);
    return token;
  }

  async updateOAuthToken(userId: string, provider: string, updates: Partial<InsertOAuthToken>): Promise<OAuthToken | undefined> {
    const existingToken = await this.getOAuthToken(userId, provider);
    if (!existingToken) return undefined;
    
    const updatedToken: OAuthToken = {
      ...existingToken,
      ...updates,
      updatedAt: new Date()
    };
    this.oauthTokens.set(existingToken.id, updatedToken);
    return updatedToken;
  }

  async deleteOAuthToken(userId: string, provider: string): Promise<boolean> {
    const token = await this.getOAuthToken(userId, provider);
    if (!token) return false;
    return this.oauthTokens.delete(token.id);
  }
  
  // User preferences methods
  async getUserPreferences(userId: string): Promise<UserPreferences | undefined> {
    return Array.from(this.userPreferences.values()).find(
      (prefs) => prefs.userId === userId
    );
  }
  
  async saveUserPreferences(userId: string, preferences: InsertUserPreferences): Promise<UserPreferences> {
    let existing = await this.getUserPreferences(userId);

    if (existing) {
      const pinnedTeamIds = Array.isArray((preferences as any).pinnedTeamIds)
        ? this.normalizeIdList((preferences as any).pinnedTeamIds as string[])
        : this.normalizeIdList(existing.pinnedTeamIds ?? []);
      // Update existing preferences
      const updated: UserPreferences = {
        ...existing,
        ...preferences,
        userId,
        memories: preferences.memories as string[] || existing.memories || [],
        pinnedTeamIds,
        updatedAt: new Date()
      };
      this.userPreferences.set(existing.id, updated);
      return updated;
    } else {
      const pinnedTeamIds = Array.isArray((preferences as any).pinnedTeamIds)
        ? this.normalizeIdList((preferences as any).pinnedTeamIds as string[])
        : [];
      // Create new preferences
      const id = randomUUID();
      const newPrefs: UserPreferences = {
        ...preferences,
        id,
        userId,
        personalizationEnabled: preferences.personalizationEnabled || "false",
        customInstructions: preferences.customInstructions || null,
        name: preferences.name || null,
        occupation: preferences.occupation || null,
        bio: preferences.bio || null,
        profileImageUrl: preferences.profileImageUrl || null,
        memories: preferences.memories as string[] || [],
        chatHistoryEnabled: preferences.chatHistoryEnabled || "true",
        autonomousCodeExecution: preferences.autonomousCodeExecution ?? "false",
        pinnedTeamIds,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.userPreferences.set(id, newPrefs);
      return newPrefs;
    }
  }

  async getUserApiKeys(userId: string): Promise<UserApiKey[]> {
    const entries = this.userApiKeys.get(userId);
    if (!entries) return [];
    return Array.from(entries.values());
  }

  async getUserTeamPins(userId: string): Promise<string[]> {
    const prefs = await this.getUserPreferences(userId);
    if (!prefs) {
      return [];
    }

    const normalized = this.normalizeIdList(prefs.pinnedTeamIds ?? []);
    const hasChanges =
      (prefs.pinnedTeamIds ?? []).length !== normalized.length ||
      !(prefs.pinnedTeamIds ?? []).every((value, index) => value === normalized[index]);

    if (hasChanges) {
      const updated: UserPreferences = { ...prefs, pinnedTeamIds: normalized, updatedAt: new Date() };
      this.userPreferences.set(prefs.id, updated);
      return normalized;
    }

    return normalized;
  }

  async getUserApiKey(userId: string, provider: UserApiKey['provider']): Promise<UserApiKey | undefined> {
    return this.userApiKeys.get(userId)?.get(provider);
  }

  async upsertUserApiKey(userId: string, provider: UserApiKey['provider'], apiKey: string): Promise<UserApiKey> {
    const now = new Date();
    const lastFour = apiKey.replace(/\s/g, '').slice(-4);
    const providerMap = this.userApiKeys.get(userId) ?? new Map<string, UserApiKey>();
    const existing = providerMap.get(provider);

    const record: UserApiKey = existing
      ? { ...existing, apiKey, apiKeyLastFour: lastFour, updatedAt: now }
      : {
          id: randomUUID(),
          userId,
          provider,
          apiKey,
          apiKeyLastFour: lastFour,
          createdAt: now,
          updatedAt: now,
        };

    providerMap.set(provider, record);
    this.userApiKeys.set(userId, providerMap);
    return record;
  }

  async deleteUserApiKey(userId: string, provider: UserApiKey['provider']): Promise<boolean> {
    const providerMap = this.userApiKeys.get(userId);
    if (!providerMap) return false;
    const deleted = providerMap.delete(provider);
    if (providerMap.size === 0) {
      this.userApiKeys.delete(userId);
    }
    return deleted;
  }

  async listProCoupons(): Promise<ProCoupon[]> {
    const coupons = Array.from(this.proCouponsMap.values());
    coupons.sort((a, b) => a.code.localeCompare(b.code));
    return coupons.map((coupon) => ({ ...coupon }));
  }

  async createProCoupon(coupon: InsertProCoupon): Promise<ProCoupon> {
    const normalizedCode = this.normalizeCouponCode(coupon.code);
    const existing = Array.from(this.proCouponsMap.values()).find((item) => item.code === normalizedCode);
    if (existing) {
      throw new Error('Coupon code already exists');
    }
    const now = new Date();
    const record: ProCoupon = {
      id: randomUUID(),
      code: normalizedCode,
      label: coupon.label ?? null,
      description: coupon.description ?? null,
      maxRedemptions: coupon.maxRedemptions ?? null,
      redemptionCount: 0,
      expiresAt: this.parseDate(coupon.expiresAt),
      isActive: coupon.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.proCouponsMap.set(record.id, record);
    return { ...record };
  }

  async updateProCoupon(id: string, updates: Partial<InsertProCoupon>): Promise<ProCoupon | undefined> {
    const existing = this.proCouponsMap.get(id);
    if (!existing) {
      return undefined;
    }

    let nextCode = existing.code;
    if (typeof updates.code === 'string' && updates.code.trim()) {
      nextCode = this.normalizeCouponCode(updates.code);
      const duplicate = Array.from(this.proCouponsMap.values()).find((coupon) => coupon.id !== id && coupon.code === nextCode);
      if (duplicate) {
        throw new Error('Coupon code already exists');
      }
    }

    const updated: ProCoupon = {
      ...existing,
      code: nextCode,
      label: updates.label !== undefined ? updates.label ?? null : existing.label,
      description: updates.description !== undefined ? updates.description ?? null : existing.description,
      maxRedemptions: updates.maxRedemptions !== undefined ? (updates.maxRedemptions ?? null) : existing.maxRedemptions,
      expiresAt: updates.expiresAt !== undefined ? this.parseDate(updates.expiresAt) : existing.expiresAt,
      isActive: updates.isActive !== undefined ? Boolean(updates.isActive) : existing.isActive,
      updatedAt: new Date(),
    };
    this.proCouponsMap.set(id, updated);
    return { ...updated };
  }

  async deleteProCoupon(id: string): Promise<boolean> {
    const existed = this.proCouponsMap.delete(id);
    if (existed) {
      for (const [key, redemption] of this.proCouponRedemptionsMap.entries()) {
        if (redemption.couponId === id) {
          this.proCouponRedemptionsMap.delete(key);
          this.proCouponRedemptionsById.delete(redemption.id);
        }
      }
    }
    return existed;
  }

  async getProCouponByCode(code: string): Promise<ProCoupon | undefined> {
    const normalized = this.normalizeCouponCode(code);
    const coupon = Array.from(this.proCouponsMap.values()).find((item) => item.code === normalized);
    return coupon ? { ...coupon } : undefined;
  }

  async getProCouponRedemption(couponId: string, userId: string): Promise<ProCouponRedemption | undefined> {
    const key = `${couponId}:${userId}`;
    const redemption = this.proCouponRedemptionsMap.get(key);
    return redemption ? { ...redemption } : undefined;
  }

  async createProCouponRedemption(couponId: string, userId: string): Promise<ProCouponRedemption> {
    const key = `${couponId}:${userId}`;
    if (this.proCouponRedemptionsMap.has(key)) {
      throw new Error('Coupon already redeemed by this user');
    }
    const record: ProCouponRedemption = {
      id: randomUUID(),
      couponId,
      userId,
      redeemedAt: new Date(),
    };
    this.proCouponRedemptionsMap.set(key, record);
    this.proCouponRedemptionsById.set(record.id, record);
    return { ...record };
  }

  async incrementProCouponRedemption(couponId: string): Promise<ProCoupon | undefined> {
    const coupon = this.proCouponsMap.get(couponId);
    if (!coupon) {
      return undefined;
    }
    if (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions) {
      return undefined;
    }
    const updated: ProCoupon = {
      ...coupon,
      redemptionCount: coupon.redemptionCount + 1,
      updatedAt: new Date(),
    };
    this.proCouponsMap.set(couponId, updated);
    return { ...updated };
  }

  async deleteProCouponRedemption(id: string): Promise<boolean> {
    const redemption = this.proCouponRedemptionsById.get(id);
    if (!redemption) {
      return false;
    }
    this.proCouponRedemptionsById.delete(id);
    const key = `${redemption.couponId}:${redemption.userId}`;
    this.proCouponRedemptionsMap.delete(key);
    return true;
  }

  async getN8nAgents(userId: string): Promise<N8nAgent[]> {
    return Array.from(this.n8nAgentsMap.values())
      .filter((agent) => agent.userId === userId)
      .sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime());
  }

  async createN8nAgent(userId: string, agent: InsertN8nAgent): Promise<N8nAgent> {
    const now = new Date();
    const existing = Array.from(this.n8nAgentsMap.values()).find(
      (record) => record.userId === userId && record.workflowId === agent.workflowId,
    );

    if (existing) {
      const updated: N8nAgent = {
        ...existing,
        name: agent.name,
        description: agent.description ?? existing.description ?? null,
        status: agent.status ?? existing.status,
        webhookUrl:
          typeof agent.webhookUrl === 'undefined'
            ? existing.webhookUrl
            : agent.webhookUrl ?? null,
        metadata:
          typeof agent.metadata === 'undefined'
            ? existing.metadata
            : agent.metadata ?? null,
        updatedAt: now,
      };
      this.n8nAgentsMap.set(updated.id, updated);
      return updated;
    }

    const id = randomUUID();
    const record: N8nAgent = {
      id,
      userId,
      workflowId: agent.workflowId,
      name: agent.name,
      description: agent.description ?? null,
      status: agent.status ?? 'inactive',
      webhookUrl: agent.webhookUrl ?? null,
      metadata: agent.metadata ?? null,
      createdAt: now,
      updatedAt: now,
    };

    this.n8nAgentsMap.set(id, record);
    return record;
  }

  async deleteN8nAgent(userId: string, agentId: string): Promise<boolean> {
    const existing = this.n8nAgentsMap.get(agentId);
    if (!existing || existing.userId !== userId) {
      return false;
    }

    const deleted = this.n8nAgentsMap.delete(agentId);
    if (deleted) {
      this.n8nAgentRunsMap.delete(agentId);
    }
    return deleted;
  }

  async createN8nAgentRun(agentId: string, run: Omit<InsertN8nAgentRun, 'agentId'>): Promise<N8nAgentRun> {
    const now = new Date();
    const record: N8nAgentRun = {
      id: randomUUID(),
      agentId,
      status: run.status ?? 'pending',
      httpStatus: typeof run.httpStatus === 'number' ? run.httpStatus : run.httpStatus ?? null,
      payloadExcerpt: run.payloadExcerpt ?? null,
      errorDetails: run.errorDetails ?? null,
      createdAt: now,
    };

    const runs = this.n8nAgentRunsMap.get(agentId) ?? [];
    runs.push(record);
    this.n8nAgentRunsMap.set(agentId, runs);

    return record;
  }

  async listN8nAgentRuns(agentId: string, limit?: number): Promise<N8nAgentRun[]> {
    const runs = [...(this.n8nAgentRunsMap.get(agentId) ?? [])];
    runs.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

    const normalizedLimit = typeof limit === 'number' && Number.isFinite(limit)
      ? Math.max(0, Math.floor(limit))
      : runs.length;

    return runs.slice(0, normalizedLimit).map(run => ({ ...run }));
  }

  // Knowledge item methods
  async getKnowledgeItems(userId: string): Promise<KnowledgeItem[]> {
    return Array.from(this.knowledgeItems.values())
      .filter(item => item.userId === userId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async getKnowledgeItem(id: string): Promise<KnowledgeItem | undefined> {
    return this.knowledgeItems.get(id);
  }

  async createKnowledgeItem(insertItem: InsertKnowledgeItem): Promise<KnowledgeItem> {
    const id = randomUUID();
    const now = new Date();
    const item: KnowledgeItem = {
      ...insertItem,
      id,
      scopeId: (insertItem as any).scopeId ?? null,
      createdBy: (insertItem as any).createdBy ?? null,
      sourceUrl: insertItem.sourceUrl || null,
      fileName: insertItem.fileName || null,
      fileType: insertItem.fileType || null,
      fileSize: insertItem.fileSize || null,
      metadata: insertItem.metadata || null,
      createdAt: now,
      updatedAt: now
    } as KnowledgeItem;
    this.knowledgeItems.set(id, item);
    return item;
  }

  async deleteKnowledgeItem(id: string): Promise<boolean> {
    return this.knowledgeItems.delete(id);
  }

  // Multi-level knowledge base methods
  async getEffectiveKnowledgeBase(userId: string): Promise<KnowledgeItem[]> {
    const user = await this.getUser(userId);
    if (!user) return [];
    
    const plan = await this.getUserPlan(userId);
    if (!plan) return [];
    
    const items: KnowledgeItem[] = [];
    
    // Get system KB if allowed by plan
    if (plan.allowKbSystem) {
      const systemItems = await this.getSystemKnowledgeItems();
      items.push(...systemItems);
    }
    
    // Get team KB if allowed by plan and user is in a team
    if (plan.allowKbTeam) {
      const teams = await this.getUserTeams(userId);
      for (const team of teams) {
        const teamItems = await this.getTeamKnowledgeItems(team.id);
        items.push(...teamItems);
      }
    }
    
    // Get user's personal KB if allowed by plan
    if (plan.allowKbUser) {
      const userItems = Array.from(this.knowledgeItems.values())
        .filter(item => item.userId === userId && item.scope === 'user');
      items.push(...userItems);
    }
    
    // Sort by creation date (newest first)
    return items.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }
  
  async getSystemKnowledgeItems(): Promise<KnowledgeItem[]> {
    return Array.from(this.knowledgeItems.values())
      .filter(item => item.scope === 'system')
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }
  
  async getTeamKnowledgeItems(teamId: string): Promise<KnowledgeItem[]> {
    return Array.from(this.knowledgeItems.values())
      .filter(item => item.scope === 'team' && item.scopeId === teamId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }
  
  async getUserTeams(userId: string): Promise<Team[]> {
    // Get teams where user is a member
    const teamMembers = Array.from(this.teamMembers.values())
      .filter(member => member.userId === userId && member.status === 'active');
    
    const teams: Team[] = [];
    for (const member of teamMembers) {
      const team = this.teams.get(member.teamId);
      if (team) {
        teams.push(team);
      }
    }
    
    return teams;
  }
  
  async createSystemKnowledgeItem(item: Omit<InsertKnowledgeItem, 'userId' | 'scope' | 'scopeId'>, createdBy: string): Promise<KnowledgeItem> {
    const id = randomUUID();
    const now = new Date();
    const knowledgeItem: KnowledgeItem = {
      ...item,
      id,
      userId: createdBy, // Use createdBy as userId for system items
      scope: 'system',
      scopeId: null,
      createdBy,
      sourceUrl: item.sourceUrl || null,
      fileName: item.fileName || null,
      fileType: item.fileType || null,
      fileSize: item.fileSize || null,
      metadata: item.metadata || null,
      createdAt: now,
      updatedAt: now
    };
    this.knowledgeItems.set(id, knowledgeItem);
    return knowledgeItem;
  }
  
  async createTeamKnowledgeItem(teamId: string, item: Omit<InsertKnowledgeItem, 'userId' | 'scope' | 'scopeId'>, createdBy: string): Promise<KnowledgeItem> {
    const id = randomUUID();
    const now = new Date();
    const knowledgeItem: KnowledgeItem = {
      ...item,
      id,
      userId: createdBy, // Use createdBy as userId for team items
      scope: 'team',
      scopeId: teamId,
      createdBy,
      sourceUrl: item.sourceUrl || null,
      fileName: item.fileName || null,
      fileType: item.fileType || null,
      fileSize: item.fileSize || null,
      metadata: item.metadata || null,
      createdAt: now,
      updatedAt: now
    };
    this.knowledgeItems.set(id, knowledgeItem);
    return knowledgeItem;
  }
  
  async updateKnowledgeItem(id: string, updates: Partial<KnowledgeItem>): Promise<KnowledgeItem | undefined> {
    const item = this.knowledgeItems.get(id);
    if (!item) return undefined;
    
    const updated: KnowledgeItem = {
      ...item,
      ...updates,
      updatedAt: new Date()
    };
    this.knowledgeItems.set(id, updated);
    return updated;
  }

  // Project methods
  async getProject(id: string): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async getProjectByShareToken(shareToken: string): Promise<Project | undefined> {
    return Array.from(this.projects.values()).find(
      project => project.shareToken === shareToken
    );
  }

  async getUserProjects(userId: string): Promise<Project[]> {
    return Array.from(this.projects.values())
      .filter(project => project.userId === userId)
      .sort((a, b) => new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime());
  }

  async createProject(userId: string, insertProject: InsertProject): Promise<Project> {
    const id = randomUUID();
    const now = new Date();
    const project: Project = {
      ...insertProject,
      id,
      userId,
      description: insertProject.description || null,
      customInstructions: insertProject.customInstructions || null,
      includeGlobalKnowledge: insertProject.includeGlobalKnowledge || "false",
      includeUserMemories: insertProject.includeUserMemories || "false",
      shareToken: null,
      isPublic: insertProject.isPublic || "false",
      createdAt: now,
      updatedAt: now
    };
    this.projects.set(id, project);
    return project;
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project | undefined> {
    const existingProject = this.projects.get(id);
    if (!existingProject) return undefined;
    
    const updatedProject: Project = {
      ...existingProject,
      ...updates,
      updatedAt: new Date()
    };
    this.projects.set(id, updatedProject);
    return updatedProject;
  }

  async deleteProject(id: string): Promise<boolean> {
    const project = this.projects.get(id);
    if (!project) return false;
    
    Array.from(this.projectKnowledgeMap.values())
      .filter(item => item.projectId === id)
      .forEach(item => this.projectKnowledgeMap.delete(item.id));
    
    Array.from(this.projectFilesMap.values())
      .filter(file => file.projectId === id)
      .forEach(file => this.projectFilesMap.delete(file.id));
    
    return this.projects.delete(id);
  }

  async generateShareToken(projectId: string): Promise<string | undefined> {
    const project = this.projects.get(projectId);
    if (!project) return undefined;
    
    const shareToken = nanoid(16);
    const updatedProject: Project = {
      ...project,
      shareToken,
      isPublic: "true",
      updatedAt: new Date()
    };
    this.projects.set(projectId, updatedProject);
    return shareToken;
  }

  // Project knowledge methods
  async getProjectKnowledge(projectId: string): Promise<ProjectKnowledge[]> {
    return Array.from(this.projectKnowledgeMap.values())
      .filter(item => item.projectId === projectId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createProjectKnowledge(insertItem: InsertProjectKnowledge): Promise<ProjectKnowledge> {
    const id = randomUUID();
    const now = new Date();
    const item: ProjectKnowledge = {
      ...insertItem,
      id,
      sourceUrl: insertItem.sourceUrl || null,
      fileName: insertItem.fileName || null,
      fileType: insertItem.fileType || null,
      fileSize: insertItem.fileSize || null,
      metadata: insertItem.metadata || null,
      createdAt: now,
      updatedAt: now
    };
    this.projectKnowledgeMap.set(id, item);
    return item;
  }

  async deleteProjectKnowledge(id: string): Promise<boolean> {
    return this.projectKnowledgeMap.delete(id);
  }

  // Project file methods
  async getProjectFiles(projectId: string): Promise<ProjectFile[]> {
    return Array.from(this.projectFilesMap.values())
      .filter(file => file.projectId === projectId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createProjectFile(insertFile: InsertProjectFile): Promise<ProjectFile> {
    const id = randomUUID();
    const file: ProjectFile = {
      ...insertFile,
      id,
      createdAt: new Date()
    };
    this.projectFilesMap.set(id, file);
    return file;
  }

  async deleteProjectFile(id: string): Promise<boolean> {
    return this.projectFilesMap.delete(id);
  }

  // Chat migration methods
  async moveChatToProject(chatId: string, projectId: string | null): Promise<Chat | undefined> {
    const chat = this.chats.get(chatId);
    if (!chat) return undefined;

    const updatedChat: Chat = {
      ...chat,
      projectId,
      updatedAt: new Date()
    };
    this.chats.set(chatId, updatedChat);
    return updatedChat;
  }

  async getPlatformSettings(): Promise<PlatformSettings> {
    const parsed = parsePlatformSettingsData(this.platformSettings.data);
    return {
      ...this.platformSettings,
      data: parsed,
    };
  }

  async upsertPlatformSettings(data: PlatformSettingsData): Promise<PlatformSettings> {
    const now = new Date();
    const payload = preparePlatformSettingsPayload(data);
    this.platformSettings = {
      ...this.platformSettings,
      data: payload,
      updatedAt: now,
    };

    return this.getPlatformSettings();
  }

  async listTemplates(): Promise<Template[]> {
    return Array.from(this.templatesMap.values()).sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }

  async getTemplate(id: string): Promise<Template | undefined> {
    return this.templatesMap.get(id);
  }

  async createTemplate(insertTemplate: InsertTemplate): Promise<Template> {
    const id = randomUUID();
    const now = new Date();
    const template: Template = {
      ...insertTemplate,
      id,
      description: insertTemplate.description ?? null,
      availableForFree: insertTemplate.availableForFree ?? false,
      availableForPro: insertTemplate.availableForPro ?? true,
      isActive: insertTemplate.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.templatesMap.set(id, template);
    return template;
  }

  async updateTemplate(id: string, updates: Partial<InsertTemplate>): Promise<Template | undefined> {
    const existing = this.templatesMap.get(id);
    if (!existing) {
      return undefined;
    }

    const next: Template = {
      ...existing,
      ...updates,
      description: updates.description ?? existing.description,
      availableForFree: updates.availableForFree ?? existing.availableForFree,
      availableForPro: updates.availableForPro ?? existing.availableForPro,
      isActive: updates.isActive ?? existing.isActive,
      updatedAt: new Date(),
    };
    this.templatesMap.set(id, next);
    return next;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    return this.templatesMap.delete(id);
  }

  async getAvailableTemplates(userId: string): Promise<Template[]> {
    // Get user's plan
    const user = this.users.get(userId);
    if (!user) {
      return [];
    }

    // Get user's plan details
    const plan = await this.resolveUserPlan(user);
    if (!plan) {
      return [];
    }

    // Check if templates are allowed for this plan
    if (!plan.allowTemplates) {
      return [];
    }

    // Get all active templates
    const allTemplates = await this.listTemplates();
    const activeTemplates = allTemplates.filter(t => t.isActive);

    // If plan has specific templates allowed, filter by that list
    if (plan.templatesAllowed && Array.isArray(plan.templatesAllowed) && plan.templatesAllowed.length > 0) {
      return activeTemplates.filter(t => plan.templatesAllowed?.includes(t.id));
    }

    // Otherwise return all active templates
    return activeTemplates;
  }

  async listOutputTemplates(): Promise<OutputTemplate[]> {
    return Array.from(this.outputTemplatesMap.values()).sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }

  async getOutputTemplate(id: string): Promise<OutputTemplate | undefined> {
    return this.outputTemplatesMap.get(id);
  }

  async createOutputTemplate(insertTemplate: InsertOutputTemplate): Promise<OutputTemplate> {
    const now = new Date();
    const record: OutputTemplate = {
      ...insertTemplate,
      id: randomUUID(),
      description: insertTemplate.description ?? null,
      instructions: insertTemplate.instructions ?? null,
      requiredSections: Array.isArray(insertTemplate.requiredSections) ? insertTemplate.requiredSections : [],
      isActive: insertTemplate.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };

    this.outputTemplatesMap.set(record.id, record);
    return record;
  }

  async updateOutputTemplate(id: string, updates: Partial<InsertOutputTemplate>): Promise<OutputTemplate | undefined> {
    const existing = this.outputTemplatesMap.get(id);
    if (!existing) {
      return undefined;
    }

    const next: OutputTemplate = {
      ...existing,
      ...updates,
      description: updates.description !== undefined ? updates.description ?? null : existing.description,
      instructions: updates.instructions !== undefined ? updates.instructions ?? null : existing.instructions,
      requiredSections: updates.requiredSections
        ? Array.isArray(updates.requiredSections)
          ? updates.requiredSections
          : existing.requiredSections
        : existing.requiredSections,
      isActive: updates.isActive !== undefined ? Boolean(updates.isActive) : existing.isActive,
      updatedAt: new Date(),
    };

    this.outputTemplatesMap.set(id, next);
    return next;
  }

  async deleteOutputTemplate(id: string): Promise<boolean> {
    return this.outputTemplatesMap.delete(id);
  }

  async getAvailableOutputTemplates(userId: string): Promise<OutputTemplate[]> {
    // Get user's plan
    const user = this.users.get(userId);
    if (!user) {
      return [];
    }

    // Get user's plan details
    const plan = await this.resolveUserPlan(user);
    if (!plan) {
      return [];
    }

    // Check if templates are allowed for this plan
    if (!plan.allowTemplates) {
      return [];
    }

    // Get all active output templates
    const allTemplates = await this.listOutputTemplates();
    const activeTemplates = allTemplates.filter(t => t.isActive);

    // For now, return all active output templates if templates are allowed
    // (output templates don't have a specific allowed list in the plan)
    return activeTemplates;
  }

  async listToolPolicies(): Promise<ToolPolicy[]> {
    const policies = Array.from(this.toolPoliciesMap.values()).map(policy => this.cloneToolPolicy(policy));
    return policies.sort((a, b) => {
      const providerCompare = a.provider.localeCompare(b.provider);
      if (providerCompare !== 0) {
        return providerCompare;
      }
      return a.toolName.localeCompare(b.toolName);
    });
  }

  async listToolPoliciesByProvider(provider: ToolPolicyProvider): Promise<ToolPolicy[]> {
    const normalizedProvider = provider.trim().toLowerCase();
    const policies = Array.from(this.toolPoliciesMap.values())
      .filter(policy => policy.provider.trim().toLowerCase() === normalizedProvider)
      .map(policy => this.cloneToolPolicy(policy));
    return policies.sort((a, b) => a.toolName.localeCompare(b.toolName));
  }

  async getToolPolicy(id: string): Promise<ToolPolicy | undefined> {
    const policy = this.toolPoliciesMap.get(id);
    return policy ? this.cloneToolPolicy(policy) : undefined;
  }

  async createToolPolicy(policy: InsertToolPolicy): Promise<ToolPolicy> {
    const now = new Date();
    const provider = policy.provider.trim();
    const toolName = policy.toolName.trim();
    const key = this.getToolPolicyKey(provider, toolName);

    if (this.toolPolicyKeyIndex.has(key)) {
      throw new Error('TOOL_POLICY_CONFLICT');
    }

    const record: ToolPolicy = {
      id: randomUUID(),
      provider,
      toolName,
      isEnabled: policy.isEnabled ?? true,
      safetyNote: policy.safetyNote?.trim() ? policy.safetyNote.trim() : null,
      createdAt: now,
      updatedAt: now,
    };

    this.toolPoliciesMap.set(record.id, record);
    this.toolPolicyKeyIndex.set(key, record.id);

    return this.cloneToolPolicy(record);
  }

  async updateToolPolicy(id: string, updates: UpdateToolPolicy): Promise<ToolPolicy | undefined> {
    const existing = this.toolPoliciesMap.get(id);
    if (!existing) {
      return undefined;
    }

    const provider = (updates.provider ?? existing.provider).trim();
    const toolName = (updates.toolName ?? existing.toolName).trim();
    const key = this.getToolPolicyKey(provider, toolName);
    const currentKey = this.getToolPolicyKey(existing.provider, existing.toolName);

    if (key !== currentKey && this.toolPolicyKeyIndex.has(key)) {
      throw new Error('TOOL_POLICY_CONFLICT');
    }

    const updated: ToolPolicy = {
      ...existing,
      provider,
      toolName,
      isEnabled: typeof updates.isEnabled === 'boolean' ? updates.isEnabled : existing.isEnabled,
      safetyNote: typeof updates.safetyNote === 'string'
        ? (updates.safetyNote.trim() ? updates.safetyNote.trim() : null)
        : updates.safetyNote === null
          ? null
          : existing.safetyNote,
      updatedAt: new Date(),
    };

    this.toolPoliciesMap.set(id, updated);
    if (key !== currentKey) {
      this.toolPolicyKeyIndex.delete(currentKey);
      this.toolPolicyKeyIndex.set(key, id);
    }

    return this.cloneToolPolicy(updated);
  }

  async deleteToolPolicy(id: string): Promise<boolean> {
    const existing = this.toolPoliciesMap.get(id);
    if (!existing) {
      return false;
    }
    const key = this.getToolPolicyKey(existing.provider, existing.toolName);
    this.toolPoliciesMap.delete(id);
    this.toolPolicyKeyIndex.delete(key);
    return true;
  }

  async createAdminAuditLog(entry: InsertAdminAuditLog): Promise<AdminAuditLog> {
    const id = randomUUID();
    const createdAt = new Date();
    const record: AdminAuditLog = {
      id,
      actorUserId: entry.actorUserId ?? null,
      targetUserId: entry.targetUserId,
      action: entry.action,
      metadata: entry.metadata ?? {},
      createdAt,
    };
    this.adminAuditLogEntries.set(id, record);
    return { ...record };
  }

  async listAdminAuditLogsForUser(userId: string, limit?: number): Promise<AdminAuditLog[]> {
    const records = Array.from(this.adminAuditLogEntries.values())
      .filter((entry) => entry.targetUserId === userId)
      .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
    return typeof limit === 'number' ? records.slice(0, Math.max(0, limit)) : records;
  }

  async getAdminAuditLogs(filters?: {
    targetUserId?: string;
    actorUserId?: string;
    actions?: string[];
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<AdminAuditLog[]> {
    let records = Array.from(this.adminAuditLogEntries.values());

    if (filters) {
      if (filters.targetUserId) {
        records = records.filter(entry => entry.targetUserId === filters.targetUserId);
      }
      if (filters.actorUserId) {
        records = records.filter(entry => entry.actorUserId === filters.actorUserId);
      }
      if (filters.actions && filters.actions.length > 0) {
        const actionsSet = new Set(filters.actions);
        records = records.filter(entry => actionsSet.has(entry.action));
      }
    if (filters.startDate) {
      const start = filters.startDate;
      records = records.filter(entry => entry.createdAt && entry.createdAt >= start);
    }
    if (filters.endDate) {
      const end = filters.endDate;
      records = records.filter(entry => entry.createdAt && entry.createdAt <= end);
    }
    }

    // Sort by creation date, newest first
    records.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());

    if (filters?.limit && filters.limit > 0) {
      records = records.slice(0, filters.limit);
    }

    return records;
  }

  // Password reset token methods
  async createPasswordResetToken(insertToken: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const id = randomUUID();
    const token: PasswordResetToken = {
      ...insertToken,
      id,
      createdAt: new Date(),
      used: insertToken.used ?? "false"
    };
    this.passwordResetTokensMap.set(insertToken.token, token);
    return token;
  }
  
  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    return this.passwordResetTokensMap.get(token);
  }
  
  async markTokenAsUsed(token: string): Promise<boolean> {
    const resetToken = this.passwordResetTokensMap.get(token);
    if (!resetToken) return false;
    
    const updatedToken: PasswordResetToken = {
      ...resetToken,
      used: "true"
    };
    this.passwordResetTokensMap.set(token, updatedToken);
    return true;
  }
  
  async deleteExpiredTokens(): Promise<number> {
    const now = new Date();
    const tokensArray = Array.from(this.passwordResetTokensMap.values());
    const expiredTokens = tokensArray.filter(t => new Date(t.expiresAt) < now);
    
    expiredTokens.forEach(t => this.passwordResetTokensMap.delete(t.token));
    return expiredTokens.length;
  }

  // Analytics event methods (stubs for in-memory storage)
  async createAnalyticsEvent(event: InsertAnalyticsEvent): Promise<AnalyticsEvent> {
    const id = randomUUID();
    const created: AnalyticsEvent = {
      id,
      requestId: event.requestId,
      userId: event.userId,
      chatId: event.chatId ?? null,
      projectId: event.projectId ?? null,
      expertId: (event as any).expertId ?? null,
      templateId: (event as any).templateId ?? null,
      provider: event.provider,
      model: event.model,
      status: event.status,
      errorCode: event.errorCode ?? null,
      errorMessage: event.errorMessage ?? null,
      inputTokens: event.inputTokens ?? 0,
      outputTokens: event.outputTokens ?? 0,
      totalTokens: event.totalTokens ?? 0,
      tokensEstimated: (event as any).tokensEstimated ?? false,
      latencyMs: event.latencyMs ?? 0,
      costUsd: event.costUsd ?? '0',
      createdAt: new Date(),
    };
    return created;
  }

  async getAnalyticsEvents(): Promise<AnalyticsEvent[]> {
    return [];
  }

  // Provider pricing methods (stubs for in-memory storage)
  async listProviderPricing(): Promise<ProviderPricing[]> {
    return [];
  }

  async getProviderPricing(): Promise<ProviderPricing | undefined> {
    return undefined;
  }

  async upsertProviderPricing(pricing: InsertProviderPricing): Promise<ProviderPricing> {
    const id = randomUUID();
    const result: ProviderPricing = {
      id,
      provider: pricing.provider,
      model: pricing.model,
      inputUsdPer1k: pricing.inputUsdPer1k,
      outputUsdPer1k: pricing.outputUsdPer1k,
      enabled: pricing.enabled ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return result;
  }

  // Model methods
  async listModels(): Promise<Model[]> {
    return Array.from(this.modelsMap.values())
      .sort((a, b) => a.provider.localeCompare(b.provider) || a.displayName.localeCompare(b.displayName));
  }

  async getModel(id: string): Promise<Model | undefined> {
    return this.modelsMap.get(id);
  }

  async createModel(model: InsertModel): Promise<Model> {
    const now = new Date();
    const newModel: Model = {
      ...model,
      id: randomUUID(),
      description: model.description ?? null,
      maxOutputTokens: model.maxOutputTokens ?? null,
      contextWindow: model.contextWindow ?? 8192,
      isActive: model.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.modelsMap.set(newModel.id, newModel);
    return newModel;
  }

  async updateModel(id: string, updates: UpdateModel): Promise<Model | undefined> {
    const model = this.modelsMap.get(id);
    if (!model) {
      return undefined;
    }
    const updatedModel: Model = {
      ...model,
      ...updates,
      id: model.id,
      createdAt: model.createdAt,
      updatedAt: new Date(),
    };
    this.modelsMap.set(id, updatedModel);
    return updatedModel;
  }

  async deleteModel(id: string): Promise<boolean> {
    return this.modelsMap.delete(id);
  }

  async getModelByModelId(modelId: string): Promise<Model | undefined> {
    for (const model of this.modelsMap.values()) {
      if (model.modelId === modelId) return model;
    }
    return undefined;
  }

  async getAvailableModels(userId: string): Promise<Model[]> {
    // Get user
    const user = this.users.get(userId);
    if (!user) {
      return [];
    }

    // Get user's plan
    const plan = await this.resolveUserPlan(user);
    if (!plan || !plan.allowModels) {
      return [];
    }

    // Get all active models
    const allModels = Array.from(this.modelsMap.values()).filter(m => m.isActive);
    
    // If modelsAllowed is empty or not defined, return all active models
    const modelsAllowed = plan.modelsAllowed as string[] | undefined;
    if (!modelsAllowed || modelsAllowed.length === 0) {
      return allModels;
    }

    // Filter models based on plan's allowed models (by modelId)
    return allModels.filter(m => modelsAllowed.includes(m.modelId));
  }
}

export class DatabaseStorage implements IStorage {
  private readonly fileStorage: FileStorageAdapter;

  constructor(fileStorage: FileStorageAdapter = createFileStorage()) {
    this.fileStorage = fileStorage;
  }

  private normalizePlanSlug(slug?: string | null): string | null {
    if (!slug || typeof slug !== 'string') {
      return null;
    }
    const normalized = slug.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
  }

  private async normalizeUserPlanAssignment(
    input: { plan?: string | null; planId?: string | null },
  ): Promise<{ plan?: string; planId?: string | null }> {
    const hasPlanField = Object.prototype.hasOwnProperty.call(input, 'plan');
    const hasPlanIdField = Object.prototype.hasOwnProperty.call(input, 'planId');

    if (!hasPlanField && !hasPlanIdField) {
      return {};
    }

    let planRecord: Plan | undefined;
    const planIdValue = hasPlanIdField ? input.planId ?? null : undefined;

    if (planIdValue) {
      planRecord = await this.getPlan(planIdValue);
    }

    let normalizedSlug: string | null = null;

    if (!planRecord && hasPlanField) {
      normalizedSlug = this.normalizePlanSlug(input.plan);
      if (normalizedSlug) {
        planRecord = await this.getPlanBySlug(normalizedSlug);
      }
    }

    if (planRecord) {
      return {
        planId: planRecord.id,
        plan: planRecord.slug ?? this.normalizePlanSlug(planRecord.name) ?? planRecord.id,
      };
    }

    if (hasPlanField) {
      normalizedSlug = normalizedSlug ?? this.normalizePlanSlug(input.plan);
      return {
        plan: normalizedSlug ?? 'free',
        ...(hasPlanIdField ? { planId: input.planId ?? null } : {}),
      };
    }

    return {
      planId: null,
      plan: 'free',
    };
  }

  private normalizeOutputTemplate(row: OutputTemplate): OutputTemplate {
    const sections = Array.isArray(row.requiredSections) ? row.requiredSections : [];
    return {
      ...row,
      description: row.description ?? null,
      instructions: row.instructions ?? null,
      requiredSections: sections,
    };
  }

  private normalizeCouponCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private parseDate(value: Date | string | null | undefined): Date | null {
    if (!value) {
      return null;
    }
    if (value instanceof Date) {
      return value;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  }

  private normalizeIdList(ids?: string[] | null): string[] {
    if (!ids) {
      return [];
    }
    const unique = new Set<string>();
    const normalized: string[] = [];
    for (const rawId of ids) {
      if (typeof rawId !== 'string') continue;
      const trimmed = rawId.trim();
      if (!trimmed) continue;
      if (!unique.has(trimmed)) {
        unique.add(trimmed);
        normalized.push(trimmed);
      }
    }
    return normalized;
  }

  // Plan methods
  async createPlan(plan: InsertPlan): Promise<Plan> {
    const normalizedSlug = this.normalizePlanSlug(plan.slug) ?? this.normalizePlanSlug(plan.name);
    const tier = plan.tier?.trim().toLowerCase() ?? "custom";
    const payload: InsertPlan = {
      ...plan,
      slug: normalizedSlug ?? plan.slug,
      tier,
    };

    const [result] = await db.insert(plans).values(payload as any).returning();
    return result;
  }

  async updatePlan(id: string, updates: UpdatePlan): Promise<Plan | undefined> {
    const updatePayload: Partial<InsertPlan> & { updatedAt: Date } = {
      ...updates,
      updatedAt: new Date(),
    };

    if (updates.slug !== undefined) {
      const normalizedSlug = this.normalizePlanSlug(updates.slug);
      if (normalizedSlug) {
        updatePayload.slug = normalizedSlug;
      } else {
        const existing = await this.getPlan(id);
        if (!existing) {
          return undefined;
        }
        updatePayload.slug = existing.slug;
      }
    }

    if (updates.tier !== undefined) {
      updatePayload.tier = updates.tier?.trim().toLowerCase() ?? "custom";
    }

    const [result] = await db
      .update(plans)
      .set(updatePayload as any)
      .where(eq(plans.id, id))
      .returning();
    return result;
  }

  async deletePlan(id: string): Promise<boolean> {
    // Check if any users are using this plan
    const [userCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.planId, id));
    
    if (userCount && userCount.count > 0) {
      return false; // Can't delete a plan that's in use
    }
    
    const result = await db.delete(plans).where(eq(plans.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getPlan(id: string): Promise<Plan | undefined> {
    const [result] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
    return result;
  }

  async getPlanBySlug(slug: string): Promise<Plan | undefined> {
    const normalized = this.normalizePlanSlug(slug);
    if (!normalized) {
      return undefined;
    }

    const [bySlug] = await db.select().from(plans).where(eq(plans.slug, normalized)).limit(1);
    if (bySlug) {
      return bySlug;
    }

    const [byName] = await db
      .select()
      .from(plans)
      .where(sql`lower(${plans.name}) = ${normalized}`)
      .limit(1);
    return byName;
  }

  async listPlans(): Promise<Plan[]> {
    return await db.select().from(plans).orderBy(asc(plans.name));
  }

  async getUserPlan(userId: string): Promise<Plan | undefined> {
    const user = await this.getUser(userId);
    if (!user) return undefined;

    return this.resolveUserPlan(user);
  }

  async resolveUserPlan(user: User): Promise<Plan | undefined> {
    if (user.planId) {
      const plan = await this.getPlan(user.planId);
      if (plan) {
        return plan;
      }
    }

    const normalizedLegacy = this.normalizePlanSlug(user.plan);
    if (normalizedLegacy) {
      const plan = await this.getPlanBySlug(normalizedLegacy);
      if (plan) {
        return plan;
      }
    }

    return undefined;
  }

  async getEffectiveCapabilities(userId: string): Promise<EffectiveCapabilities | undefined> {
    const user = await this.getUser(userId);
    if (!user) return undefined;

    // Get user's plan details
    const plan = await this.getUserPlan(userId);
    
    // Default to free plan if no plan found
    const effectivePlan = plan || {
      id: 'free',
      name: 'Free',
      slug: 'free',
      tier: 'free',
      description: 'Fallback free plan',
      allowExperts: false,
      allowTemplates: false,
      allowModels: true,
      allowKbSystem: false,
      allowKbOrg: false,
      allowKbTeam: false,
      allowKbUser: true,
      allowMemory: true,
      allowAgents: false,
      allowApiAccess: false,
      showExpertsUpsell: true,
      showTemplatesUpsell: true,
      showApiUpsell: true,
      dailyMessageLimit: 10,
      maxFileSizeMb: 10,
      storageQuotaGb: 1,
      modelsAllowed: [],
      expertsAllowed: [],
      templatesAllowed: [],
      isProTier: false,
      isActive: true,
      priceMonthlyUsd: 0,
      priceAnnualUsd: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Plan;

    const planSlug = this.normalizePlanSlug(effectivePlan.slug ?? effectivePlan.name) ?? 'free';
    const isEnterprisePlan =
      planSlug.includes('enterprise') ||
      effectivePlan.allowAgents ||
      effectivePlan.allowKbOrg ||
      effectivePlan.allowKbTeam;
    const computedProTier =
      isEnterprisePlan ||
      planSlug.includes('pro') ||
      effectivePlan.allowExperts ||
      effectivePlan.allowTemplates ||
      effectivePlan.allowApiAccess ||
      (effectivePlan.priceMonthlyUsd ?? 0) > 0 ||
      (effectivePlan.priceAnnualUsd ?? 0) > 0;
    const isProTierPlan = effectivePlan.isProTier ?? computedProTier;
    const tier = isEnterprisePlan ? 'enterprise' : isProTierPlan ? 'pro' : 'free';

    // Get user's team memberships for enterprise features
    const userTeams = await this.getUserTeams(userId);
    const isEnterprise = isEnterprisePlan || userTeams.length > 0;

    // Build capabilities object
    const capabilities: EffectiveCapabilities = {
      plan: {
        id: effectivePlan.id ?? planSlug,
        name: effectivePlan.name ?? planSlug,
        slug: planSlug,
        tier,
        isProTier: isProTierPlan,
      },
      limits: {
        daily_message_limit: effectivePlan.dailyMessageLimit || null,
        max_file_size_mb: effectivePlan.maxFileSizeMb || 10,
        storage_quota_gb: effectivePlan.storageQuotaGb || 1,
      },
      features: {
        experts: {
          allowed: effectivePlan.allowExperts || false,
          upsell: effectivePlan.showExpertsUpsell || false,
        },
        templates: {
          allowed: effectivePlan.allowTemplates || false,
          upsell: effectivePlan.showTemplatesUpsell || false,
        },
        models: {
          allowed: effectivePlan.allowModels !== false, // Default to true
        },
        kb: {
          system: effectivePlan.allowKbSystem || false,
          team: effectivePlan.allowKbTeam || false,
          user: effectivePlan.allowKbUser !== false, // Default to true
        },
        memory: effectivePlan.allowMemory !== false, // Default to true
        agents: effectivePlan.allowAgents || false,
        api_access: {
          allowed: effectivePlan.allowApiAccess || false,
          upsell: effectivePlan.showApiUpsell || false,
        },
      },
      allowlists: {
        experts: effectivePlan.expertsAllowed || [],
        templates: effectivePlan.templatesAllowed || [],
        models: effectivePlan.modelsAllowed || [],
      },
      teams: {
        enabled: isEnterprise,
        maxTeamsPerOrg: isEnterprise ? 10 : 0,
        maxMembersPerTeam: isEnterprise ? 50 : 0,
      },
    };

    return capabilities;
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async listUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async hasAdminUser(): Promise<boolean> {
    const [row] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(users)
      .where(inArray(users.role, ['admin', 'super_admin']))
      .limit(1);

    const count = row?.count ?? 0;
    return Number(count) > 0;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const planAssignment = await this.normalizeUserPlanAssignment(insertUser);
    const payload: InsertUser = {
      ...insertUser,
      plan: planAssignment.plan ?? this.normalizePlanSlug(insertUser.plan) ?? 'free',
      planId: planAssignment.planId ?? null,
      role: insertUser.role ?? 'user',
      status: insertUser.status ?? 'active',
    };

    const [user] = await db.insert(users).values(payload).returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const planUpdates = await this.normalizeUserPlanAssignment(updates);
    const hasPlanField = Object.prototype.hasOwnProperty.call(updates, 'plan');
    const hasPlanIdField = Object.prototype.hasOwnProperty.call(updates, 'planId');

    const updateSet: Partial<User> = {
      ...updates,
      updatedAt: new Date(),
    };

    if (planUpdates.plan !== undefined || hasPlanField) {
      updateSet.plan = planUpdates.plan ?? this.normalizePlanSlug(updates.plan ?? null) ?? 'free';
    }

    if (planUpdates.planId !== undefined || hasPlanIdField) {
      updateSet.planId = planUpdates.planId ?? null;
    }

    const [user] = await db.update(users)
      .set(updateSet)
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async updateUserStatus(id: string, status: UserStatus): Promise<User | undefined> {
    return this.updateUser(id, { status });
  }
  
  async upsertUser(userData: UpsertUser): Promise<User> {
    const planAssignment = await this.normalizeUserPlanAssignment(userData);
    const hasPlanField = Object.prototype.hasOwnProperty.call(userData, 'plan');
    const hasPlanIdField = Object.prototype.hasOwnProperty.call(userData, 'planId');

    const insertPayload: UpsertUser = {
      ...userData,
      plan: planAssignment.plan ?? this.normalizePlanSlug(userData.plan) ?? 'free',
      planId: planAssignment.planId ?? null,
      role: userData.role ?? 'user',
      status: userData.status ?? 'active',
    };

    const updatePayload: Partial<UpsertUser> & { updatedAt: Date } = {
      ...userData,
      role: userData.role ?? 'user',
      status: userData.status ?? 'active',
      updatedAt: new Date(),
    };

    if (planAssignment.plan !== undefined || hasPlanField) {
      updatePayload.plan = planAssignment.plan ?? this.normalizePlanSlug(userData.plan ?? null) ?? 'free';
    }

    if (planAssignment.planId !== undefined || hasPlanIdField) {
      updatePayload.planId = planAssignment.planId ?? null;
    }

    const [user] = await db
      .insert(users)
      .values(insertPayload)
      .onConflictDoUpdate({
        target: users.id,
        set: updatePayload,
      })
      .returning();
    return user;
  }

  // Chat methods
  async getChat(id: string): Promise<Chat | undefined> {
    const [chat] = await db.select().from(chats).where(eq(chats.id, id));
    return chat || undefined;
  }

  async getUserChats(userId: string, includeArchived = false, projectId?: string | null): Promise<Chat[]> {
    const conditions = [eq(chats.userId, userId)];
    
    // Add status filter
    if (includeArchived) {
      conditions.push(ne(chats.status, 'deleted'));
    } else {
      conditions.push(eq(chats.status, 'active'));
    }
    
    // Add projectId filter
    // If projectId is undefined, don't filter by project (return all)
    // If projectId is null, return only global chats (chat.projectId IS NULL)
    // If projectId is a string, return only chats for that specific project
    if (projectId !== undefined) {
      if (projectId === null) {
        conditions.push(sql`${chats.projectId} IS NULL`);
      } else {
        conditions.push(eq(chats.projectId, projectId));
      }
    }
    
    return await db.select().from(chats)
      .where(and(...conditions))
      .orderBy(desc(chats.updatedAt));
  }

  async getArchivedChats(userId: string): Promise<Chat[]> {
    return await db.select().from(chats)
      .where(and(eq(chats.userId, userId), eq(chats.status, 'archived')))
      .orderBy(desc(chats.updatedAt));
  }

  async createChat(insertChat: InsertChat & { userId: string }): Promise<Chat> {
    const [chat] = await db.insert(chats).values({
      ...insertChat,
      userId: insertChat.userId,
      projectId: insertChat.projectId || null,
      status: 'active'
    }).returning();
    return chat;
  }

  async updateChat(id: string, updates: Partial<InsertChat>): Promise<Chat | undefined> {
    const [chat] = await db.update(chats)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(chats.id, id))
      .returning();
    return chat || undefined;
  }

  async archiveChat(id: string): Promise<boolean> {
    const result = await db.update(chats)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(eq(chats.id, id));
    return (result.rowCount || 0) > 0;
  }

  async deleteChat(id: string): Promise<boolean> {
    const result = await db.update(chats)
      .set({ status: 'deleted', updatedAt: new Date() })
      .where(eq(chats.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Message methods
  async getMessage(id: string): Promise<Message | undefined> {
    const [message] = await db.select().from(messages).where(eq(messages.id, id));
    return message || undefined;
  }

  async getChatMessages(chatId: string): Promise<Message[]> {
    return await db.select().from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(messages.createdAt);
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const [message] = await db.insert(messages).values(insertMessage).returning();
    return message;
  }
  
  async getMessagesSince(userId: string, since: Date): Promise<Message[]> {
    // Get all messages from user's chats since the given date
    const userChats = await this.getUserChats(userId, true);
    const chatIds = userChats.map(chat => chat.id);
    
    if (chatIds.length === 0) return [];
    
    return await db.select().from(messages)
      .where(and(
        inArray(messages.chatId, chatIds),
        gte(messages.createdAt, since),
        eq(messages.role, 'user')
      ))
      .orderBy(messages.createdAt);
  }

  // Reaction methods
  async getMessageReactions(messageId: string): Promise<Reaction[]> {
    return await db.select().from(reactions).where(eq(reactions.messageId, messageId));
  }

  async getUserReaction(messageId: string, userId: string): Promise<Reaction | undefined> {
    const [reaction] = await db.select().from(reactions)
      .where(and(eq(reactions.messageId, messageId), eq(reactions.userId, userId)));
    return reaction || undefined;
  }

  async createReaction(insertReaction: InsertReaction): Promise<Reaction> {
    const [reaction] = await db.insert(reactions).values(insertReaction).returning();
    return reaction;
  }

  async updateReaction(id: string, type: 'thumbs_up' | 'thumbs_down'): Promise<Reaction | undefined> {
    const [reaction] = await db.update(reactions)
      .set({ type })
      .where(eq(reactions.id, id))
      .returning();
    return reaction || undefined;
  }

  async deleteReaction(id: string): Promise<boolean> {
    const result = await db.delete(reactions).where(eq(reactions.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Usage tracking methods
  async createUsageMetric(insertMetric: InsertUsageMetric): Promise<UsageMetric> {
    const [metric] = await db.insert(usageMetrics).values(insertMetric).returning();
    return metric;
  }

  async getUserUsageMetrics(userId: string, dateFrom?: Date, dateTo?: Date): Promise<UsageMetric[]> {
    const whereConditions = [eq(usageMetrics.userId, userId)];
    
    if (dateFrom) {
      whereConditions.push(gte(usageMetrics.createdAt, dateFrom));
    }
    if (dateTo) {
      whereConditions.push(lte(usageMetrics.createdAt, dateTo));
    }
    
    return await db.select().from(usageMetrics)
      .where(and(...whereConditions))
      .orderBy(desc(usageMetrics.createdAt));
  }

  async getChatUsageMetrics(chatId: string): Promise<UsageMetric[]> {
    return await db.select().from(usageMetrics)
      .where(eq(usageMetrics.chatId, chatId))
      .orderBy(desc(usageMetrics.createdAt));
  }

  // OAuth token methods
  async getOAuthToken(userId: string, provider: string): Promise<OAuthToken | undefined> {
    const [token] = await db.select().from(oauthTokens)
      .where(and(eq(oauthTokens.userId, userId), eq(oauthTokens.provider, provider)));
    return token || undefined;
  }

  async saveOAuthToken(insertToken: InsertOAuthToken): Promise<OAuthToken> {
    const [token] = await db.insert(oauthTokens).values(insertToken).returning();
    return token;
  }

  async updateOAuthToken(userId: string, provider: string, updates: Partial<InsertOAuthToken>): Promise<OAuthToken | undefined> {
    const [token] = await db.update(oauthTokens)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(oauthTokens.userId, userId), eq(oauthTokens.provider, provider)))
      .returning();
    return token || undefined;
  }

  async deleteOAuthToken(userId: string, provider: string): Promise<boolean> {
    const result = await db.delete(oauthTokens)
      .where(and(eq(oauthTokens.userId, userId), eq(oauthTokens.provider, provider)));
    return (result.rowCount || 0) > 0;
  }
  
  // User preferences methods
  async getUserPreferences(userId: string): Promise<UserPreferences | undefined> {
    const [prefs] = await db.select().from(userPreferences)
      .where(eq(userPreferences.userId, userId));
    return prefs || undefined;
  }

  async saveUserPreferences(userId: string, preferences: InsertUserPreferences): Promise<UserPreferences> {
    const existing = await this.getUserPreferences(userId);

    if (existing) {
      const pinnedTeamIds = Array.isArray((preferences as any).pinnedTeamIds)
        ? this.normalizeIdList((preferences as any).pinnedTeamIds as string[])
        : this.normalizeIdList(existing.pinnedTeamIds ?? []);
      // Update existing preferences
      const [updated] = await db.update(userPreferences)
        .set({
          ...preferences,
          memories: preferences.memories as string[] || existing.memories,
          pinnedTeamIds,
          updatedAt: new Date()
        })
        .where(eq(userPreferences.userId, userId))
        .returning();
      return updated;
    } else {
      const pinnedTeamIds = Array.isArray((preferences as any).pinnedTeamIds)
        ? this.normalizeIdList((preferences as any).pinnedTeamIds as string[])
        : [];
      // Create new preferences
      const [created] = await db.insert(userPreferences)
        .values({
          userId,
          personalizationEnabled: preferences.personalizationEnabled || "false",
          customInstructions: preferences.customInstructions,
          name: preferences.name,
          occupation: preferences.occupation,
          bio: preferences.bio,
          profileImageUrl: preferences.profileImageUrl,
          memories: preferences.memories as string[] || [],
          chatHistoryEnabled: preferences.chatHistoryEnabled || "true",
          autonomousCodeExecution: preferences.autonomousCodeExecution || "true",
          pinnedTeamIds,
        })
        .returning();
      return created;
    }
  }

  async getUserTeamPins(userId: string): Promise<string[]> {
    const prefs = await this.getUserPreferences(userId);
    if (!prefs) {
      return [];
    }

    const normalized = this.normalizeIdList(prefs.pinnedTeamIds ?? []);
    const existing = prefs.pinnedTeamIds ?? [];
    const hasChanges = existing.length !== normalized.length || !existing.every((value, index) => value === normalized[index]);

    if (hasChanges) {
      await db.update(userPreferences)
        .set({ pinnedTeamIds: normalized, updatedAt: new Date() })
        .where(eq(userPreferences.userId, userId));
    }

    return normalized;
  }

  async getUserApiKeys(userId: string): Promise<UserApiKey[]> {
    return await db.select().from(userApiKeys)
      .where(eq(userApiKeys.userId, userId))
      .orderBy(desc(userApiKeys.updatedAt));
  }

  async getUserApiKey(userId: string, provider: UserApiKey['provider']): Promise<UserApiKey | undefined> {
    const [record] = await db.select().from(userApiKeys)
      .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)));
    if (!record) {
      return undefined;
    }
    const decrypted = decryptSecret(record.apiKey);
    return { ...record, apiKey: decrypted };
  }

  async upsertUserApiKey(userId: string, provider: UserApiKey['provider'], apiKey: string): Promise<UserApiKey> {
    const { cipherText, lastFour } = encryptSecret(apiKey);
    const [record] = await db.insert(userApiKeys)
      .values({ userId, provider, apiKey: cipherText, apiKeyLastFour: lastFour })
      .onConflictDoUpdate({
        target: [userApiKeys.userId, userApiKeys.provider],
        set: {
          apiKey: cipherText,
          apiKeyLastFour: lastFour,
          updatedAt: new Date(),
        },
      })
      .returning();
    return { ...record, apiKey };
  }

  async deleteUserApiKey(userId: string, provider: UserApiKey['provider']): Promise<boolean> {
    const result = await db.delete(userApiKeys)
      .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)));
    return (result.rowCount || 0) > 0;
  }

  async listProCoupons(): Promise<ProCoupon[]> {
    const records = await db.select().from(proCoupons);
    return records.sort((a, b) => a.code.localeCompare(b.code));
  }

  async createProCoupon(coupon: InsertProCoupon): Promise<ProCoupon> {
    const normalizedCode = this.normalizeCouponCode(coupon.code);
    const [existing] = await db
      .select({ id: proCoupons.id })
      .from(proCoupons)
      .where(eq(proCoupons.code, normalizedCode))
      .limit(1);

    if (existing) {
      throw new Error('Coupon code already exists');
    }

    const [record] = await db.insert(proCoupons)
      .values({
        code: normalizedCode,
        label: coupon.label ?? null,
        description: coupon.description ?? null,
        maxRedemptions: coupon.maxRedemptions ?? null,
        redemptionCount: 0,
        expiresAt: this.parseDate(coupon.expiresAt),
        isActive: coupon.isActive ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return record;
  }

  async updateProCoupon(id: string, updates: Partial<InsertProCoupon>): Promise<ProCoupon | undefined> {
    const existing = await db.select().from(proCoupons).where(eq(proCoupons.id, id)).limit(1);
    if (existing.length === 0) {
      return undefined;
    }

    const updatePayload: Partial<InsertProCoupon> & { updatedAt: Date } = {
      updatedAt: new Date(),
    };

    if (typeof updates.code === 'string' && updates.code.trim()) {
      const normalizedCode = this.normalizeCouponCode(updates.code);
      const [duplicate] = await db
        .select({ id: proCoupons.id })
        .from(proCoupons)
        .where(and(eq(proCoupons.code, normalizedCode), ne(proCoupons.id, id)))
        .limit(1);
      if (duplicate) {
        throw new Error('Coupon code already exists');
      }
      updatePayload.code = normalizedCode;
    }

    if (updates.label !== undefined) {
      updatePayload.label = updates.label ?? null;
    }

    if (updates.description !== undefined) {
      updatePayload.description = updates.description ?? null;
    }

    if (updates.maxRedemptions !== undefined) {
      updatePayload.maxRedemptions = updates.maxRedemptions ?? null;
    }

    if (updates.expiresAt !== undefined) {
      updatePayload.expiresAt = this.parseDate(updates.expiresAt);
    }

    if (updates.isActive !== undefined) {
      updatePayload.isActive = Boolean(updates.isActive);
    }

    const [record] = await db.update(proCoupons)
      .set(updatePayload)
      .where(eq(proCoupons.id, id))
      .returning();

    return record || undefined;
  }

  async deleteProCoupon(id: string): Promise<boolean> {
    const result = await db.delete(proCoupons)
      .where(eq(proCoupons.id, id));
    return (result.rowCount || 0) > 0;
  }

  async getProCouponByCode(code: string): Promise<ProCoupon | undefined> {
    const normalized = this.normalizeCouponCode(code);
    const [record] = await db.select().from(proCoupons)
      .where(eq(proCoupons.code, normalized))
      .limit(1);
    return record || undefined;
  }

  async getProCouponRedemption(couponId: string, userId: string): Promise<ProCouponRedemption | undefined> {
    const [record] = await db.select().from(proCouponRedemptions)
      .where(and(eq(proCouponRedemptions.couponId, couponId), eq(proCouponRedemptions.userId, userId)))
      .limit(1);
    return record || undefined;
  }

  async createProCouponRedemption(couponId: string, userId: string): Promise<ProCouponRedemption> {
    const [record] = await db.insert(proCouponRedemptions)
      .values({
        couponId,
        userId,
        redeemedAt: new Date(),
      })
      .returning();
    return record;
  }

  async incrementProCouponRedemption(couponId: string): Promise<ProCoupon | undefined> {
    const [record] = await db.update(proCoupons)
      .set({
        redemptionCount: sql`${proCoupons.redemptionCount} + 1`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(proCoupons.id, couponId),
        or(
          isNull(proCoupons.maxRedemptions),
          lt(proCoupons.redemptionCount, proCoupons.maxRedemptions!),
        ),
      ))
      .returning();
    return record || undefined;
  }

  async deleteProCouponRedemption(id: string): Promise<boolean> {
    const result = await db.delete(proCouponRedemptions)
      .where(eq(proCouponRedemptions.id, id));
    return (result.rowCount || 0) > 0;
  }

  async getN8nAgents(userId: string): Promise<N8nAgent[]> {
    return await db.select().from(n8nAgents)
      .where(eq(n8nAgents.userId, userId))
      .orderBy(desc(n8nAgents.updatedAt));
  }

  async createN8nAgent(userId: string, agent: InsertN8nAgent): Promise<N8nAgent> {
    const insertValues = {
      userId,
      workflowId: agent.workflowId,
      name: agent.name,
      description: agent.description ?? null,
      status: agent.status ?? 'inactive',
      webhookUrl: agent.webhookUrl ?? null,
      metadata: agent.metadata ?? null,
    };

    const updateSet: Record<string, unknown> = {
      name: agent.name,
      updatedAt: new Date(),
    };

    if (typeof agent.description !== 'undefined') {
      updateSet.description = agent.description ?? null;
    }

    if (typeof agent.status !== 'undefined') {
      updateSet.status = agent.status ?? 'inactive';
    }

    if (typeof agent.webhookUrl !== 'undefined') {
      updateSet.webhookUrl = agent.webhookUrl ?? null;
    }

    if (typeof agent.metadata !== 'undefined') {
      updateSet.metadata = agent.metadata ?? null;
    }

    const [record] = await db.insert(n8nAgents)
      .values(insertValues)
      .onConflictDoUpdate({
        target: [n8nAgents.userId, n8nAgents.workflowId],
        set: updateSet,
      })
      .returning();

    return record;
  }

  async deleteN8nAgent(userId: string, agentId: string): Promise<boolean> {
    const result = await db.delete(n8nAgents)
      .where(and(eq(n8nAgents.userId, userId), eq(n8nAgents.id, agentId)));
    return (result.rowCount || 0) > 0;
  }

  async createN8nAgentRun(agentId: string, run: Omit<InsertN8nAgentRun, 'agentId'>): Promise<N8nAgentRun> {
    const [record] = await db.insert(n8nAgentRuns)
      .values({
        agentId,
        status: run.status ?? 'pending',
        httpStatus: run.httpStatus ?? null,
        payloadExcerpt: run.payloadExcerpt ?? null,
        errorDetails: run.errorDetails ?? null,
      })
      .returning();

    return record;
  }

  async listN8nAgentRuns(agentId: string, limit?: number): Promise<N8nAgentRun[]> {
    const base = db
      .select()
      .from(n8nAgentRuns)
      .where(eq(n8nAgentRuns.agentId, agentId));

    const query = typeof limit === 'number' && Number.isFinite(limit) && limit >= 0
      ? base.limit(Math.floor(limit)).orderBy(desc(n8nAgentRuns.createdAt))
      : base.orderBy(desc(n8nAgentRuns.createdAt));

    return await query;
  }

  // File methods
  async saveFile(
    ownerId: string,
    buffer: Buffer,
    name: string,
    mimeType: string,
    analyzedContent?: string,
    metadata: Record<string, unknown> | null = null,
  ): Promise<Attachment> {
    const record = await this.fileStorage.put({
      ownerId,
      buffer,
      name,
      mimeType,
      analyzedContent,
      metadata,
    });

    return {
      id: record.id,
      name: record.name,
      mimeType: record.mimeType,
      size: record.size,
      url: await this.fileStorage.getSignedUrl(record.id),
    };
  }

  async getFileForUser(id: string, ownerId: string): Promise<StoredFile | undefined> {
    const record = await this.fileStorage.get(id);
    if (!record || record.ownerId !== ownerId) {
      return undefined;
    }
    return record;
  }

  async deleteFile(id: string, ownerId: string): Promise<boolean> {
    const record = await this.fileStorage.get(id);
    if (!record || record.ownerId !== ownerId) {
      return false;
    }
    await this.fileStorage.delete(id);
    return true;
  }

  // Knowledge item methods
  async getKnowledgeItems(userId: string): Promise<KnowledgeItem[]> {
    return await db.select().from(knowledgeItems)
      .where(eq(knowledgeItems.userId, userId))
      .orderBy(desc(knowledgeItems.createdAt));
  }

  async getKnowledgeItem(id: string): Promise<KnowledgeItem | undefined> {
    const [item] = await db.select().from(knowledgeItems)
      .where(eq(knowledgeItems.id, id));
    return item || undefined;
  }

  async createKnowledgeItem(insertItem: InsertKnowledgeItem): Promise<KnowledgeItem> {
    const [item] = await db.insert(knowledgeItems).values(insertItem).returning();
    return item;
  }

  async deleteKnowledgeItem(id: string): Promise<boolean> {
    const result = await db.delete(knowledgeItems)
      .where(eq(knowledgeItems.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Multi-level knowledge base methods
  async getEffectiveKnowledgeBase(userId: string): Promise<KnowledgeItem[]> {
    const user = await this.getUser(userId);
    if (!user) return [];
    
    const plan = await this.getUserPlan(userId);
    if (!plan) return [];
    
    const items: KnowledgeItem[] = [];
    
    // Get system KB if allowed by plan
    if (plan.allowKbSystem) {
      const systemItems = await this.getSystemKnowledgeItems();
      items.push(...systemItems);
    }
    
    // Get team KB if allowed by plan and user is in a team
    if (plan.allowKbTeam) {
      const teams = await this.getUserTeams(userId);
      for (const team of teams) {
        const teamItems = await this.getTeamKnowledgeItems(team.id);
        items.push(...teamItems);
      }
    }
    
    // Get user's personal KB if allowed by plan
    if (plan.allowKbUser) {
      const userItems = await db.select().from(knowledgeItems)
        .where(and(
          eq(knowledgeItems.userId, userId),
          eq(knowledgeItems.scope, 'user')
        ))
        .orderBy(desc(knowledgeItems.createdAt));
      items.push(...userItems);
    }
    
    // Sort by creation date (newest first)
    return items.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }
  
  async getSystemKnowledgeItems(): Promise<KnowledgeItem[]> {
    return await db.select().from(knowledgeItems)
      .where(eq(knowledgeItems.scope, 'system'))
      .orderBy(desc(knowledgeItems.createdAt));
  }
  
  async getTeamKnowledgeItems(teamId: string): Promise<KnowledgeItem[]> {
    return await db.select().from(knowledgeItems)
      .where(and(
        eq(knowledgeItems.scope, 'team'),
        eq(knowledgeItems.scopeId, teamId)
      ))
      .orderBy(desc(knowledgeItems.createdAt));
  }
  
  async getUserTeams(userId: string): Promise<Team[]> {
    // Get teams where user is a member
    const members = await db.select()
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.status, 'active')
      ));
    
    return members.map(m => m.teams);
  }
  
  async createSystemKnowledgeItem(item: Omit<InsertKnowledgeItem, 'userId' | 'scope' | 'scopeId'>, createdBy: string): Promise<KnowledgeItem> {
    const [created] = await db.insert(knowledgeItems).values({
      ...item,
      userId: createdBy, // Use createdBy as userId for system items
      scope: 'system',
      scopeId: null,
      createdBy,
    }).returning();
    return created;
  }
  
  async createTeamKnowledgeItem(teamId: string, item: Omit<InsertKnowledgeItem, 'userId' | 'scope' | 'scopeId'>, createdBy: string): Promise<KnowledgeItem> {
    const [created] = await db.insert(knowledgeItems).values({
      ...item,
      userId: createdBy, // Use createdBy as userId for team items
      scope: 'team',
      scopeId: teamId,
      createdBy,
    }).returning();
    return created;
  }
  
  async updateKnowledgeItem(id: string, updates: Partial<KnowledgeItem>): Promise<KnowledgeItem | undefined> {
    const [updated] = await db.update(knowledgeItems)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(knowledgeItems.id, id))
      .returning();
    return updated || undefined;
  }

  // Project methods
  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects)
      .where(eq(projects.id, id));
    return project || undefined;
  }

  async getProjectByShareToken(shareToken: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects)
      .where(eq(projects.shareToken, shareToken));
    return project || undefined;
  }

  async getUserProjects(userId: string): Promise<Project[]> {
    return await db.select().from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.updatedAt));
  }

  async createProject(userId: string, insertProject: InsertProject): Promise<Project> {
    const [project] = await db.insert(projects).values({
      ...insertProject,
      userId
    }).returning();
    return project;
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project | undefined> {
    const [project] = await db.update(projects)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return project || undefined;
  }

  async deleteProject(id: string): Promise<boolean> {
    const result = await db.delete(projects)
      .where(eq(projects.id, id));
    return (result.rowCount || 0) > 0;
  }

  async generateShareToken(projectId: string): Promise<string | undefined> {
    const shareToken = nanoid(16);
    const [project] = await db.update(projects)
      .set({ shareToken, isPublic: "true", updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning();
    return project?.shareToken || undefined;
  }

  // Project knowledge methods
  async getProjectKnowledge(projectId: string): Promise<ProjectKnowledge[]> {
    return await db.select().from(projectKnowledge)
      .where(eq(projectKnowledge.projectId, projectId))
      .orderBy(desc(projectKnowledge.createdAt));
  }

  async createProjectKnowledge(insertItem: InsertProjectKnowledge): Promise<ProjectKnowledge> {
    const [item] = await db.insert(projectKnowledge).values(insertItem).returning();
    return item;
  }

  async deleteProjectKnowledge(id: string): Promise<boolean> {
    const result = await db.delete(projectKnowledge)
      .where(eq(projectKnowledge.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Project file methods
  async getProjectFiles(projectId: string): Promise<ProjectFile[]> {
    return await db.select().from(projectFiles)
      .where(eq(projectFiles.projectId, projectId))
      .orderBy(desc(projectFiles.createdAt));
  }

  async createProjectFile(insertFile: InsertProjectFile): Promise<ProjectFile> {
    const [file] = await db.insert(projectFiles).values(insertFile).returning();
    return file;
  }

  async deleteProjectFile(id: string): Promise<boolean> {
    const result = await db.delete(projectFiles)
      .where(eq(projectFiles.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Chat migration methods
  async moveChatToProject(chatId: string, projectId: string | null): Promise<Chat | undefined> {
    const [chat] = await db.update(chats)
      .set({ projectId, updatedAt: new Date() })
      .where(eq(chats.id, chatId))
      .returning();
    return chat || undefined;
  }
  
  // Password reset token methods
  async createPasswordResetToken(insertToken: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const [token] = await db.insert(passwordResetTokens).values(insertToken).returning();
    return token;
  }
  
  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    const [resetToken] = await db.select().from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));
    return resetToken || undefined;
  }
  
  async markTokenAsUsed(token: string): Promise<boolean> {
    const result = await db.update(passwordResetTokens)
      .set({ used: "true" })
      .where(and(
        eq(passwordResetTokens.token, token),
        eq(passwordResetTokens.used, "false")
      ));
    return (result.rowCount || 0) > 0;
  }
  
  async deleteExpiredTokens(): Promise<number> {
    const now = new Date();
    const result = await db.delete(passwordResetTokens)
      .where(lte(passwordResetTokens.expiresAt, now));
    return result.rowCount || 0;
  }

  async getPlatformSettings(): Promise<PlatformSettings> {
    const [settings] = await db.select().from(platformSettings).limit(1);

    if (settings) {
      return {
        ...settings,
        data: parsePlatformSettingsData(settings.data),
      };
    }

    const [created] = await db
      .insert(platformSettings)
      .values({
        id: 'global',
        data: preparePlatformSettingsPayload(defaultPlatformSettings),
      })
      .onConflictDoNothing()
      .returning();

    if (created) {
      return {
        ...created,
        data: parsePlatformSettingsData(created.data),
      };
    }

    const [existing] = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.id, 'global'))
      .limit(1);

    if (!existing) {
      throw new Error('Failed to initialize platform settings');
    }

    return {
      ...existing,
      data: parsePlatformSettingsData(existing.data),
    };
  }

  async upsertPlatformSettings(data: PlatformSettingsData): Promise<PlatformSettings> {
    const now = new Date();
    const payload = preparePlatformSettingsPayload(data);

    const [settings] = await db
      .insert(platformSettings)
      .values({
        id: 'global',
        data: payload,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: platformSettings.id,
        set: {
          data: payload,
          updatedAt: now,
        },
      })
      .returning();

    return {
      ...settings,
      data: parsePlatformSettingsData(settings.data),
    };
  }

  async listSystemPrompts(): Promise<SystemPrompt[]> {
    return await db.select().from(systemPrompts).orderBy(desc(systemPrompts.version));
  }

  async getSystemPrompt(id: string): Promise<SystemPrompt | undefined> {
    const [prompt] = await db.select().from(systemPrompts).where(eq(systemPrompts.id, id));
    return prompt || undefined;
  }

  async getActiveSystemPrompt(): Promise<SystemPrompt | undefined> {
    const release = await this.getActiveRelease();
    if (release?.systemPromptId) {
      const prompt = await this.getSystemPrompt(release.systemPromptId);
      if (prompt) {
        return prompt;
      }
    }

    const [prompt] = await db
      .select()
      .from(systemPrompts)
      .where(eq(systemPrompts.isActive, true))
      .limit(1);
    return prompt || undefined;
  }

  async createSystemPrompt(options: CreateSystemPromptOptions): Promise<SystemPrompt> {
    const now = new Date();
    return await db.transaction(async (tx) => {
      const [result] = await tx
        .select({ max: sql<number>`COALESCE(MAX(${systemPrompts.version}), 0)` })
        .from(systemPrompts);
      const nextVersion = (result?.max ?? 0) + 1;

      if (options.activate) {
        await tx
          .update(systemPrompts)
          .set({
            isActive: false,
            activatedAt: null,
            activatedByUserId: null,
            updatedAt: now,
          });
      }

      const [created] = await tx
        .insert(systemPrompts)
        .values({
          version: nextVersion,
          label: options.label ?? null,
          content: options.content,
          notes: options.notes ?? null,
          createdByUserId: options.createdByUserId ?? null,
          activatedByUserId: options.activate
            ? options.activatedByUserId ?? options.createdByUserId ?? null
            : null,
          isActive: options.activate ?? false,
          createdAt: now,
          updatedAt: now,
          activatedAt: options.activate ? now : null,
        })
        .returning();

      return created;
    });
  }

  async updateSystemPrompt(id: string, updates: UpdateSystemPromptOptions): Promise<SystemPrompt | undefined> {
    const payload: Partial<typeof systemPrompts.$inferInsert> = { updatedAt: new Date() };
    if (updates.content !== undefined) {
      payload.content = updates.content;
    }
    if (updates.label !== undefined) {
      payload.label = updates.label ?? null;
    }
    if (updates.notes !== undefined) {
      payload.notes = updates.notes ?? null;
    }

    const [updated] = await db
      .update(systemPrompts)
      .set(payload)
      .where(eq(systemPrompts.id, id))
      .returning();

    return updated || undefined;
  }

  async activateSystemPrompt(id: string, activatedByUserId?: string | null): Promise<SystemPrompt | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(systemPrompts).where(eq(systemPrompts.id, id)).limit(1);
      if (!existing) {
        return undefined;
      }

      const now = new Date();

      await tx
        .update(systemPrompts)
        .set({
          isActive: false,
          activatedAt: null,
          activatedByUserId: null,
          updatedAt: now,
        })
        .where(ne(systemPrompts.id, id));

      const [activated] = await tx
        .update(systemPrompts)
        .set({
          isActive: true,
          activatedAt: now,
          activatedByUserId: activatedByUserId ?? null,
          updatedAt: now,
        })
        .where(eq(systemPrompts.id, id))
        .returning();

      return activated || undefined;
    });
  }

  async listReleases(): Promise<Release[]> {
    return await db.select().from(releases).orderBy(desc(releases.version));
  }

  async getRelease(id: string): Promise<Release | undefined> {
    const [release] = await db.select().from(releases).where(eq(releases.id, id));
    return release || undefined;
  }

  async getActiveRelease(): Promise<Release | undefined> {
    const [release] = await db
      .select()
      .from(releases)
      .where(eq(releases.isActive, true))
      .limit(1);
    return release || undefined;
  }

  async createRelease(options: CreateReleaseOptions): Promise<Release> {
    const now = new Date();
    const expertIds = this.normalizeIdList(options.expertIds);
    const templateIds = this.normalizeIdList(options.templateIds);
    const outputTemplateIds = this.normalizeIdList(options.outputTemplateIds);
    const toolPolicyIds = this.normalizeIdList(options.toolPolicyIds);

    return await db.transaction(async (tx) => {
      const [result] = await tx
        .select({ max: sql<number>`COALESCE(MAX(${releases.version}), 0)` })
        .from(releases);
      const nextVersion = (result?.max ?? 0) + 1;

      const [created] = await tx
        .insert(releases)
        .values({
          version: nextVersion,
          label: options.label,
          status: 'draft',
          changeNotes: options.changeNotes ?? null,
          systemPromptId: options.systemPromptId ?? null,
          expertIds,
          templateIds,
          outputTemplateIds,
          toolPolicyIds,
          isActive: false,
          publishedAt: null,
          publishedByUserId: null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return created;
    });
  }

  async publishRelease(id: string, options: ReleaseTransitionOptions): Promise<Release | undefined> {
    const now = new Date();

    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(releases).where(eq(releases.id, id)).limit(1);
      if (!existing) {
        return undefined;
      }

      await tx
        .update(releases)
        .set({
          status: 'archived',
          isActive: false,
          updatedAt: now,
        })
        .where(eq(releases.isActive, true));

      const [updated] = await tx
        .update(releases)
        .set({
          status: 'active',
          isActive: true,
          changeNotes: options.changeNotes,
          publishedAt: now,
          publishedByUserId: options.actorUserId ?? null,
          updatedAt: now,
        })
        .where(eq(releases.id, id))
        .returning();

      if (!updated) {
        return undefined;
      }

      if (updated.systemPromptId) {
        await tx
          .update(systemPrompts)
          .set({
            isActive: false,
            activatedAt: null,
            activatedByUserId: null,
            updatedAt: now,
          });

        await tx
          .update(systemPrompts)
          .set({
            isActive: true,
            activatedAt: now,
            activatedByUserId: options.actorUserId ?? null,
            updatedAt: now,
          })
          .where(eq(systemPrompts.id, updated.systemPromptId));
      } else {
        await tx
          .update(systemPrompts)
          .set({
            isActive: false,
            activatedAt: null,
            activatedByUserId: null,
            updatedAt: now,
          });
      }

      return updated;
    });
  }

  async rollbackRelease(id: string, options: ReleaseTransitionOptions): Promise<Release | undefined> {
    return this.publishRelease(id, options);
  }

  async listExperts(): Promise<Expert[]> {
    return await db.select().from(experts).orderBy(desc(experts.createdAt));
  }

  async listActiveExperts(): Promise<Expert[]> {
    return await db.select().from(experts).where(eq(experts.isActive, true)).orderBy(desc(experts.createdAt));
  }

  async getExpert(id: string): Promise<Expert | undefined> {
    const [expert] = await db.select().from(experts).where(eq(experts.id, id));
    return expert || undefined;
  }

  async createExpert(insertExpert: InsertExpert): Promise<Expert> {
    const [expert] = await db.insert(experts).values(insertExpert).returning();
    return expert;
  }

  async updateExpert(id: string, updates: UpdateExpert): Promise<Expert | undefined> {
    const [expert] = await db
      .update(experts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(experts.id, id))
      .returning();
    return expert || undefined;
  }

  async deleteExpert(id: string): Promise<boolean> {
    const result = await db.delete(experts).where(eq(experts.id, id));
    return (result.rowCount || 0) > 0;
  }

  async getAvailableExperts(userId: string): Promise<Expert[]> {
    const plan = await this.getUserPlan(userId);
    if (!plan) {
      return [];
    }

    // If the plan doesn't allow experts, return empty array
    if (!plan.allowExperts) {
      return [];
    }

    // Get all active experts
    const allExperts = await this.listActiveExperts();

    // If plan has specific experts_allowed list, filter by that
    if (plan.expertsAllowed && plan.expertsAllowed.length > 0) {
      const allowedExpertIds = new Set(plan.expertsAllowed);
      return allExperts.filter(expert => allowedExpertIds.has(expert.id));
    }

    // Otherwise return all active experts
    return allExperts;
  }

  async getUserPlanWithDetails(userId: string): Promise<Plan | undefined> {
    return await this.getUserPlan(userId);
  }

  async listTemplates(): Promise<Template[]> {
    return await db.select().from(templates).orderBy(desc(templates.createdAt));
  }

  async getTemplate(id: string): Promise<Template | undefined> {
    const [template] = await db.select().from(templates).where(eq(templates.id, id));
    return template || undefined;
  }

  async createTemplate(insertTemplate: InsertTemplate): Promise<Template> {
    const [template] = await db.insert(templates).values(insertTemplate).returning();
    return template;
  }

  async updateTemplate(id: string, updates: Partial<InsertTemplate>): Promise<Template | undefined> {
    const [template] = await db
      .update(templates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(templates.id, id))
      .returning();
    return template || undefined;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const result = await db.delete(templates).where(eq(templates.id, id));
    return (result.rowCount || 0) > 0;
  }

  async getAvailableTemplates(userId: string): Promise<Template[]> {
    // Get user's plan details
    const plan = await this.getUserPlan(userId);
    if (!plan) {
      return [];
    }

    // Check if templates are allowed for this plan
    if (!plan.allowTemplates) {
      return [];
    }

    // Get all active templates
    const allTemplates = await db
      .select()
      .from(templates)
      .where(eq(templates.isActive, true))
      .orderBy(desc(templates.createdAt));

    // If plan has specific templates allowed, filter by that list
    if (plan.templatesAllowed && Array.isArray(plan.templatesAllowed) && plan.templatesAllowed.length > 0) {
      const allowedIds = new Set(plan.templatesAllowed);
      return allTemplates.filter(t => allowedIds.has(t.id));
    }

    // Otherwise return all active templates
    return allTemplates;
  }

  async listOutputTemplates(): Promise<OutputTemplate[]> {
    const rows = await db.select().from(outputTemplates).orderBy(desc(outputTemplates.createdAt));
    return rows.map(row => this.normalizeOutputTemplate(row));
  }

  async getOutputTemplate(id: string): Promise<OutputTemplate | undefined> {
    const [row] = await db.select().from(outputTemplates).where(eq(outputTemplates.id, id));
    return row ? this.normalizeOutputTemplate(row) : undefined;
  }

  async createOutputTemplate(insertTemplate: InsertOutputTemplate): Promise<OutputTemplate> {
    const [row] = await db.insert(outputTemplates).values(insertTemplate).returning();
    return this.normalizeOutputTemplate(row);
  }

  async updateOutputTemplate(id: string, updates: Partial<InsertOutputTemplate>): Promise<OutputTemplate | undefined> {
    const [row] = await db
      .update(outputTemplates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(outputTemplates.id, id))
      .returning();

    return row ? this.normalizeOutputTemplate(row) : undefined;
  }

  async deleteOutputTemplate(id: string): Promise<boolean> {
    const result = await db.delete(outputTemplates).where(eq(outputTemplates.id, id));
    return (result.rowCount || 0) > 0;
  }

  async getAvailableOutputTemplates(userId: string): Promise<OutputTemplate[]> {
    // Get user's plan details
    const plan = await this.getUserPlan(userId);
    if (!plan) {
      return [];
    }

    // Check if templates are allowed for this plan
    if (!plan.allowTemplates) {
      return [];
    }

    // Get all active output templates
    const rows = await db
      .select()
      .from(outputTemplates)
      .where(eq(outputTemplates.isActive, true))
      .orderBy(desc(outputTemplates.createdAt));
    
    // For now, return all active output templates if templates are allowed
    // (output templates don't have a specific allowed list in the plan)
    return rows.map(row => this.normalizeOutputTemplate(row));
  }

  async listToolPolicies(): Promise<ToolPolicy[]> {
    return await db
      .select()
      .from(toolPolicies)
      .orderBy(asc(toolPolicies.provider), asc(toolPolicies.toolName));
  }

  async listToolPoliciesByProvider(provider: ToolPolicyProvider): Promise<ToolPolicy[]> {
    return await db
      .select()
      .from(toolPolicies)
      .where(eq(toolPolicies.provider, provider))
      .orderBy(asc(toolPolicies.toolName));
  }

  async getToolPolicy(id: string): Promise<ToolPolicy | undefined> {
    const [policy] = await db.select().from(toolPolicies).where(eq(toolPolicies.id, id));
    return policy || undefined;
  }

  async createToolPolicy(policy: InsertToolPolicy): Promise<ToolPolicy> {
    const now = new Date();
    const [created] = await db
      .insert(toolPolicies)
      .values({
        provider: policy.provider.trim(),
        toolName: policy.toolName.trim(),
        isEnabled: policy.isEnabled ?? true,
        safetyNote: policy.safetyNote?.trim() ? policy.safetyNote.trim() : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return created;
  }

  async updateToolPolicy(id: string, updates: UpdateToolPolicy): Promise<ToolPolicy | undefined> {
    const payload: Partial<typeof toolPolicies.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (typeof updates.provider === 'string') {
      payload.provider = updates.provider.trim();
    }
    if (typeof updates.toolName === 'string') {
      payload.toolName = updates.toolName.trim();
    }
    if (typeof updates.isEnabled === 'boolean') {
      payload.isEnabled = updates.isEnabled;
    }
    if (updates.safetyNote === null) {
      payload.safetyNote = null;
    } else if (typeof updates.safetyNote === 'string') {
      payload.safetyNote = updates.safetyNote.trim() ? updates.safetyNote.trim() : null;
    }

    const [updated] = await db
      .update(toolPolicies)
      .set(payload)
      .where(eq(toolPolicies.id, id))
      .returning();

    return updated || undefined;
  }

  async deleteToolPolicy(id: string): Promise<boolean> {
    const result = await db.delete(toolPolicies).where(eq(toolPolicies.id, id));
    return (result.rowCount || 0) > 0;
  }

  async createAdminAuditLog(entry: InsertAdminAuditLog): Promise<AdminAuditLog> {
    const [log] = await db
      .insert(adminAuditLogs)
      .values({
        ...entry,
        metadata: entry.metadata ?? {},
      })
      .returning();
    return log;
  }

  async listAdminAuditLogsForUser(userId: string, limit?: number): Promise<AdminAuditLog[]> {
    const base = db
      .select()
      .from(adminAuditLogs)
      .where(eq(adminAuditLogs.targetUserId, userId));

    const query = typeof limit === 'number'
      ? base.limit(Math.max(0, limit)).orderBy(desc(adminAuditLogs.createdAt))
      : base.orderBy(desc(adminAuditLogs.createdAt));

    return await query;
  }

  async getAdminAuditLogs(filters?: {
    targetUserId?: string;
    actorUserId?: string;
    actions?: string[];
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<AdminAuditLog[]> {
    const conditions: any[] = [];

    if (filters?.targetUserId) {
      conditions.push(eq(adminAuditLogs.targetUserId, filters.targetUserId));
    }

    if (filters?.actorUserId) {
      conditions.push(eq(adminAuditLogs.actorUserId, filters.actorUserId));
    }

    if (filters?.actions && filters.actions.length > 0) {
      conditions.push(inArray(adminAuditLogs.action, filters.actions));
    }

    if (filters?.startDate) {
      conditions.push(gte(adminAuditLogs.createdAt, filters.startDate));
    }

    if (filters?.endDate) {
      conditions.push(lte(adminAuditLogs.createdAt, filters.endDate));
    }

    const base = (
      conditions.length > 0
        ? db.select().from(adminAuditLogs).where(and(...conditions))
        : db.select().from(adminAuditLogs)
    );

    const query = filters?.limit && filters.limit > 0
      ? base.limit(filters.limit).orderBy(desc(adminAuditLogs.createdAt))
      : base.orderBy(desc(adminAuditLogs.createdAt));

    return await query;
  }

  // Analytics event methods
  async createAnalyticsEvent(event: InsertAnalyticsEvent): Promise<AnalyticsEvent> {
    const [created] = await db.insert(analyticsEvents).values(event).returning();
    return created;
  }

  async getAnalyticsEvents(filters?: {
    userId?: string;
    projectId?: string | null;
    provider?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<AnalyticsEvent[]> {
    const conditions = [];

    if (filters?.userId) {
      conditions.push(eq(analyticsEvents.userId, filters.userId));
    }

    if (filters?.projectId !== undefined) {
      if (filters.projectId === null) {
        conditions.push(isNull(analyticsEvents.projectId));
      } else {
        conditions.push(eq(analyticsEvents.projectId, filters.projectId));
      }
    }

    if (filters?.provider) {
      conditions.push(eq(analyticsEvents.provider, filters.provider));
    }

    if (filters?.dateFrom) {
      conditions.push(gte(analyticsEvents.createdAt, filters.dateFrom));
    }

    if (filters?.dateTo) {
      conditions.push(lte(analyticsEvents.createdAt, filters.dateTo));
    }

    const base = db.select().from(analyticsEvents);
    const q = conditions.length > 0 ? base.where(and(...conditions)) : base;
    return await q.orderBy(desc(analyticsEvents.createdAt));
  }

  // Provider pricing methods
  async listProviderPricing(): Promise<ProviderPricing[]> {
    return await db.select().from(providerPricing).orderBy(asc(providerPricing.provider), asc(providerPricing.model));
  }

  async getProviderPricing(provider: string, model: string): Promise<ProviderPricing | undefined> {
    const [result] = await db
      .select()
      .from(providerPricing)
      .where(and(eq(providerPricing.provider, provider), eq(providerPricing.model, model)))
      .limit(1);
    return result;
  }

  async upsertProviderPricing(pricing: InsertProviderPricing): Promise<ProviderPricing> {
    const [result] = await db
      .insert(providerPricing)
      .values(pricing)
      .onConflictDoUpdate({
        target: [providerPricing.provider, providerPricing.model],
        set: {
          inputUsdPer1k: pricing.inputUsdPer1k,
          outputUsdPer1k: pricing.outputUsdPer1k,
          enabled: pricing.enabled,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  // Model methods
  async listModels(): Promise<Model[]> {
    return await db.select().from(models).orderBy(asc(models.provider), asc(models.displayName));
  }

  async getModel(id: string): Promise<Model | undefined> {
    const [result] = await db.select().from(models).where(eq(models.id, id)).limit(1);
    return result;
  }

  async getModelByModelId(modelId: string): Promise<Model | undefined> {
    const [result] = await db.select().from(models).where(eq(models.modelId, modelId)).limit(1);
    return result;
  }

  async createModel(model: InsertModel): Promise<Model> {
    const [result] = await db.insert(models).values(model).returning();
    return result;
  }

  async updateModel(id: string, updates: UpdateModel): Promise<Model | undefined> {
    const [result] = await db
      .update(models)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(models.id, id))
      .returning();
    return result;
  }

  async deleteModel(id: string): Promise<boolean> {
    const result = await db.delete(models).where(eq(models.id, id));
    return (result.rowCount || 0) > 0;
  }

  async getAvailableModels(userId: string): Promise<Model[]> {
    // Get user's plan
    const plan = await this.getUserPlan(userId);
    if (!plan || !plan.allowModels) {
      return [];
    }

    // Get all active models
    const allModels = await db
      .select()
      .from(models)
      .where(eq(models.isActive, true))
      .orderBy(asc(models.provider), asc(models.displayName));

    // If modelsAllowed is empty or not defined, return all active models
    const modelsAllowed = plan.modelsAllowed as string[] | undefined;
    if (!modelsAllowed || modelsAllowed.length === 0) {
      return allModels;
    }

    // Filter models based on plan's allowed models (by modelId)
    return allModels.filter(m => modelsAllowed.includes(m.modelId));
  }

  // Team methods
  async getTeam(id: string): Promise<Team | undefined> {
    const [result] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
    return result;
  }

  async getTeamsByOwner(ownerId: string): Promise<Team[]> {
    return await db.select().from(teams).where(eq(teams.ownerId, ownerId));
  }

  async createTeam(team: InsertTeam): Promise<Team> {
    const payload: typeof teams.$inferInsert = {
      name: team.name,
      ownerId: team.ownerId,
      description: team.description ?? null,
      settings: team.settings == null
        ? null
        : {
            customInstructions: typeof (team.settings as any).customInstructions === 'string'
              ? (team.settings as any).customInstructions
              : undefined,
            storageQuotaMb: typeof (team.settings as any).storageQuotaMb === 'number'
              ? (team.settings as any).storageQuotaMb
              : undefined,
            apiUsageLimit: typeof (team.settings as any).apiUsageLimit === 'number'
              ? (team.settings as any).apiUsageLimit
              : undefined,
          },
    } as any;

    const [result] = await db.insert(teams).values(payload).returning();
    // Automatically add owner as a team member
    await this.addTeamMember({
      teamId: result.id,
      userId: team.ownerId,
      role: 'owner',
      status: 'active',
    });
    return result;
  }

  async updateTeam(id: string, updates: Partial<InsertTeam>): Promise<Team | undefined> {
    const payload: Partial<typeof teams.$inferInsert> = { updatedAt: new Date() };
    if (typeof updates.name === 'string') payload.name = updates.name;
    if (typeof updates.ownerId === 'string') payload.ownerId = updates.ownerId;
    if (updates.description === null) payload.description = null;
    else if (typeof updates.description === 'string') payload.description = updates.description;
    if (updates.settings === null) payload.settings = null as any;
    else if (typeof updates.settings === 'object') {
      payload.settings = updates.settings as { customInstructions?: string; storageQuotaMb?: number; apiUsageLimit?: number };
    }

    const [result] = await db
      .update(teams)
      .set(payload)
      .where(eq(teams.id, id))
      .returning();
    return result;
  }

  async deleteTeam(id: string): Promise<boolean> {
    const result = await db.delete(teams).where(eq(teams.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Team member methods
  async getTeamMembers(teamId: string): Promise<TeamMember[]> {
    return await db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId));
  }

  async getTeamMember(teamId: string, userId: string): Promise<TeamMember | undefined> {
    const [result] = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
      .limit(1);
    return result;
  }

  async getUserTeamMemberships(userId: string): Promise<TeamMember[]> {
    return await db.select().from(teamMembers).where(eq(teamMembers.userId, userId));
  }

  async addTeamMember(member: InsertTeamMember): Promise<TeamMember> {
    const [result] = await db.insert(teamMembers).values(member).returning();
    return result;
  }

  async updateTeamMember(id: string, updates: Partial<InsertTeamMember>): Promise<TeamMember | undefined> {
    const [result] = await db
      .update(teamMembers)
      .set(updates)
      .where(eq(teamMembers.id, id))
      .returning();
    return result;
  }

  async removeTeamMember(teamId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getTeamMemberCount(teamId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.status, 'active')));
    return result?.count ?? 0;
  }

  // Team invitation methods
  async getTeamInvitation(id: string): Promise<TeamInvitation | undefined> {
    const [result] = await db
      .select()
      .from(teamInvitations)
      .where(eq(teamInvitations.id, id))
      .limit(1);
    return result;
  }

  async getTeamInvitationByToken(token: string): Promise<TeamInvitation | undefined> {
    const [result] = await db
      .select()
      .from(teamInvitations)
      .where(eq(teamInvitations.token, token))
      .limit(1);
    return result;
  }

  async getTeamInvitations(teamId: string): Promise<TeamInvitation[]> {
    return await db
      .select()
      .from(teamInvitations)
      .where(eq(teamInvitations.teamId, teamId))
      .orderBy(desc(teamInvitations.createdAt));
  }

  async getUserInvitations(email: string): Promise<TeamInvitation[]> {
    return await db
      .select()
      .from(teamInvitations)
      .where(and(eq(teamInvitations.email, email), eq(teamInvitations.status, 'pending')))
      .orderBy(desc(teamInvitations.createdAt));
  }

  async createTeamInvitation(invitation: InsertTeamInvitation): Promise<TeamInvitation> {
    const [result] = await db.insert(teamInvitations).values(invitation).returning();
    return result;
  }

  async updateTeamInvitation(id: string, updates: Partial<TeamInvitation>): Promise<TeamInvitation | undefined> {
    const [result] = await db
      .update(teamInvitations)
      // Allow broader update payloads like acceptedAt/status
      .set(updates as any)
      .where(eq(teamInvitations.id, id))
      .returning();
    return result;
  }

  async deleteTeamInvitation(id: string): Promise<boolean> {
    const result = await db.delete(teamInvitations).where(eq(teamInvitations.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async deleteExpiredInvitations(): Promise<number> {
    const result = await db
      .delete(teamInvitations)
      .where(and(eq(teamInvitations.status, 'pending'), lt(teamInvitations.expiresAt, new Date())));
    return result.rowCount ?? 0;
  }
}

export const storage = new DatabaseStorage();

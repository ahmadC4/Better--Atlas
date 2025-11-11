import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, unique, index, integer, boolean, uniqueIndex, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
// (IMPORTANT) This table is mandatory for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire", { withTimezone: true }).notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

export const userRoleSchema = z.enum(['user', 'admin', 'super_admin']);
export const userStatusSchema = z.enum(['active', 'suspended', 'deleted']);

// Plans table for dynamic plan management
export const plans = pgTable("plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(), // 'Free', 'Pro', 'Enterprise', 'Custom'
  slug: text("slug").notNull(),
  tier: text("tier").notNull().default("custom"),
  description: text("description"),
  // Feature flags
  allowExperts: boolean("allow_experts").notNull().default(false),
  allowTemplates: boolean("allow_templates").notNull().default(false),
  allowModels: boolean("allow_models").notNull().default(true),
  allowKbSystem: boolean("allow_kb_system").notNull().default(false),
  allowKbOrg: boolean("allow_kb_org").notNull().default(false),
  allowKbTeam: boolean("allow_kb_team").notNull().default(false),
  allowKbUser: boolean("allow_kb_user").notNull().default(true),
  allowMemory: boolean("allow_memory").notNull().default(true),
  allowAgents: boolean("allow_agents").notNull().default(false),
  allowApiAccess: boolean("allow_api_access").notNull().default(false),
  // Upsell flags
  showExpertsUpsell: boolean("show_experts_upsell").notNull().default(false),
  showTemplatesUpsell: boolean("show_templates_upsell").notNull().default(false),
  showApiUpsell: boolean("show_api_upsell").notNull().default(false),
  // Limits
  dailyMessageLimit: integer("daily_message_limit"), // null = unlimited
  maxFileSizeMb: integer("max_file_size_mb").default(10),
  storageQuotaGb: integer("storage_quota_gb").default(1),
  // Allowlists (JSONB)
  modelsAllowed: jsonb("models_allowed").$type<string[]>().default(sql`'[]'::jsonb`),
  expertsAllowed: jsonb("experts_allowed").$type<string[]>().default(sql`'[]'::jsonb`),
  templatesAllowed: jsonb("templates_allowed").$type<string[]>().default(sql`'[]'::jsonb`),
  // Billing
  priceMonthlyUsd: integer("price_monthly_usd"), // in cents (e.g., 2000 = $20.00)
  priceAnnualUsd: integer("price_annual_usd"), // in cents (e.g., 20000 = $200.00)
  isProTier: boolean("is_pro_tier").notNull().default(false),
  // Status
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("plans_name_idx").on(table.name),
  index("plans_is_active_idx").on(table.isActive),
  uniqueIndex("plans_slug_unique_idx").on(table.slug),
  check("plans_slug_lowercase_chk", sql`slug = lower(slug)`),
]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username"), // Making nullable for Replit Auth users
  password: text("password"), // Hashed password - optional for Replit Auth
  email: text("email").unique(), // Unique for Replit Auth
  avatar: text("avatar"), // Deprecated - use profileImageUrl instead
  firstName: text("first_name"),
  lastName: text("last_name"),
  profileImageUrl: text("profile_image_url"),
  plan: text("plan").notNull().default("free"), // DEPRECATED: Keep for backward compatibility
  planId: varchar("plan_id").references(() => plans.id, { onDelete: 'set null' }), // New field referencing plans table
  proAccessCode: text("pro_access_code"), // Special code for pro access
  role: text("role").notNull().default('user'),
  status: text("status").notNull().default('active'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Teams functionality (Enterprise plan only)
export const teamRoleSchema = z.enum(['owner', 'admin', 'member']);
export const teamMemberStatusSchema = z.enum(['active', 'pending', 'inactive']);
export const invitationStatusSchema = z.enum(['pending', 'accepted', 'declined', 'expired']);

export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  ownerId: varchar("owner_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  settings: jsonb("settings").$type<{
    customInstructions?: string;
    storageQuotaMb?: number;
    apiUsageLimit?: number;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("teams_owner_id_idx").on(table.ownerId),
]);

export const teamMembers = pgTable("team_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull().references(() => teams.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text("role").notNull().default('member'), // 'owner', 'admin', 'member'
  status: text("status").notNull().default('active'), // 'active', 'pending', 'inactive'
  invitedBy: varchar("invited_by").references(() => users.id, { onDelete: 'set null' }),
  joinedAt: timestamp("joined_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueTeamUser: unique().on(table.teamId, table.userId),
  teamIdIdx: index("team_members_team_id_idx").on(table.teamId),
  userIdIdx: index("team_members_user_id_idx").on(table.userId),
}));

export const teamInvitations = pgTable("team_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull().references(() => teams.id, { onDelete: 'cascade' }),
  email: text("email").notNull(),
  role: text("role").notNull().default('member'), // Role they'll have when they accept
  invitedBy: varchar("invited_by").notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: varchar("token").notNull().unique(), // Unique token for accepting invitation
  status: text("status").notNull().default('pending'), // 'pending', 'accepted', 'declined', 'expired'
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueTeamEmail: unique().on(table.teamId, table.email),
  teamIdIdx: index("team_invitations_team_id_idx").on(table.teamId),
  emailIdx: index("team_invitations_email_idx").on(table.email),
  tokenIdx: index("team_invitations_token_idx").on(table.token),
}));

export const planTierSchema = z.object({
  messageLimitPerDay: z.number().int().nonnegative().nullable(),
  allowedModels: z.array(z.string()),
  features: z.array(z.string()),
  fileUploadLimitMb: z.number().int().nonnegative().nullable().default(null),
  chatHistoryEnabled: z.boolean().default(true),
  // Memory settings per plan
  memoryEnabled: z.boolean().default(true),
  maxMemoriesPerUser: z.number().int().nonnegative().nullable().default(null),
  // Template settings per plan
  templatesEnabled: z.boolean().default(true),
  maxTemplatesPerUser: z.number().int().nonnegative().nullable().default(null),
  allowedTemplateIds: z.array(z.string()).default([]), // Which specific templates are available for this plan
  // Project settings per plan
  projectsEnabled: z.boolean().default(true),
  maxProjectsPerUser: z.number().int().nonnegative().nullable().default(null),
  // Knowledge base settings per plan
  knowledgeBaseEnabled: z.boolean().default(true),
  maxKnowledgeItems: z.number().int().nonnegative().nullable().default(null),
  maxKnowledgeStorageMb: z.number().int().nonnegative().nullable().default(null),
  // Team settings per plan (Enterprise only today)
  maxTeamsPerOrg: z.number().int().nonnegative().nullable().default(null),
  maxMembersPerTeam: z.number().int().nonnegative().nullable().default(null),
});

export const knowledgeBaseSettingsSchema = z.object({
  enabled: z.boolean(),
  maxItems: z.number().int().nonnegative().nullable(),
  maxStorageMb: z.number().int().nonnegative().nullable(),
  allowUploads: z.boolean(),
});

export const memorySettingsSchema = z.object({
  enabled: z.boolean(),
  maxMemoriesPerUser: z.number().int().nonnegative().nullable(),
  retentionDays: z.number().int().positive().nullable(),
});

export const agentSettingsSchema = z.object({
  enabled: z.boolean(),
  maxAgentsPerUser: z.number().int().nonnegative().nullable(),
  allowAutonomousExecution: z.boolean(),
});

export const templateSettingsSchema = z.object({
  enabled: z.boolean(),
  maxTemplatesPerUser: z.number().int().nonnegative().nullable(),
});

export const projectSettingsSchema = z.object({
  enabled: z.boolean(),
  maxProjectsPerUser: z.number().int().nonnegative().nullable(),
  maxMembersPerProject: z.number().int().nonnegative().nullable(),
});

export const teamSettingsSchema = z.object({
  enabled: z.boolean(),
  maxTeamsPerOrg: z.number().int().nonnegative().nullable(),
  maxMembersPerTeam: z.number().int().nonnegative().nullable(),
  teamStorageQuotaMb: z.number().int().nonnegative().nullable(),
  teamApiUsageLimit: z.number().int().nonnegative().nullable(),
});

export const planAllowlistSchema = z.object({
  knowledgeBaseHosts: z.array(z.string()).default([]),
});

export const providerSettingsSchema = z.object({
  enabled: z.boolean(),
  defaultApiKey: z.string().nullable(),
  allowUserProvidedKeys: z.boolean(),
  allowedModels: z.array(z.string()),
  dailyRequestLimit: z.number().int().positive().nullable(),
  platformKeyAllowedModels: z.array(z.string()).default([]),
});

export const platformSettingsDataSchema = z.object({
  planTiers: z.object({
    free: planTierSchema,
    pro: planTierSchema,
    enterprise: planTierSchema,
  }),
  knowledgeBase: knowledgeBaseSettingsSchema,
  memory: memorySettingsSchema,
  aiAgents: agentSettingsSchema,
  templates: templateSettingsSchema,
  projects: projectSettingsSchema,
  teams: teamSettingsSchema,
  apiProviders: z.record(providerSettingsSchema),
  legacyModels: z.array(z.string()).default([]),
  planAllowlists: z.record(planAllowlistSchema).default({}),
});

export const templates = pgTable("templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  fileId: varchar("file_id").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  availableForFree: boolean("available_for_free").notNull().default(false),
  availableForPro: boolean("available_for_pro").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const outputTemplateCategorySchema = z.enum(['how_to', 'executive_brief', 'json_report']);
export const outputTemplateFormatSchema = z.enum(['markdown', 'json']);
export const outputTemplateSectionSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, 'Section key is required')
    .max(60, 'Section key must be 60 characters or fewer')
    .regex(/^[a-z0-9_\-]+$/i, 'Section key must be alphanumeric and may include dashes or underscores'),
  title: z
    .string()
    .trim()
    .min(1, 'Section title is required')
    .max(120, 'Section title must be 120 characters or fewer'),
  description: z
    .string()
    .trim()
    .max(200, 'Section description must be 200 characters or fewer')
    .optional()
    .nullable(),
});

export const outputTemplates = pgTable("output_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  format: text("format").notNull(),
  instructions: text("instructions"),
  requiredSections: jsonb("required_sections")
    .$type<z.infer<typeof outputTemplateSectionSchema>[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const outputTemplateValidationSchema = z.object({
  status: z.enum(['pass', 'fail']),
  missingSections: z.array(z.string()),
  checkedAt: z.string().datetime({ offset: true }),
});

export const platformSettings = pgTable("platform_settings", {
  id: varchar("id").primaryKey(),
  data: jsonb("data").$type<z.infer<typeof platformSettingsDataSchema>>().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const TOOL_POLICY_PROVIDERS = ['openai', 'anthropic', 'groq', 'perplexity'] as const;
export const toolPolicyProviderSchema = z.enum(TOOL_POLICY_PROVIDERS);
export type ToolPolicyProvider = z.infer<typeof toolPolicyProviderSchema>;

export const toolPolicyToolNameSchema = z
  .string()
  .trim()
  .min(1, 'Tool name must be provided')
  .max(100, 'Tool name must be 100 characters or less');

export const toolPolicies = pgTable(
  "tool_policies",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    provider: text("provider").notNull(),
    toolName: text("tool_name").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    safetyNote: text("safety_note"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("tool_policies_provider_tool_name_idx").on(table.provider, table.toolName),
    index("tool_policies_provider_idx").on(table.provider),
  ],
);

export const insertToolPolicySchema = createInsertSchema(toolPolicies, {
  provider: toolPolicyProviderSchema,
  toolName: toolPolicyToolNameSchema,
  isEnabled: z.boolean().default(true),
  safetyNote: z.string().trim().max(1000, 'Safety note must be 1000 characters or less').optional().nullable(),
});

export const updateToolPolicySchema = insertToolPolicySchema
  .extend({
    provider: toolPolicyProviderSchema.optional(),
    toolName: toolPolicyToolNameSchema.optional(),
    isEnabled: z.boolean().optional(),
    safetyNote: z.string().trim().max(1000, 'Safety note must be 1000 characters or less').optional().nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const toolPolicyCreateSchema = z.object({
  provider: toolPolicyProviderSchema,
  toolName: toolPolicyToolNameSchema,
  isEnabled: z.boolean().default(true),
  safetyNote: z.string().trim().max(1000, 'Safety note must be 1000 characters or less').optional().nullable(),
});

export const toolPolicyUpdateSchema = z
  .object({
    provider: toolPolicyProviderSchema.optional(),
    toolName: toolPolicyToolNameSchema.optional(),
    isEnabled: z.boolean().optional(),
    safetyNote: z.string().trim().max(1000, 'Safety note must be 1000 characters or less').optional().nullable(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const toolPolicyResponseSchema = z.object({
  id: z.string(),
  provider: toolPolicyProviderSchema,
  toolName: toolPolicyToolNameSchema,
  isEnabled: z.boolean(),
  safetyNote: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const systemPrompts = pgTable(
  "system_prompts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    version: integer("version").notNull(),
    label: text("label"),
    content: text("content").notNull(),
    notes: text("notes"),
    createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: 'set null' }),
    activatedByUserId: varchar("activated_by_user_id").references(() => users.id, { onDelete: 'set null' }),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    activatedAt: timestamp("activated_at"),
  },
  (table) => [
    unique("system_prompts_version_key").on(table.version),
    index("system_prompts_active_idx").on(table.isActive),
    uniqueIndex("system_prompts_single_active_idx").on(table.isActive).where(sql`${table.isActive} = true`),
  ],
);

export const releaseStatusSchema = z.enum(['draft', 'active', 'archived']);

export const releases = pgTable(
  "releases",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    version: integer("version").notNull(),
    label: text("label").notNull(),
    status: text("status").notNull().default('draft'),
    changeNotes: text("change_notes"),
    systemPromptId: varchar("system_prompt_id").references(() => systemPrompts.id, { onDelete: 'set null' }),
    expertIds: jsonb("expert_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    templateIds: jsonb("template_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    outputTemplateIds: jsonb("output_template_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    toolPolicyIds: jsonb("tool_policy_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    isActive: boolean("is_active").notNull().default(false),
    publishedAt: timestamp("published_at"),
    publishedByUserId: varchar("published_by_user_id").references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    unique("releases_version_key").on(table.version),
    index("releases_active_idx").on(table.isActive),
  ],
);

export const releaseAssetsSchema = z.object({
  systemPromptId: z.string().trim().min(1, 'System prompt is required').nullable().optional(),
  expertIds: z.array(z.string()).optional(),
  templateIds: z.array(z.string()).optional(),
  outputTemplateIds: z.array(z.string()).optional(),
  toolPolicyIds: z.array(z.string()).optional(),
});

export const releaseCreateSchema = releaseAssetsSchema.extend({
  label: z
    .string()
    .trim()
    .min(1, 'Release label is required')
    .max(120, 'Release label must be 120 characters or less'),
  changeNotes: z
    .string()
    .trim()
    .min(1, 'Change notes are required')
    .max(1000, 'Change notes must be 1000 characters or less')
    .optional(),
});

export const releaseTransitionSchema = z.object({
  changeNotes: z
    .string()
    .trim()
    .min(1, 'Change notes are required')
    .max(1000, 'Change notes must be 1000 characters or less'),
});

export const experts = pgTable("experts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  promptContent: text("prompt_content").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertExpertSchema = createInsertSchema(experts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateExpertSchema = insertExpertSchema.partial();

export type Expert = typeof experts.$inferSelect;
export type InsertExpert = z.infer<typeof insertExpertSchema>;
export type UpdateExpert = z.infer<typeof updateExpertSchema>;

export const proCoupons = pgTable("pro_coupons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  label: text("label"),
  description: text("description"),
  maxRedemptions: integer("max_redemptions"),
  redemptionCount: integer("redemption_count").notNull().default(0),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const proCouponRedemptions = pgTable("pro_coupon_redemptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  couponId: varchar("coupon_id").notNull().references(() => proCoupons.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  redeemedAt: timestamp("redeemed_at").defaultNow(),
}, (table) => [
  unique("unique_coupon_user").on(table.couponId, table.userId),
]);

export const proCouponCodeSchema = z.string()
  .trim()
  .min(3, 'Coupon code must be at least 3 characters')
  .max(64, 'Coupon code must be 64 characters or less')
  .regex(/^[A-Za-z0-9_-]+$/, 'Coupon codes may only contain letters, numbers, hyphens, and underscores.');

export const proCouponCreateSchema = z.object({
  code: proCouponCodeSchema,
  label: z.string().trim().max(120, 'Label must be 120 characters or less').optional().nullable(),
  description: z.string().trim().max(500, 'Description must be 500 characters or less').optional().nullable(),
  maxRedemptions: z.number().int().positive('Max redemptions must be a positive number').optional().nullable(),
  expiresAt: z.string().datetime({ offset: true }).optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export const proCouponUpdateSchema = proCouponCreateSchema.partial({
  code: true,
}).extend({
  isActive: z.boolean().optional(),
});

export const proCouponResponseSchema = z.object({
  id: z.string(),
  code: z.string(),
  label: z.string().nullable(),
  description: z.string().nullable(),
  maxRedemptions: z.number().int().positive().nullable(),
  redemptionCount: z.number().int().nonnegative(),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const systemPromptCreateSchema = z.object({
  label: z.string().trim().max(120, 'Label must be 120 characters or less').optional().nullable(),
  notes: z.string().trim().max(2000, 'Notes must be 2000 characters or less').optional().nullable(),
  content: z
    .string()
    .trim()
    .min(10, 'System prompt must be at least 10 characters long')
    .max(20000, 'System prompt must be 20000 characters or less'),
  activate: z.boolean().optional(),
});

export const systemPromptUpdateSchema = z
  .object({
    label: z.string().trim().max(120, 'Label must be 120 characters or less').optional().nullable(),
    notes: z.string().trim().max(2000, 'Notes must be 2000 characters or less').optional().nullable(),
    content: z
      .string()
      .trim()
      .min(10, 'System prompt must be at least 10 characters long')
      .max(20000, 'System prompt must be 20000 characters or less')
      .optional(),
    activate: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.activate === true ||
      data.content !== undefined ||
      data.label !== undefined ||
      data.notes !== undefined,
    {
      message: 'At least one field must be provided',
    },
  );

export const defaultPlatformSettings: z.infer<typeof platformSettingsDataSchema> = {
  planTiers: {
    free: {
      messageLimitPerDay: 50,
      allowedModels: ['compound'],
      features: [],
      fileUploadLimitMb: 10,
      chatHistoryEnabled: true,
      // Memory settings for free plan
      memoryEnabled: true,
      maxMemoriesPerUser: 100,
      // Template settings for free plan
      templatesEnabled: true,
      maxTemplatesPerUser: 5,
      allowedTemplateIds: [],
      // Project settings for free plan
      projectsEnabled: false,
      maxProjectsPerUser: 0,
      // Knowledge base settings for free plan
      knowledgeBaseEnabled: true,
      maxKnowledgeItems: 10,
      maxKnowledgeStorageMb: 50,
      maxTeamsPerOrg: 0,
      maxMembersPerTeam: 0,
    },
    pro: {
      messageLimitPerDay: null,
      allowedModels: [
        'gpt-5',
        'gpt-5-mini',
        'claude-4.5-sonnet',
        'compound',
        'sonar-pro',
        'sonar-deep-research',
      ],
      features: ['deep-research'],
      fileUploadLimitMb: 5 * 1024,
      chatHistoryEnabled: true,
      // Memory settings for pro plan
      memoryEnabled: true,
      maxMemoriesPerUser: null, // Unlimited for pro
      // Template settings for pro plan
      templatesEnabled: true,
      maxTemplatesPerUser: null, // Unlimited for pro
      allowedTemplateIds: [], // All templates available for pro
      // Project settings for pro plan
      projectsEnabled: true,
      maxProjectsPerUser: 100,
      // Knowledge base settings for pro plan
      knowledgeBaseEnabled: true,
      maxKnowledgeItems: null, // Unlimited for pro
      maxKnowledgeStorageMb: 2048,
      maxTeamsPerOrg: 0,
      maxMembersPerTeam: 0,
    },
    enterprise: {
      messageLimitPerDay: null,
      allowedModels: [
        'gpt-5',
        'gpt-5-mini',
        'claude-4.5-sonnet',
        'compound',
        'sonar-pro',
        'sonar-deep-research',
      ],
      features: ['deep-research', 'teams'],
      fileUploadLimitMb: 10 * 1024,
      chatHistoryEnabled: true,
      // Memory settings for enterprise plan
      memoryEnabled: true,
      maxMemoriesPerUser: null,
      // Template settings for enterprise plan
      templatesEnabled: true,
      maxTemplatesPerUser: null,
      allowedTemplateIds: [],
      // Project settings for enterprise plan
      projectsEnabled: true,
      maxProjectsPerUser: null, // Unlimited for enterprise
      // Knowledge base settings for enterprise plan
      knowledgeBaseEnabled: true,
      maxKnowledgeItems: null,
      maxKnowledgeStorageMb: 10240, // 10GB for enterprise
      maxTeamsPerOrg: 5,
      maxMembersPerTeam: 20,
    },
  },
  knowledgeBase: {
    enabled: true,
    maxItems: 200,
    maxStorageMb: 2048,
    allowUploads: true,
  },
  memory: {
    enabled: true,
    maxMemoriesPerUser: 500,
    retentionDays: null,
  },
  aiAgents: {
    enabled: true,
    maxAgentsPerUser: 20,
    allowAutonomousExecution: true,
  },
  templates: {
    enabled: true,
    maxTemplatesPerUser: 200,
  },
  projects: {
    enabled: true,
    maxProjectsPerUser: 100,
    maxMembersPerProject: 20,
  },
  teams: {
    enabled: true,
    maxTeamsPerOrg: 5,
    maxMembersPerTeam: 20,
    teamStorageQuotaMb: 10240, // 10GB default
    teamApiUsageLimit: null, // Unlimited by default
  },
  apiProviders: {
    openai: {
      enabled: true,
      defaultApiKey: null,
      allowUserProvidedKeys: true,
      allowedModels: ['gpt-5', 'gpt-5-mini', 'gpt-4.1-mini', 'gpt-4o-mini'],
      dailyRequestLimit: null,
      platformKeyAllowedModels: ['gpt-5', 'gpt-5-mini', 'gpt-4.1-mini', 'gpt-4o-mini'],
    },
    anthropic: {
      enabled: true,
      defaultApiKey: null,
      allowUserProvidedKeys: true,
      allowedModels: ['claude-4.5-sonnet'],
      dailyRequestLimit: null,
      platformKeyAllowedModels: ['claude-4.5-sonnet'],
    },
    groq: {
      enabled: true,
      defaultApiKey: null,
      allowUserProvidedKeys: true,
      allowedModels: ['compound'],
      dailyRequestLimit: null,
      platformKeyAllowedModels: ['compound'],
    },
    perplexity: {
      enabled: false,
      defaultApiKey: null,
      allowUserProvidedKeys: true,
      allowedModels: [],
      dailyRequestLimit: null,
      platformKeyAllowedModels: [],
    },
    n8n: {
      enabled: true,
      defaultApiKey: null,
      allowUserProvidedKeys: true,
      allowedModels: [],
      dailyRequestLimit: null,
      platformKeyAllowedModels: [],
    },
    notion: {
      enabled: true,
      defaultApiKey: null,
      allowUserProvidedKeys: true,
      allowedModels: [],
      dailyRequestLimit: null,
      platformKeyAllowedModels: [],
    },
  },
  legacyModels: [
    'gpt-4.1-mini',
    'gpt-4o-mini',
    'llama-3.1-8b-instant',
  ],
  planAllowlists: {
    free: { knowledgeBaseHosts: [] },
    pro: { knowledgeBaseHosts: [] },
    enterprise: { knowledgeBaseHosts: [] },
  },
};

export const chats = pgTable("chats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: 'set null' }), // Optional - null for regular chats, set for project chats
  title: text("title").notNull(),
  model: text("model").notNull().default("compound"),
  status: text("status").notNull().default("active"), // 'active', 'archived', 'deleted'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("chats_project_id_idx").on(table.projectId),
]);

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chatId: varchar("chat_id").notNull().references(() => chats.id, { onDelete: 'cascade' }),
  role: text("role").notNull(), // 'user' or 'assistant'
  content: text("content").notNull(),
  attachments: jsonb("attachments"), // For storing file attachment data
  metadata: jsonb("metadata"), // For storing additional data like tokens, etc.
  createdAt: timestamp("created_at").defaultNow(),
});

export const reactions = pgTable("reactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").notNull().references(() => messages.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text("type").notNull(), // 'thumbs_up' or 'thumbs_down'
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  // Unique constraint: one reaction per user per message
  uniqueUserMessage: unique().on(table.messageId, table.userId),
}));

export const usageMetrics = pgTable("usage_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  chatId: varchar("chat_id").notNull().references(() => chats.id, { onDelete: 'cascade' }),
  messageId: varchar("message_id").references(() => messages.id, { onDelete: 'cascade' }),
  model: text("model").notNull(),
  promptTokens: text("prompt_tokens").notNull().default("0"),
  completionTokens: text("completion_tokens").notNull().default("0"), 
  totalTokens: text("total_tokens").notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Analytics events for detailed API request tracking
export const analyticsEvents = pgTable("analytics_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").notNull().unique(), // Unique request identifier
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  chatId: varchar("chat_id").references(() => chats.id, { onDelete: 'cascade' }),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: 'set null' }),
  expertId: varchar("expert_id").references(() => experts.id, { onDelete: 'set null' }),
  templateId: varchar("template_id").references(() => outputTemplates.id, { onDelete: 'set null' }),
  provider: text("provider").notNull(), // 'groq', 'openai', 'anthropic', etc.
  model: text("model").notNull(),
  status: text("status").notNull(), // 'success' or 'error'
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  tokensEstimated: boolean("tokens_estimated").notNull().default(false),
  latencyMs: integer("latency_ms").notNull().default(0),
  costUsd: text("cost_usd").notNull().default("0"), // Stored as text for precision
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("analytics_events_user_id_idx").on(table.userId),
  index("analytics_events_provider_idx").on(table.provider),
  index("analytics_events_created_at_idx").on(table.createdAt),
  index("analytics_events_project_id_idx").on(table.projectId),
]);

// Provider pricing for cost calculation
export const providerPricing = pgTable("provider_pricing", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: text("provider").notNull(), // 'groq', 'openai', etc.
  model: text("model").notNull(),
  inputUsdPer1k: text("input_usd_per_1k").notNull(), // Stored as text for precision
  outputUsdPer1k: text("output_usd_per_1k").notNull(), // Stored as text for precision
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueProviderModel: unique().on(table.provider, table.model),
}));

export const oauthTokens = pgTable("oauth_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text("provider").notNull(), // 'google', 'microsoft', etc.
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  tokenExpiry: timestamp("token_expiry"),
  scopes: text("scopes").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueUserProvider: unique().on(table.userId, table.provider),
}));

export const userPreferences = pgTable("user_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  personalizationEnabled: text("personalization_enabled").notNull().default("false"),
  customInstructions: text("custom_instructions"),
  name: text("name"),
  occupation: text("occupation"),
  bio: text("about_me"),
  profileImageUrl: text("profile_image_url"),
  memories: jsonb("memories").$type<string[]>().default(sql`'[]'::jsonb`),
  chatHistoryEnabled: text("chat_history_enabled").notNull().default("true"),
  autonomousCodeExecution: text("autonomous_code_execution").notNull().default("true"),
  pinnedTeamIds: jsonb("pinned_team_ids").$type<string[]>().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const userApiKeys = pgTable("user_api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text("provider").notNull(),
  apiKey: text("api_key").notNull(),
  apiKeyLastFour: text("api_key_last_four").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueUserProvider: unique().on(table.userId, table.provider),
  userIdIdx: index("user_api_keys_user_id_idx").on(table.userId),
}));

export const n8nAgents = pgTable("n8n_agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  workflowId: text("workflow_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("inactive"),
  webhookUrl: text("webhook_url"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueUserWorkflow: unique().on(table.userId, table.workflowId),
  userIdIdx: index("n8n_agents_user_id_idx").on(table.userId),
}));

export const n8nAgentRuns = pgTable("n8n_agent_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull().references(() => n8nAgents.id, { onDelete: 'cascade' }),
  status: text("status").notNull().default("pending"),
  httpStatus: integer("http_status"),
  payloadExcerpt: text("payload_excerpt"),
  errorDetails: text("error_details"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  agentIdIdx: index("n8n_agent_runs_agent_id_idx").on(table.agentId),
  createdAtIdx: index("n8n_agent_runs_created_at_idx").on(table.createdAt),
}));

// Knowledge base for file uploads, URLs, and text that provides context to AI
// Supports multi-level knowledge inheritance: System -> Team -> User
export const knowledgeItems = pgTable("knowledge_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  scope: text("scope").notNull().default('user'), // 'system', 'team', 'user'
  scopeId: varchar("scope_id"), // null for system, team_id for team, user_id for user
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }), // Who created this item
  type: text("type").notNull(), // 'file', 'url', 'text'
  title: text("title").notNull(),
  content: text("content").notNull(), // Extracted/processed content for AI context
  sourceUrl: text("source_url"), // Original URL if type is 'url'
  fileName: text("file_name"), // Original filename if type is 'file'
  fileType: text("file_type"), // MIME type if type is 'file'
  fileSize: text("file_size"), // Size in bytes if type is 'file'
  metadata: jsonb("metadata"), // Additional metadata (page count, word count, etc.)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("knowledge_items_user_id_idx").on(table.userId),
  index("knowledge_items_scope_idx").on(table.scope),
  index("knowledge_items_scope_id_idx").on(table.scopeId),
]);

// Projects - isolated workspaces with their own knowledge and context
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  description: text("description"),
  customInstructions: text("custom_instructions"), // Project-specific AI instructions
  includeGlobalKnowledge: text("include_global_knowledge").notNull().default("false"),
  includeUserMemories: text("include_user_memories").notNull().default("false"),
  shareToken: varchar("share_token").unique(), // For shareable links - unique constraint creates index automatically
  isPublic: text("is_public").notNull().default("false"), // Whether project is accessible via share link
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("projects_user_id_idx").on(table.userId),
]);

// Project-specific knowledge (isolated from global knowledge)
export const projectKnowledge = pgTable("project_knowledge", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  type: text("type").notNull(), // 'file', 'url', 'text'
  title: text("title").notNull(),
  content: text("content").notNull(), // Extracted/processed content for AI context
  sourceUrl: text("source_url"), // Original URL if type is 'url'
  fileName: text("file_name"), // Original filename if type is 'file'
  fileType: text("file_type"), // MIME type if type is 'file'
  fileSize: text("file_size"), // Size in bytes if type is 'file'
  metadata: jsonb("metadata"), // Additional metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("project_knowledge_project_id_idx").on(table.projectId),
]);

// Project files - attachments associated with projects
export const projectFiles = pgTable("project_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(), // MIME type
  fileSize: text("file_size").notNull(), // Size in bytes
  fileUrl: text("file_url").notNull(), // Storage URL or base64
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("project_files_project_id_idx").on(table.projectId),
]);

// Password reset tokens for forgot password flow
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: text("used").notNull().default("false"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("password_reset_tokens_user_id_idx").on(table.userId),
  index("password_reset_tokens_token_idx").on(table.token),
]);

export const adminAuditActionSchema = z.enum([
  'user.status.changed',
  'user.plan.changed',
  'user.coupon.applied',
  'user.password.reset_requested',
  'user.role.changed',
]);

export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actorUserId: varchar("actor_user_id").references(() => users.id, { onDelete: 'set null' }),
  targetUserId: varchar("target_user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  action: text("action").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("admin_audit_logs_target_user_idx").on(table.targetUserId),
  index("admin_audit_logs_action_idx").on(table.action),
]);

// Models catalog for platform-wide AI model management
export const modelProviderSchema = z.enum(['groq', 'openai', 'anthropic', 'perplexity']);
export type ModelProvider = z.infer<typeof modelProviderSchema>;

export const modelCapabilitiesSchema = z.object({
  code: z.boolean().default(false),
  web: z.boolean().default(false),
  vision: z.boolean().default(false),
  audio: z.boolean().default(false),
  streaming: z.boolean().default(true),
});
export type ModelCapabilities = z.infer<typeof modelCapabilitiesSchema>;

export const modelPricingSchema = z.object({
  input_per_1k_usd: z.number().min(0),
  output_per_1k_usd: z.number().min(0),
});
export type ModelPricing = z.infer<typeof modelPricingSchema>;

export const models = pgTable("models", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: text("provider").notNull(), // 'groq', 'openai', 'anthropic', 'perplexity'
  modelId: text("model_id").notNull(), // e.g., 'llama-3-70b', 'gpt-4', 'claude-3-opus'
  displayName: text("display_name").notNull(),
  description: text("description"),
  capabilities: jsonb("capabilities").notNull().$type<ModelCapabilities>(),
  basePricing: jsonb("base_pricing").notNull().$type<ModelPricing>(),
  contextWindow: integer("context_window").default(8192),
  maxOutputTokens: integer("max_output_tokens"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  providerModelIdx: unique().on(table.provider, table.modelId),
  providerIdx: index("models_provider_idx").on(table.provider),
  isActiveIdx: index("models_is_active_idx").on(table.isActive),
}));

export const insertPlanSchema = createInsertSchema(plans)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true
  })
  .extend({
    slug: z.string().min(1).regex(/^[a-z0-9-]+$/, {
      message: 'Slug must be lowercase and may only include letters, numbers, or hyphens',
    }),
  });

export const updatePlanSchema = insertPlanSchema.partial();

export const insertUserSchema = createInsertSchema(users)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    role: userRoleSchema.optional(),
    status: userStatusSchema.optional(),
  });
export const chatStatusSchema = z.enum(['active', 'archived', 'deleted']);
export const insertChatSchema = createInsertSchema(chats).omit({ id: true, createdAt: true, updatedAt: true, status: true, userId: true }).extend({
  status: chatStatusSchema.optional()
});
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export const reactionTypeSchema = z.enum(['thumbs_up', 'thumbs_down']);
export const insertReactionSchema = createInsertSchema(reactions).omit({ id: true, createdAt: true }).extend({
  type: reactionTypeSchema
});
export const insertUsageMetricSchema = createInsertSchema(usageMetrics).omit({ id: true, createdAt: true });
export const analyticsEventStatusSchema = z.enum(['success', 'error']);
export const analyticsEventProviderSchema = z.enum(['groq', 'openai', 'anthropic', 'perplexity', 'compound']);
export const insertAnalyticsEventSchema = createInsertSchema(analyticsEvents).omit({ id: true, createdAt: true }).extend({
  status: analyticsEventStatusSchema,
  provider: analyticsEventProviderSchema,
});
export const insertProviderPricingSchema = createInsertSchema(providerPricing).omit({ id: true, createdAt: true, updatedAt: true }).extend({
  provider: analyticsEventProviderSchema,
});
export const oauthProviderSchema = z.enum(['google', 'microsoft']);
export const insertOAuthTokenSchema = createInsertSchema(oauthTokens).omit({ id: true, createdAt: true, updatedAt: true }).extend({
  provider: oauthProviderSchema
});
export const insertUserPreferencesSchema = createInsertSchema(userPreferences)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    pinnedTeamIds: z.array(z.string()).optional(),
  });
export const insertUserApiKeySchema = createInsertSchema(userApiKeys).omit({ id: true, createdAt: true, updatedAt: true });
export const knowledgeItemTypeSchema = z.enum(['file', 'url', 'text']);
export const knowledgeScopeSchema = z.enum(['system', 'team', 'user']);
export const insertKnowledgeItemSchema = createInsertSchema(knowledgeItems).omit({ id: true, createdAt: true, updatedAt: true }).extend({
  type: knowledgeItemTypeSchema,
  scope: knowledgeScopeSchema.default('user'),
  scopeId: z.string().nullable().optional(),
  createdBy: z.string().nullable().optional(),
});
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true, updatedAt: true, userId: true, shareToken: true });
export const projectKnowledgeTypeSchema = z.enum(['file', 'url', 'text']);
export const insertProjectKnowledgeSchema = createInsertSchema(projectKnowledge).omit({ id: true, createdAt: true, updatedAt: true }).extend({
  type: projectKnowledgeTypeSchema
});
export const insertProjectFileSchema = createInsertSchema(projectFiles).omit({ id: true, createdAt: true });
export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({ id: true, createdAt: true });
export const insertTemplateSchema = createInsertSchema(templates)
  .omit({ id: true, createdAt: true, updatedAt: true });
export const insertAdminAuditLogSchema = createInsertSchema(adminAuditLogs)
  .omit({ id: true, createdAt: true });

export const insertModelSchema = createInsertSchema(models)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    provider: modelProviderSchema,
    capabilities: modelCapabilitiesSchema,
    basePricing: modelPricingSchema,
  });
export const updateModelSchema = insertModelSchema.partial();

export const insertTeamSchema = createInsertSchema(teams)
  .omit({ id: true, createdAt: true, updatedAt: true });
export const insertTeamMemberSchema = createInsertSchema(teamMembers)
  .omit({ id: true, createdAt: true, joinedAt: true })
  .extend({
    role: teamRoleSchema.optional(),
    status: teamMemberStatusSchema.optional(),
  });
export const insertTeamInvitationSchema = createInsertSchema(teamInvitations)
  .omit({ id: true, createdAt: true, acceptedAt: true })
  .extend({
    role: teamRoleSchema.optional(),
    status: invitationStatusSchema.optional(),
  });

export const n8nAgentStatusSchema = z.enum(['inactive', 'active']);
export const insertN8nAgentSchema = createInsertSchema(n8nAgents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
}).extend({
  status: n8nAgentStatusSchema.optional(),
});

export const n8nAgentRunStatusSchema = z.enum(['pending', 'success', 'error']);
export const insertN8nAgentRunSchema = createInsertSchema(n8nAgentRuns).omit({
  id: true,
  createdAt: true,
}).extend({
  status: n8nAgentRunStatusSchema.optional(),
  httpStatus: z.number().int().nullable().optional(),
  payloadExcerpt: z.string().nullable().optional(),
  errorDetails: z.string().nullable().optional(),
});

export const insertPlatformSettingsSchema = createInsertSchema(platformSettings)
  .omit({ createdAt: true, updatedAt: true });

export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Plan = typeof plans.$inferSelect;
export type UpdatePlan = z.infer<typeof updatePlanSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type UpsertUser = typeof users.$inferInsert; // For Replit Auth upsert operations
export type UserStatus = z.infer<typeof userStatusSchema>;
export type PlanTierConfig = z.infer<typeof planTierSchema>;
export type KnowledgeBaseSettings = z.infer<typeof knowledgeBaseSettingsSchema>;
export type MemorySettings = z.infer<typeof memorySettingsSchema>;
export type AgentSettings = z.infer<typeof agentSettingsSchema>;
export type TemplateSettings = z.infer<typeof templateSettingsSchema>;
export type ProjectSettings = z.infer<typeof projectSettingsSchema>;
export type ProviderSettings = z.infer<typeof providerSettingsSchema>;
export type PlanAllowlistConfig = z.infer<typeof planAllowlistSchema>;
export type PlatformSettingsData = z.infer<typeof platformSettingsDataSchema>;
export type InsertPlatformSettings = z.infer<typeof insertPlatformSettingsSchema>;
export type PlatformSettings = typeof platformSettings.$inferSelect;
export type UserRole = z.infer<typeof userRoleSchema>;
export type InsertChat = z.infer<typeof insertChatSchema>;
export type Chat = typeof chats.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertReaction = z.infer<typeof insertReactionSchema>;
export type Reaction = typeof reactions.$inferSelect;
export type InsertUsageMetric = z.infer<typeof insertUsageMetricSchema>;
export type UsageMetric = typeof usageMetrics.$inferSelect;
export type InsertAnalyticsEvent = z.infer<typeof insertAnalyticsEventSchema>;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type InsertProviderPricing = z.infer<typeof insertProviderPricingSchema>;
export type ProviderPricing = typeof providerPricing.$inferSelect;
export type InsertOAuthToken = z.infer<typeof insertOAuthTokenSchema>;
export type OAuthToken = typeof oauthTokens.$inferSelect;
export type InsertAdminAuditLog = z.infer<typeof insertAdminAuditLogSchema>;
export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
export type AdminAuditAction = z.infer<typeof adminAuditActionSchema>;
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teams.$inferSelect;
export type TeamRole = z.infer<typeof teamRoleSchema>;
export type TeamMemberStatus = z.infer<typeof teamMemberStatusSchema>;
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type TeamMember = typeof teamMembers.$inferSelect;
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;
export type InsertTeamInvitation = z.infer<typeof insertTeamInvitationSchema>;
export type TeamInvitation = typeof teamInvitations.$inferSelect;
export type TeamSettings = z.infer<typeof teamSettingsSchema>;
// duplicate export avoided above; keeping single canonical export near table/type defs
export type InsertUserPreferences = z.infer<typeof insertUserPreferencesSchema>;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type InsertUserApiKey = z.infer<typeof insertUserApiKeySchema>;
export type UserApiKey = typeof userApiKeys.$inferSelect;
export type InsertKnowledgeItem = z.infer<typeof insertKnowledgeItemSchema>;
// duplicate export avoided above; keeping canonical export earlier
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertProjectKnowledge = z.infer<typeof insertProjectKnowledgeSchema>;
export type ProjectKnowledge = typeof projectKnowledge.$inferSelect;
export type InsertProjectFile = z.infer<typeof insertProjectFileSchema>;
export type ProjectFile = typeof projectFiles.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type Template = typeof templates.$inferSelect;
export type OutputTemplateCategory = z.infer<typeof outputTemplateCategorySchema>;
export type OutputTemplateFormat = z.infer<typeof outputTemplateFormatSchema>;
export type OutputTemplateSection = z.infer<typeof outputTemplateSectionSchema>;
export type OutputTemplate = typeof outputTemplates.$inferSelect;
export type InsertOutputTemplate = typeof outputTemplates.$inferInsert;
export type OutputTemplateValidation = z.infer<typeof outputTemplateValidationSchema>;
export type Release = typeof releases.$inferSelect;
export type InsertRelease = typeof releases.$inferInsert;
export type ReleaseStatus = z.infer<typeof releaseStatusSchema>;
export type N8nAgentStatus = z.infer<typeof n8nAgentStatusSchema>;
export type InsertN8nAgent = z.infer<typeof insertN8nAgentSchema>;
export type N8nAgent = typeof n8nAgents.$inferSelect;
export type N8nAgentRunStatus = z.infer<typeof n8nAgentRunStatusSchema>;
export type InsertN8nAgentRun = z.infer<typeof insertN8nAgentRunSchema>;
export type N8nAgentRun = typeof n8nAgentRuns.$inferSelect;
export type InsertToolPolicy = z.infer<typeof insertToolPolicySchema>;
export type ToolPolicy = typeof toolPolicies.$inferSelect;
export type UpdateToolPolicy = z.infer<typeof updateToolPolicySchema>;
export type InsertProCoupon = typeof proCoupons.$inferInsert;
export type ProCoupon = typeof proCoupons.$inferSelect;
export type InsertProCouponRedemption = typeof proCouponRedemptions.$inferInsert;
export type ProCouponRedemption = typeof proCouponRedemptions.$inferSelect;
export type InsertSystemPrompt = typeof systemPrompts.$inferInsert;
export type SystemPrompt = typeof systemPrompts.$inferSelect;
export type SystemPromptCreateInput = z.infer<typeof systemPromptCreateSchema>;
export type SystemPromptUpdateInput = z.infer<typeof systemPromptUpdateSchema>;
export type InsertModel = z.infer<typeof insertModelSchema>;
export type UpdateModel = z.infer<typeof updateModelSchema>;
export type Model = typeof models.$inferSelect;

// File Attachment Schema
export const attachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number(),
  url: z.string(),
});

export type Attachment = z.infer<typeof attachmentSchema>;

// Message Metadata Schema - for tracking feature toggles and usage
export const messageMetadataSchema = z.object({
  // Feature toggles for this message
  deepVoyageEnabled: z.boolean().optional(), // Deep research toggle

  // High-level goal/summary for the request
  taskSummary: z.string().max(240, 'Task summary must be 240 characters or fewer').optional(),

  // Token usage (if tracked per-message)
  promptTokens: z.number().optional(),
  completionTokens: z.number().optional(),
  totalTokens: z.number().optional(),

  // Other metadata
  model: z.string().optional(),
  executedTools: z.array(z.string()).optional(), // Track which tools were actually used
  thinkingContent: z.string().optional(), // AI reasoning/thinking process
  outputTemplateId: z.string().uuid().optional(),
  outputTemplateName: z.string().optional(),
  outputTemplateCategory: outputTemplateCategorySchema.optional(),
  outputTemplateFormat: outputTemplateFormatSchema.optional(),
  outputTemplateValidation: outputTemplateValidationSchema.optional(),
}).optional();

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

export const apiProviderSchema = z.enum(['openai', 'anthropic', 'groq', 'perplexity', 'n8n', 'notion']);
export type ApiProvider = z.infer<typeof apiProviderSchema>;

// AI Model Configuration
// Use the lowercase provider union defined above via zod
// (groq | openai | anthropic | perplexity)
// Avoid redefining ModelProvider to prevent duplicate identifier errors.

export type ModelCapability = 'chat' | 'vision' | 'audio' | 'search' | 'thinking' | 'code';
export type ModelStatus = 'current' | 'legacy';

export interface AIModel {
  id: string;
  name: string;
  description: string;
  provider: ModelProvider; // lowercase provider id
  capabilities: ModelCapability[];
  maxTokens?: number;
  costPer1kTokens?: {
    input: number;
    output: number;
  };
  status?: ModelStatus;
}

export const AI_MODELS: AIModel[] = [
  // OpenAI Models (Main)
  {
    id: 'gpt-5',
    name: 'GPT-5',
    description: 'OpenAI flagship model for deep reasoning, code, and multimodal tasks',
    provider: 'openai',
    capabilities: ['chat', 'vision', 'search', 'thinking', 'code'],
    maxTokens: 200000,
  },
  {
    id: 'gpt-5-mini',
    name: 'GPT-5 Mini',
    description: 'Compact GPT-5 variant optimized for speed and cost efficiency',
    provider: 'openai',
    capabilities: ['chat', 'search', 'code'],
    maxTokens: 128000,
  },
  // Anthropic / Claude Models (Main)
  {
    id: 'claude-4.5-sonnet',
    name: 'Claude 4.5 Sonnet',
    description: 'Claude Sonnet tuned for balanced quality with web search and coding support',
    provider: 'anthropic',
    capabilities: ['chat', 'vision', 'search', 'thinking', 'code'],
    maxTokens: 200000,
  },

  // Groq Models (Main)
  {
    id: 'compound',
    name: 'Titan-V',
    description: "Atlas' flagship model that blends fast inference with autonomous research, web tools, and code execution.",
    provider: 'groq',
    capabilities: ['chat', 'search', 'code'],
    maxTokens: 32768,
  },

  // Perplexity Models (Main)
  {
    id: 'sonar-deep-research',
    name: 'Sonar Deep Research',
    description: 'Perplexity multi-hop research model with web search',
    provider: 'perplexity',
    capabilities: ['chat', 'search', 'thinking'],
    maxTokens: 4096,
  },
  {
    id: 'sonar-pro',
    name: 'Sonar Pro',
    description: 'Perplexity live web search model for quick factual answers',
    provider: 'perplexity',
    capabilities: ['chat', 'search'],
    maxTokens: 4096,
  },

  // Legacy Models
  {
    id: 'gpt-4.1-mini',
    name: 'GPT-4.1 Mini',
    description: 'Early GPT-4.1 preview model maintained for compatibility',
    provider: 'openai',
    capabilities: ['chat', 'vision', 'code'],
    maxTokens: 128000,
    status: 'legacy',
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Legacy GPT-4o lightweight variant',
    provider: 'openai',
    capabilities: ['chat', 'search', 'code'],
    maxTokens: 128000,
    status: 'legacy',
  },
  {
    id: 'llama-3.1-8b-instant',
    name: 'Vega-3',
    description: 'Legacy high-speed inference model optimized for rapid responses',
    provider: 'groq',
    capabilities: ['chat'],
    maxTokens: 32768,
    status: 'legacy',
  },
];

export interface FeatureToggle {
  id: string;
  label: string;
  description: string;
  requiresModelIds?: string[];
  requiresCapabilities?: ModelCapability[];
}

export const FEATURE_TOGGLES: FeatureToggle[] = [
  {
    id: 'deep-research',
    label: 'Deep Research (Deep Voyage)',
    description:
      'Enables the Deep Voyage button for multi-hop research workflows using thinking + search capable models like Sonar Deep Research.',
    requiresModelIds: ['sonar-deep-research'],
    requiresCapabilities: ['search', 'thinking'],
  },
];

// Helper functions for models
export const getChatCapableModels = () => AI_MODELS.filter(model => model.capabilities.includes('chat'));

export const getModelsByProvider = (provider: ModelProvider) => AI_MODELS.filter(model => model.provider === provider);

export const getModelById = (id: string) => AI_MODELS.find(model => model.id === id);

export const getDefaultModel = () => AI_MODELS.find(model => model.id === 'compound') || AI_MODELS[0];

// Effective Capabilities Schema - Single source of truth for feature visibility
export const effectiveCapabilitiesSchema = z.object({
  // User's plan information
  plan: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    tier: z.string(), // 'free', 'pro', 'enterprise', etc.
    isProTier: z.boolean(),
  }),
  // Usage limits
  limits: z.object({
    daily_message_limit: z.number().int().nullable(), // null = unlimited
    max_file_size_mb: z.number().int(),
    storage_quota_gb: z.number().int(),
  }),
  // Feature access and upsell flags
  features: z.object({
    experts: z.object({
      allowed: z.boolean(),
      upsell: z.boolean(),
    }),
    templates: z.object({
      allowed: z.boolean(),
      upsell: z.boolean(),
    }),
    models: z.object({
      allowed: z.boolean(),
    }),
    kb: z.object({
      system: z.boolean(),
      team: z.boolean(),
      user: z.boolean(),
    }),
    memory: z.boolean(),
    agents: z.boolean(),
    api_access: z.object({
      allowed: z.boolean(),
      upsell: z.boolean(),
    }),
  }),
  // Allowlists for specific resources
  allowlists: z.object({
    experts: z.array(z.string()), // Expert IDs user can access
    templates: z.array(z.string()), // Template IDs user can access
    models: z.array(z.string()), // Model IDs user can access
  }),
  // Team configuration (for enterprise users)
  teams: z.object({
    enabled: z.boolean(),
    maxTeamsPerOrg: z.number().int(),
    maxMembersPerTeam: z.number().int(),
  }),
});

// Effective Capabilities type
export type EffectiveCapabilities = z.infer<typeof effectiveCapabilitiesSchema>;

// Knowledge item types
export type KnowledgeScope = z.infer<typeof knowledgeScopeSchema>;
export type KnowledgeItem = typeof knowledgeItems.$inferSelect;

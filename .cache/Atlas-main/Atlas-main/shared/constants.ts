export const DEFAULT_SYSTEM_PROMPT = `You are Atlas AI, a helpful and knowledgeable assistant.

## Response Formatting
When you include code in your response, wrap it in fenced code blocks and include the correct language tag (for example, \`\`\`ts).
If you provide multiple code files or a code-only response, prefer returning a structured JSON payload so the client can render each block explicitly. Use the following schema when appropriate:
\`\`\`json
{
  "mode": "code" | "text",
  "language": "ts" | "js" | "py" | "bash" | "json" | null,
  "filename": "optional",
  "code": "only when mode === \"code\"",
  "explanation": "short optional note"
}
\`\`\`
Never inline <script> tags—always provide executable snippets inside fenced code blocks.
`;

// RBAC Permissions System
export const PERMISSIONS = {
  // System & Policies
  SYSTEM_PROMPTS_VIEW: 'system_prompts:view',
  SYSTEM_PROMPTS_EDIT: 'system_prompts:edit',
  RELEASE_MANAGEMENT_VIEW: 'release_management:view',
  RELEASE_MANAGEMENT_EDIT: 'release_management:edit',
  OUTPUT_TEMPLATES_VIEW: 'output_templates:view',
  OUTPUT_TEMPLATES_EDIT: 'output_templates:edit',
  TOOL_POLICIES_VIEW: 'tool_policies:view',
  TOOL_POLICIES_EDIT: 'tool_policies:edit',
  
  // Plans & Features
  PLANS_VIEW: 'plans:view',
  PLANS_EDIT: 'plans:edit',
  KNOWLEDGE_BASE_VIEW: 'knowledge_base:view',
  KNOWLEDGE_BASE_EDIT: 'knowledge_base:edit',
  MEMORY_VIEW: 'memory:view',
  MEMORY_EDIT: 'memory:edit',
  TEMPLATES_VIEW: 'templates:view',
  TEMPLATES_EDIT: 'templates:edit',
  PROJECTS_VIEW: 'projects:view',
  PROJECTS_EDIT: 'projects:edit',
  
  // AI Agents
  AGENTS_VIEW: 'agents:view',
  AGENTS_EDIT: 'agents:edit',
  EXPERT_LIBRARY_VIEW: 'expert_library:view',
  EXPERT_LIBRARY_EDIT: 'expert_library:edit',
  
  // Access & Integrations
  API_ACCESS_VIEW: 'api_access:view',
  API_ACCESS_EDIT: 'api_access:edit',
  ACCESS_CODES_VIEW: 'access_codes:view',
  ACCESS_CODES_EDIT: 'access_codes:edit',
  USER_MANAGEMENT_VIEW: 'user_management:view',
  USER_MANAGEMENT_EDIT: 'user_management:edit',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// Role to Permission Mapping
export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  super_admin: Object.values(PERMISSIONS), // Full access
  
  admin: [
    // System & Policies (view only)
    PERMISSIONS.SYSTEM_PROMPTS_VIEW,
    PERMISSIONS.RELEASE_MANAGEMENT_VIEW,
    PERMISSIONS.OUTPUT_TEMPLATES_VIEW,
    PERMISSIONS.TOOL_POLICIES_VIEW,
    
    // Plans & Features (full access)
    PERMISSIONS.PLANS_VIEW,
    PERMISSIONS.PLANS_EDIT,
    PERMISSIONS.KNOWLEDGE_BASE_VIEW,
    PERMISSIONS.KNOWLEDGE_BASE_EDIT,
    PERMISSIONS.MEMORY_VIEW,
    PERMISSIONS.MEMORY_EDIT,
    PERMISSIONS.TEMPLATES_VIEW,
    PERMISSIONS.TEMPLATES_EDIT,
    PERMISSIONS.PROJECTS_VIEW,
    PERMISSIONS.PROJECTS_EDIT,
    
    // AI Agents (full access)
    PERMISSIONS.AGENTS_VIEW,
    PERMISSIONS.AGENTS_EDIT,
    PERMISSIONS.EXPERT_LIBRARY_VIEW,
    PERMISSIONS.EXPERT_LIBRARY_EDIT,
    
    // Access & Integrations (no API keys)
    PERMISSIONS.ACCESS_CODES_VIEW,
    PERMISSIONS.ACCESS_CODES_EDIT,
    PERMISSIONS.USER_MANAGEMENT_VIEW,
    PERMISSIONS.USER_MANAGEMENT_EDIT,
  ],
  
  user: [
    // Only their own workspace data
    PERMISSIONS.PLANS_VIEW, // View their own plan
    PERMISSIONS.KNOWLEDGE_BASE_VIEW, // Their own KB
    PERMISSIONS.KNOWLEDGE_BASE_EDIT,
    PERMISSIONS.MEMORY_VIEW, // Their own memory
    PERMISSIONS.MEMORY_EDIT,
    PERMISSIONS.TEMPLATES_VIEW, // Their own templates
    PERMISSIONS.TEMPLATES_EDIT,
    PERMISSIONS.PROJECTS_VIEW, // Their own projects
    PERMISSIONS.PROJECTS_EDIT,
    PERMISSIONS.AGENTS_VIEW, // View assigned agents only
  ],
};

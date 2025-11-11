import { PERMISSIONS, type Permission } from './constants';

export type AdminIconName =
  | 'Settings'
  | 'Package'
  | 'Bot'
  | 'Key'
  | 'FileText'
  | 'Users'
  | 'Building2'
  | 'CreditCard'
  | 'Brain'
  | 'LifeBuoy';

export interface AdminApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description?: string;
}

export type AdminRouteGroupId =
  | 'system-policies'
  | 'plans-features'
  | 'ai-agents'
  | 'access-integrations';

export interface AdminDashboardCardContent {
  title: string;
  description: string;
  actionLabel: string;
  icon: AdminIconName;
}

export interface AdminRouteDefinition {
  id: string;
  label: string;
  path: string;
  requiredPermission: Permission;
  apis: AdminApiEndpoint[];
  groupId?: AdminRouteGroupId;
  pageHeader?: {
    title: string;
    description?: string;
  };
  dashboardCards?: {
    system?: AdminDashboardCardContent;
    workspace?: AdminDashboardCardContent;
  };
}

export interface AdminRouteGroupDefinition {
  id: AdminRouteGroupId;
  label: string;
  icon: AdminIconName;
  requiredPermission: Permission;
  routeIds: string[];
}

const ADMIN_ROUTE_CATALOG: Record<string, AdminRouteDefinition> = {
  'system-prompts': {
    id: 'system-prompts',
    label: 'System Prompts',
    path: '/admin/system-prompts',
    requiredPermission: PERMISSIONS.SYSTEM_PROMPTS_VIEW,
    apis: [
      { method: 'GET', path: '/api/admin/system-prompts' },
      { method: 'POST', path: '/api/admin/system-prompts' },
      { method: 'PATCH', path: '/api/admin/system-prompts/:id' },
    ],
    groupId: 'system-policies',
    dashboardCards: {
      system: {
        title: 'System Prompts',
        description: 'Define the default operating instructions used across every agent.',
        actionLabel: 'Manage prompts',
        icon: 'Bot',
      },
    },
  },
  'output-templates': {
    id: 'output-templates',
    label: 'Output Templates',
    path: '/admin/output-templates',
    requiredPermission: PERMISSIONS.OUTPUT_TEMPLATES_VIEW,
    apis: [
      { method: 'GET', path: '/api/admin/output-templates' },
      { method: 'POST', path: '/api/admin/output-templates' },
      { method: 'PATCH', path: '/api/admin/output-templates/:id' },
      { method: 'DELETE', path: '/api/admin/output-templates/:id' },
    ],
    groupId: 'system-policies',
    dashboardCards: {
      system: {
        title: 'Output Templates',
        description: 'Standardize structured responses and reusable formatting blocks.',
        actionLabel: 'Manage templates',
        icon: 'FileText',
      },
    },
  },
  'tool-policies': {
    id: 'tool-policies',
    label: 'Tool Policies & Release Notes',
    path: '/admin/tool-policies',
    requiredPermission: PERMISSIONS.TOOL_POLICIES_VIEW,
    apis: [
      { method: 'GET', path: '/api/admin/tool-policies' },
      { method: 'POST', path: '/api/admin/tool-policies' },
      { method: 'PATCH', path: '/api/admin/tool-policies/:id' },
      { method: 'DELETE', path: '/api/admin/tool-policies/:id' },
      { method: 'GET', path: '/api/admin/releases' },
      { method: 'POST', path: '/api/admin/releases' },
      { method: 'POST', path: '/api/admin/releases/:id/publish' },
      { method: 'POST', path: '/api/admin/releases/:id/rollback' },
    ],
    groupId: 'system-policies',
    dashboardCards: {
      system: {
        title: 'Tool Policies & Release Notes',
        description: 'Control access to tools and publish safety or release updates.',
        actionLabel: 'Manage policies',
        icon: 'Settings',
      },
    },
  },
  plans: {
    id: 'plans',
    label: 'Plans & Models',
    path: '/admin/plans',
    requiredPermission: PERMISSIONS.PLANS_VIEW,
    apis: [
      { method: 'GET', path: '/api/admin/settings' },
      { method: 'PUT', path: '/api/admin/settings' },
    ],
    groupId: 'plans-features',
    pageHeader: {
      title: 'Plan Configuration',
      description: 'Configure feature access and usage limits for free and paid tiers.',
    },
    dashboardCards: {
      system: {
        title: 'Plans & Pricing',
        description: 'Configure billing packages, seat limits, and upgrade flows.',
        actionLabel: 'Configure plans',
        icon: 'CreditCard',
      },
      workspace: {
        title: 'User Plans & Subscriptions',
        description: 'Track plan mix and upgrade opportunities.',
        actionLabel: 'Manage plans',
        icon: 'CreditCard',
      },
    },
  },
  'knowledge-base': {
    id: 'knowledge-base',
    label: 'Knowledge Base',
    path: '/admin/knowledge-base',
    requiredPermission: PERMISSIONS.KNOWLEDGE_BASE_VIEW,
    apis: [
      { method: 'GET', path: '/api/admin/settings' },
      { method: 'PUT', path: '/api/admin/settings' },
      { method: 'GET', path: '/api/admin/knowledge' },
    ],
    groupId: 'plans-features',
    pageHeader: {
      title: 'Knowledge Base',
      description: 'Configure knowledge base access, storage limits, and upload permissions.',
    },
  },
  memory: {
    id: 'memory',
    label: 'Memory',
    path: '/admin/memory',
    requiredPermission: PERMISSIONS.MEMORY_VIEW,
    apis: [
      { method: 'GET', path: '/api/admin/settings' },
      { method: 'PUT', path: '/api/admin/settings' },
      { method: 'GET', path: '/api/admin/knowledge' },
    ],
    groupId: 'plans-features',
    pageHeader: {
      title: 'Memory & Personalization',
      description: 'Configure long-term memory retention and personalization settings for AI assistants.',
    },
    dashboardCards: {
      workspace: {
        title: 'User Knowledge & Memory',
        description: 'Audit stored knowledge bases and memories.',
        actionLabel: 'Review memory',
        icon: 'Brain',
      },
    },
  },
  'templates-projects': {
    id: 'templates-projects',
    label: 'Templates & Projects',
    path: '/admin/templates-projects',
    requiredPermission: PERMISSIONS.TEMPLATES_VIEW,
    apis: [
      { method: 'GET', path: '/api/admin/templates' },
      { method: 'POST', path: '/api/admin/templates' },
      { method: 'PATCH', path: '/api/admin/templates/:id' },
      { method: 'DELETE', path: '/api/admin/templates/:id' },
      { method: 'GET', path: '/api/admin/templates/:id/file' },
      { method: 'GET', path: '/api/admin/settings' },
      { method: 'PUT', path: '/api/admin/settings' },
    ],
    groupId: 'plans-features',
    pageHeader: {
      title: 'Templates & Projects',
      description: 'Configure reusable templates and collaborative project workspaces for your teams.',
    },
  },
  agents: {
    id: 'agents',
    label: 'AI Agents',
    path: '/admin/agents',
    requiredPermission: PERMISSIONS.AGENTS_VIEW,
    apis: [
      { method: 'GET', path: '/api/admin/settings' },
      { method: 'PUT', path: '/api/admin/settings' },
      { method: 'GET', path: '/api/admin/agents' },
    ],
    groupId: 'ai-agents',
    pageHeader: {
      title: 'AI Agents',
      description: 'Configure custom AI agents and autonomous execution settings.',
    },
    dashboardCards: {
      system: {
        title: 'AI Agents & Library',
        description: 'Manage shared assistants, experts, and deployment presets.',
        actionLabel: 'Manage agents',
        icon: 'Bot',
      },
      workspace: {
        title: 'User AI Agents',
        description: 'See deployed assistants and their status.',
        actionLabel: 'View agents',
        icon: 'Bot',
      },
    },
  },
  'expert-library': {
    id: 'expert-library',
    label: 'Expert Library',
    path: '/admin/experts',
    requiredPermission: PERMISSIONS.EXPERT_LIBRARY_VIEW,
    apis: [
      { method: 'GET', path: '/api/admin/experts' },
      { method: 'POST', path: '/api/admin/experts' },
      { method: 'PATCH', path: '/api/admin/experts/:id' },
      { method: 'DELETE', path: '/api/admin/experts/:id' },
    ],
    groupId: 'ai-agents',
  },
  'api-access': {
    id: 'api-access',
    label: 'API Access',
    path: '/admin/api-access',
    requiredPermission: PERMISSIONS.API_ACCESS_VIEW,
    apis: [
      { method: 'GET', path: '/api/admin/settings' },
      { method: 'PUT', path: '/api/admin/settings' },
    ],
    groupId: 'access-integrations',
    pageHeader: {
      title: 'API Access',
      description: 'Configure API providers, authentication, and model availability.',
    },
    dashboardCards: {
      system: {
        title: 'Integrations / API Access',
        description: 'Connect external services, APIs, and third-party platforms.',
        actionLabel: 'Manage integrations',
        icon: 'Key',
      },
    },
  },
  'access-codes': {
    id: 'access-codes',
    label: 'Access Codes',
    path: '/admin/access-codes',
    requiredPermission: PERMISSIONS.ACCESS_CODES_VIEW,
    apis: [
      { method: 'GET', path: '/api/admin/pro-coupons' },
      { method: 'POST', path: '/api/admin/pro-coupons' },
      { method: 'PUT', path: '/api/admin/pro-coupons/:id' },
      { method: 'DELETE', path: '/api/admin/pro-coupons/:id' },
    ],
    groupId: 'access-integrations',
  },
  'user-management': {
    id: 'user-management',
    label: 'User Management',
    path: '/admin/users',
    requiredPermission: PERMISSIONS.USER_MANAGEMENT_VIEW,
    apis: [
      { method: 'GET', path: '/api/admin/users' },
      { method: 'PATCH', path: '/api/admin/users/:id/status' },
      { method: 'PATCH', path: '/api/admin/users/:id/role' },
      { method: 'PATCH', path: '/api/admin/users/:id/plan' },
      { method: 'POST', path: '/api/admin/users/:id/reset-password' },
      { method: 'POST', path: '/api/admin/users/:id/coupons' },
      { method: 'GET', path: '/api/admin/users/:id/audit-logs' },
    ],
    groupId: 'access-integrations',
    dashboardCards: {
      workspace: {
        title: 'User Management',
        description: 'Monitor account growth and administrator coverage.',
        actionLabel: 'Manage users',
        icon: 'Users',
      },
    },
  },
  organizations: {
    id: 'organizations',
    label: 'Organizations & Teams',
    path: '/admin/orgs',
    requiredPermission: PERMISSIONS.USER_MANAGEMENT_VIEW,
    apis: [
      { method: 'GET', path: '/api/admin/orgs' },
    ],
    dashboardCards: {
      workspace: {
        title: 'Organizations / Teams (Enterprise only)',
        description: 'Review workspace adoption and team size.',
        actionLabel: 'Manage teams',
        icon: 'Building2',
      },
    },
  },
  tickets: {
    id: 'tickets',
    label: 'Support Tickets',
    path: '/admin/tickets',
    requiredPermission: PERMISSIONS.USER_MANAGEMENT_VIEW,
    apis: [
      { method: 'GET', path: '/api/admin/tickets' },
    ],
    dashboardCards: {
      workspace: {
        title: 'Support / Tickets',
        description: 'Keep pace with customer support volume.',
        actionLabel: 'View tickets',
        icon: 'LifeBuoy',
      },
    },
  },
};

export type AdminRouteId = keyof typeof ADMIN_ROUTE_CATALOG;
export interface AdminRouteMapEntry {
  path: string;
  api?: string;
}

export type AdminRouteScope = 'system' | 'user';
export type AdminRoutesMap = Record<AdminRouteScope, Partial<Record<AdminRouteId, AdminRouteMapEntry>>>;

export const ADMIN_ROUTE_GROUPS: readonly AdminRouteGroupDefinition[] = [
  {
    id: 'system-policies',
    label: 'System & Policies',
    icon: 'Settings',
    requiredPermission: PERMISSIONS.SYSTEM_PROMPTS_VIEW,
    routeIds: ['system-prompts', 'output-templates', 'tool-policies'],
  },
  {
    id: 'plans-features',
    label: 'Plans & Features',
    icon: 'Package',
    requiredPermission: PERMISSIONS.PLANS_VIEW,
    routeIds: ['plans', 'knowledge-base', 'memory', 'templates-projects'],
  },
  {
    id: 'ai-agents',
    label: 'AI Agents',
    icon: 'Bot',
    requiredPermission: PERMISSIONS.AGENTS_VIEW,
    routeIds: ['agents', 'expert-library'],
  },
  {
    id: 'access-integrations',
    label: 'Access & Integrations',
    icon: 'Key',
    requiredPermission: PERMISSIONS.API_ACCESS_VIEW,
    routeIds: ['api-access', 'access-codes', 'user-management'],
  },
] as const;

export const ADMIN_NAV_GROUPS = ADMIN_ROUTE_GROUPS.map((group) => ({
  id: group.id,
  label: group.label,
  icon: group.icon,
  requiredPermission: group.requiredPermission,
  items: group.routeIds
    .map((routeId) => ADMIN_ROUTE_CATALOG[routeId])
    .filter(Boolean)
    .map((route) => ({
      id: route.id,
      label: route.label,
      path: route.path,
      requiredPermission: route.requiredPermission,
    })),
}));

const ADMIN_ROUTE_LIST = Object.values(ADMIN_ROUTE_CATALOG);

const buildScopedAdminRoutes = (): AdminRoutesMap => {
  return ADMIN_ROUTE_LIST.reduce<AdminRoutesMap>(
    (accumulator, route) => {
      const primaryApi = route.apis[0]?.path;

      if (route.dashboardCards?.system) {
        accumulator.system[route.id as AdminRouteId] = { path: route.path, api: primaryApi };
      }

      if (route.dashboardCards?.workspace) {
        accumulator.user[route.id as AdminRouteId] = { path: route.path, api: primaryApi };
      }

      return accumulator;
    },
    { system: {}, user: {} } as AdminRoutesMap,
  );
};

export const ADMIN_ROUTES: AdminRoutesMap = buildScopedAdminRoutes();

export const ADMIN_ROUTES_BY_PATH: Record<string, AdminRouteDefinition> = ADMIN_ROUTE_LIST.reduce(
  (accumulator, route) => {
    accumulator[route.path] = route;
    return accumulator;
  },
  {} as Record<string, AdminRouteDefinition>,
);

export function getAdminRouteById(routeId: AdminRouteId): AdminRouteDefinition {
  return ADMIN_ROUTE_CATALOG[routeId];
}

export function findAdminRouteByPath(path: string): AdminRouteDefinition | undefined {
  return ADMIN_ROUTES_BY_PATH[path];
}

export function getDashboardRoutes(category: 'system' | 'workspace'): AdminRouteDefinition[] {
  return ADMIN_ROUTE_LIST.filter((route) => route.dashboardCards?.[category]);
}

export function getRouteDashboardCard(
  route: AdminRouteDefinition,
  category: 'system' | 'workspace',
): AdminDashboardCardContent | undefined {
  return route.dashboardCards?.[category];
}

export function getAdminRouteGroupById(
  groupId: AdminRouteGroupId,
): AdminRouteGroupDefinition | undefined {
  return ADMIN_ROUTE_GROUPS.find((group) => group.id === groupId);
}

export { ADMIN_ROUTE_CATALOG };


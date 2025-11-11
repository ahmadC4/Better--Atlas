import React, { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import {
  Settings,
  Package,
  Bot,
  Key,
  Users as UsersIcon,
  FileText,
  Loader2,
  ArrowRight,
  Building2,
  CreditCard,
  Brain,
  LifeBuoy,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@shared/constants';
import type { Permission } from '@shared/constants';
import {
  ADMIN_NAV_GROUPS,
  getAdminRouteById,
  getDashboardRoutes,
  getRouteDashboardCard,
  type AdminIconName,
  type AdminRouteId,
} from '@shared/adminRoutes';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAdminLayout } from '@/components/AdminLayout';
import {
  AdminCard,
  AdminSectionTabs,
  type AdminSectionTabValue,
  type AdminCardProps,
} from '@/components/admin';

interface AdminUsersResponse {
  users: Array<{ id: string; role: string; status: string; plan?: string }>;
}

interface AdminOrganizationsResponse {
  orgs?: Array<{ id: string; name?: string | null; members?: number | null; memberCount?: number | null }>;
  organizations?: Array<{ id: string; name?: string | null; members?: number | null; memberCount?: number | null }>;
}

interface AdminAgentsResponse {
  agents?: Array<{ id: string; status?: string | null }>;
}

interface AdminKnowledgeSummaryResponse {
  knowledgeItems?: number;
  memoryItems?: number;
  knowledgeBase?: { totalItems?: number | null };
  memory?: { totalMemories?: number | null };
}

interface AdminTicketsResponse {
  tickets?: Array<{ id: string; status?: string | null }>;
  total?: number;
  open?: number;
  pending?: number;
}

export interface SystemCardDefinition {
  id: AdminRouteId;
  props: AdminCardProps;
  requiredPermission: Permission;
}

const iconComponents: Partial<Record<AdminIconName, ComponentType<{ className?: string }>>> = {
  Settings,
  Package,
  Bot,
  Key,
  Users: UsersIcon,
  FileText,
  Building2,
  CreditCard,
  Brain,
  LifeBuoy,
};

export interface DashboardUserCardMetrics {
  totalUsers: number;
  activeUsers: number;
  adminUsers: number;
  freePlanUsers: number;
  proPlanUsers: number;
  enterprisePlanUsers: number;
  organizationCount: number;
  topOrganizations: Array<{ name: string; members: number | null }>;
  agentCount: number;
  activeAgentCount: number;
  knowledgeItemCount: number;
  memoryItemCount: number;
  totalTickets: number;
  openTickets: number;
  pendingTickets: number;
}

export interface DashboardUserCardDefinition {
  id: string;
  props: AdminCardProps;
  requiredPermission: Permission;
}

interface UserCardBuildResult {
  metadataTitle?: string;
  metadata?: AdminCardProps['metadata'];
  children: ReactNode;
  actionTestId: string;
}

type BuildUserCard = (metrics: DashboardUserCardMetrics) => UserCardBuildResult;

interface UserCardConfig {
  routeId: AdminRouteId;
  build: BuildUserCard;
}

const formatMembersLabel = (members: number | null) => {
  if (members === null || Number.isNaN(members)) {
    return 'n/a';
  }
  return `${members} member${members === 1 ? '' : 's'}`;
};

const USER_CARD_CONFIG: UserCardConfig[] = [
  {
    routeId: 'user-management',
    build: (metrics) => ({
      metadataTitle: 'Highlights',
      metadata: [
        { label: 'Active', value: metrics.activeUsers.toString() },
        { label: 'Admin roles', value: metrics.adminUsers.toString() },
      ],
      children: (
        <div className="space-y-1">
          <p className="text-3xl font-semibold">{metrics.totalUsers}</p>
          <p className="text-sm text-muted-foreground">Total accounts</p>
        </div>
      ),
      actionTestId: 'primary-users',
    }),
  },
  {
    routeId: 'organizations',
    build: (metrics) => ({
      metadataTitle: 'Top teams',
      metadata: metrics.topOrganizations.map((org) => ({
        label: org.name,
        value: formatMembersLabel(org.members),
      })),
      children: (
        <div className="space-y-1">
          <p className="text-3xl font-semibold">{metrics.organizationCount}</p>
          <p className="text-sm text-muted-foreground">Active workspaces</p>
        </div>
      ),
      actionTestId: 'primary-organizations',
    }),
  },
  {
    routeId: 'plans',
    build: (metrics) => ({
      metadataTitle: 'Plan breakdown',
      metadata: [
        { label: 'Enterprise', value: metrics.enterprisePlanUsers.toString() },
        { label: 'Pro', value: metrics.proPlanUsers.toString() },
        { label: 'Free', value: metrics.freePlanUsers.toString() },
      ],
      children: (
        <div className="space-y-1">
          <p className="text-3xl font-semibold">{metrics.proPlanUsers + metrics.enterprisePlanUsers}</p>
          <p className="text-sm text-muted-foreground">Active paid seats</p>
        </div>
      ),
      actionTestId: 'primary-plans',
    }),
  },
  {
    routeId: 'agents',
    build: (metrics) => ({
      metadataTitle: 'Agent status',
      metadata: [
        { label: 'Active', value: metrics.activeAgentCount.toString() },
        { label: 'Total', value: metrics.agentCount.toString() },
      ],
      children: (
        <div className="space-y-1">
          <p className="text-3xl font-semibold">{metrics.agentCount}</p>
          <p className="text-sm text-muted-foreground">Agents deployed</p>
        </div>
      ),
      actionTestId: 'primary-agents',
    }),
  },
  {
    routeId: 'memory',
    build: (metrics) => ({
      metadataTitle: 'Stored items',
      metadata: [
        { label: 'Knowledge', value: metrics.knowledgeItemCount.toString() },
        { label: 'Memories', value: metrics.memoryItemCount.toString() },
      ],
      children: (
        <div className="space-y-1">
          <p className="text-3xl font-semibold">{metrics.knowledgeItemCount + metrics.memoryItemCount}</p>
          <p className="text-sm text-muted-foreground">Combined assets</p>
        </div>
      ),
      actionTestId: 'primary-knowledge',
    }),
  },
  {
    routeId: 'tickets',
    build: (metrics) => ({
      metadataTitle: 'Queue overview',
      metadata: [
        { label: 'Open', value: metrics.openTickets.toString() },
        { label: 'Pending', value: metrics.pendingTickets.toString() },
        { label: 'Total', value: metrics.totalTickets.toString() },
      ],
      children: (
        <div className="space-y-1">
          <p className="text-3xl font-semibold">{metrics.openTickets}</p>
          <p className="text-sm text-muted-foreground">Open support cases</p>
        </div>
      ),
      actionTestId: 'primary-tickets',
    }),
  },
];

export const buildUserTabCards = (
  metrics: DashboardUserCardMetrics,
  hasPermission: (permission: Permission) => boolean,
): DashboardUserCardDefinition[] =>
  USER_CARD_CONFIG.flatMap((config) => {
    const route = getAdminRouteById(config.routeId);
    const cardMeta = getRouteDashboardCard(route, 'workspace');

    if (!cardMeta || !hasPermission(route.requiredPermission)) {
      return [];
    }

    const Icon = iconComponents[cardMeta.icon] ?? undefined;
    const { metadataTitle, metadata, children, actionTestId } = config.build(metrics);

        return [
          {
            id: route.id,
            props: {
              title: cardMeta.title,
              description: cardMeta.description,
              icon: Icon,
              action: {
                label: cardMeta.actionLabel,
                scope: 'user',
                routeKey: route.id,
                testId: actionTestId,
              },
              metadataTitle: metadataTitle ?? 'Highlights',
              metadata,
              children,
        },
        requiredPermission: route.requiredPermission,
      },
    ];
  });

export const getSystemQuickCards = (hasPermission: (permission: Permission) => boolean) =>
  getDashboardRoutes('system')
    .map<SystemCardDefinition | null>((route) => {
      if (!hasPermission(route.requiredPermission)) {
        return null;
      }

      const cardMeta = getRouteDashboardCard(route, 'system');
      if (!cardMeta) {
        return null;
      }

      const Icon = iconComponents[cardMeta.icon] ?? undefined;

      if (!Icon) {
        return null;
      }

      const metadata = route.apis.map((endpoint) => ({
        label: endpoint.method,
        value: endpoint.path,
      }));

      const normalizedRouteId = route.id as AdminRouteId;

      return {
        id: normalizedRouteId,
        props: {
          title: cardMeta.title,
          description: cardMeta.description,
          icon: Icon,
          action: {
            label: cardMeta.actionLabel,
            scope: 'system',
            routeKey: normalizedRouteId,
            testId: `primary-${normalizedRouteId}`,
          },
          metadataTitle: 'Endpoints',
          metadata,
        },
        requiredPermission: route.requiredPermission,
      };
    })
    .filter((card): card is SystemCardDefinition => Boolean(card));

export default function DashboardPage() {
  const { user, isAdmin, isLoading: isAuthLoading } = useAuth();
  const { hasPermission } = usePermissions();
  const [, setLocation] = useLocation();
  const { setHeader, resetHeader } = useAdminLayout();

  const usersQuery = useQuery<AdminUsersResponse>({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/users');
      return response.json();
    },
    enabled: isAdmin && hasPermission(PERMISSIONS.USER_MANAGEMENT_VIEW),
  });

  const proUsersQuery = useQuery<AdminUsersResponse>({
    queryKey: ['admin-users', 'plan', 'pro'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/users?plan=pro');
      return response.json();
    },
    enabled: isAdmin && hasPermission(PERMISSIONS.USER_MANAGEMENT_VIEW),
  });

  const enterpriseUsersQuery = useQuery<AdminUsersResponse>({
    queryKey: ['admin-users', 'plan', 'enterprise'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/users?plan=enterprise');
      return response.json();
    },
    enabled: isAdmin && hasPermission(PERMISSIONS.USER_MANAGEMENT_VIEW),
  });

  const freeUsersQuery = useQuery<AdminUsersResponse>({
    queryKey: ['admin-users', 'plan', 'free'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/users?plan=free');
      return response.json();
    },
    enabled: isAdmin && hasPermission(PERMISSIONS.USER_MANAGEMENT_VIEW),
  });

  const organizationsQuery = useQuery<AdminOrganizationsResponse>({
    queryKey: ['admin-orgs'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/orgs');
      return response.json();
    },
    enabled: isAdmin && hasPermission(PERMISSIONS.USER_MANAGEMENT_VIEW),
  });

  const agentsQuery = useQuery<AdminAgentsResponse>({
    queryKey: ['admin-agents'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/agents');
      return response.json();
    },
    enabled: isAdmin && hasPermission(PERMISSIONS.AGENTS_VIEW),
  });

  const knowledgeQuery = useQuery<AdminKnowledgeSummaryResponse>({
    queryKey: ['admin-knowledge-summary'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/knowledge');
      return response.json();
    },
    enabled:
      isAdmin && (hasPermission(PERMISSIONS.MEMORY_VIEW) || hasPermission(PERMISSIONS.KNOWLEDGE_BASE_VIEW)),
  });

  const ticketsQuery = useQuery<AdminTicketsResponse>({
    queryKey: ['admin-tickets'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/tickets');
      return response.json();
    },
    enabled: isAdmin && hasPermission(PERMISSIONS.USER_MANAGEMENT_VIEW),
  });

  useEffect(() => {
    if (!isAuthLoading && !isAdmin) {
      setLocation('/');
    }
  }, [isAdmin, isAuthLoading, setLocation]);

  if (isAuthLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const visibleGroups = ADMIN_NAV_GROUPS.filter(group =>
    hasPermission(group.requiredPermission)
  ).map(group => ({
    ...group,
    items: group.items.filter(item => hasPermission(item.requiredPermission))
  })).filter(group => group.items.length > 0);

  const firstAvailablePath = visibleGroups[0]?.items[0]?.path;

  const userStats = usersQuery.data?.users;
  const totalUsers = userStats?.length ?? 0;
  const activeUsers = userStats?.filter((u) => u.status === 'active').length ?? 0;
  const adminUsers =
    userStats?.filter((u) => u.role === 'admin' || u.role === 'super_admin').length ?? 0;

  const proUsers =
    proUsersQuery.data?.users.length ??
    (userStats ? userStats.filter((u) => u.plan === 'pro').length : 0);
  const freeUsers =
    freeUsersQuery.data?.users.length ??
    (userStats ? userStats.filter((u) => u.plan === 'free').length : 0);
  const enterpriseUsers =
    enterpriseUsersQuery.data?.users.length ??
    (userStats ? userStats.filter((u) => u.plan === 'enterprise').length : 0);

  const organizationEntries = useMemo(() => {
    const raw = organizationsQuery.data;
    const list = Array.isArray(raw?.orgs)
      ? raw?.orgs
      : Array.isArray(raw?.organizations)
      ? raw?.organizations
      : [];

    return list.map((org) => ({
      id: org.id,
      name: org.name ?? 'Workspace',
      members:
        typeof org.members === 'number'
          ? org.members
          : typeof org.memberCount === 'number'
          ? org.memberCount
          : null,
    }));
  }, [organizationsQuery.data]);

  const topOrganizations = useMemo(() => organizationEntries.slice(0, 3), [organizationEntries]);

  const agents = agentsQuery.data?.agents ?? [];
  const totalAgents = agents.length;
  const activeAgentCount = agents.filter((agent) => agent.status === 'active' || agent.status === 'online').length;

  const knowledgeItems =
    typeof knowledgeQuery.data?.knowledgeItems === 'number'
      ? knowledgeQuery.data?.knowledgeItems
      : knowledgeQuery.data?.knowledgeBase?.totalItems ?? 0;
  const memoryItems =
    typeof knowledgeQuery.data?.memoryItems === 'number'
      ? knowledgeQuery.data?.memoryItems
      : knowledgeQuery.data?.memory?.totalMemories ?? 0;

  const tickets = ticketsQuery.data?.tickets ?? [];
  const ticketsTotal =
    typeof ticketsQuery.data?.total === 'number' ? ticketsQuery.data?.total : tickets.length;
  const openTickets =
    typeof ticketsQuery.data?.open === 'number'
      ? ticketsQuery.data?.open
      : tickets.filter((ticket) => (ticket.status ?? '').toLowerCase() === 'open').length;
  const pendingTickets =
    typeof ticketsQuery.data?.pending === 'number'
      ? ticketsQuery.data?.pending
      : tickets.filter((ticket) => (ticket.status ?? '').toLowerCase() === 'pending').length;

  const systemQuickCards = getSystemQuickCards(hasPermission);

  const userCardMetrics = useMemo<DashboardUserCardMetrics>(() => ({
    totalUsers,
    activeUsers,
    adminUsers,
    freePlanUsers: freeUsers,
    proPlanUsers: proUsers,
    enterprisePlanUsers: enterpriseUsers,
    organizationCount: organizationEntries.length,
    topOrganizations,
    agentCount: totalAgents,
    activeAgentCount,
    knowledgeItemCount: knowledgeItems,
    memoryItemCount: memoryItems,
    totalTickets: ticketsTotal,
    openTickets,
    pendingTickets,
  }), [
    totalUsers,
    activeUsers,
    adminUsers,
    freeUsers,
    proUsers,
    enterpriseUsers,
    organizationEntries,
    topOrganizations,
    totalAgents,
    activeAgentCount,
    knowledgeItems,
    memoryItems,
    ticketsTotal,
    openTickets,
    pendingTickets,
  ]);

  const userCards = useMemo(
    () => buildUserTabCards(userCardMetrics, hasPermission),
    [userCardMetrics, hasPermission],
  );

  const defaultTab: AdminSectionTabValue = systemQuickCards.length > 0 ? 'system' : 'user';
  const [activeTab, setActiveTab] = useState<AdminSectionTabValue>(defaultTab);

  useEffect(() => {
    if (activeTab === 'system' && systemQuickCards.length === 0 && userCards.length > 0) {
      setActiveTab('user');
    }
    if (activeTab === 'user' && userCards.length === 0 && systemQuickCards.length > 0) {
      setActiveTab('system');
    }
  }, [activeTab, systemQuickCards.length, userCards.length]);

  const headerDescription = useMemo(() => {
    const displayName = user?.name || user?.email || 'Admin';
    return `Welcome back, ${displayName}. Manage your platform settings and configurations.`;
  }, [user?.name, user?.email]);

  const headerTabs = useMemo(() => {
    if (systemQuickCards.length === 0 && userCards.length === 0) {
      return undefined;
    }

    return (
      <AdminSectionTabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value)}
        systemDisabled={systemQuickCards.length === 0}
        userDisabled={userCards.length === 0}
      />
    );
  }, [activeTab, systemQuickCards.length, userCards.length, setActiveTab]);

  const headerConfig = useMemo(() => ({
    title: 'Admin Dashboard',
    description: headerDescription,
    tabs: headerTabs,
  }), [headerDescription, headerTabs]);

  useEffect(() => {
    setHeader(headerConfig);
    return () => resetHeader();
  }, [setHeader, resetHeader, headerConfig]);

  return (
    <div className="space-y-6">
      {hasPermission(PERMISSIONS.USER_MANAGEMENT_VIEW) && (
        <section className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <UsersIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalUsers}</div>
              <p className="text-xs text-muted-foreground">
                {activeUsers} active
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Administrators</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{adminUsers}</div>
              <p className="text-xs text-muted-foreground">
                Admin & Super Admin
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Your Role</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold capitalize">{user.role?.replace('_', ' ')}</div>
              <p className="text-xs text-muted-foreground">
                {user.role === 'super_admin' ? 'Full access' : user.role === 'admin' ? 'Limited access' : 'View only'}
              </p>
            </CardContent>
          </Card>
        </section>
      )}

      {activeTab === 'system' && (
        <section>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {systemQuickCards.map((card) => (
              <AdminCard key={card.id} {...card.props} />
            ))}
            {systemQuickCards.length === 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>No system controls available</CardTitle>
                  <CardDescription>
                    You do not have permission to manage platform-level settings.
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
          </div>
        </section>
      )}

      {activeTab === 'user' && (
        <section>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {userCards.map((card) => (
              <AdminCard key={card.id} {...card.props} />
            ))}
            {userCards.length === 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>No workspace tools available</CardTitle>
                  <CardDescription>
                    You do not have permission to manage account-level tools.
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
          </div>
        </section>
      )}

      {/* Getting Started for new admins */}
      {user.role === 'admin' && (
        <Card className="border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle>Admin Access Notice</CardTitle>
            <CardDescription className="text-amber-800 dark:text-amber-200">
              As an Admin, you can manage most platform settings. However, System Prompts and Tool Policies are view-only and require Super Admin privileges to edit.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {firstAvailablePath && visibleGroups.length > 0 && (
        <div className="flex justify-center pt-4">
          <Button
            size="lg"
            data-testid="button-get-started"
            type="button"
            onClick={() => setLocation(firstAvailablePath)}
          >
            Get Started
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

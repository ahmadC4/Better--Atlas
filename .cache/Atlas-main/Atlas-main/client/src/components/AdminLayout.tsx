import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { AdminHeader } from '@/components/admin/AdminHeader';
import type { AdminBreadcrumb } from '@/components/admin/AdminHeader';
import { AdminCard } from '@/components/admin/AdminCard';
import { AdminSectionTabs } from '@/components/admin/AdminSectionTabs';
import { Users, Building2, CreditCard, Bot, Brain, LifeBuoy, Settings, FileText, Key } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/use-permissions';
import { useLastAreaPreference } from '@/hooks/useLastAreaPreference';
import {
  getAdminRouteById,
  getRouteDashboardCard,
  type AdminIconName,
  type AdminRouteScope,
} from '@shared/adminRoutes';
import type { Permission } from '@shared/constants';

type AdminTabValue = 'system' | 'user';

const ADMIN_INVENTORY_REPORT_URL = '/admin/_reports/admin-inventory.json';

interface AdminInventorySummary {
  totalMissing: number;
  missingByRoute: Record<string, number>;
}

const isDevelopmentEnvironment = () => {
  if (typeof import.meta !== 'undefined' && import.meta.env && typeof import.meta.env.DEV === 'boolean') {
    return import.meta.env.DEV;
  }

  if (typeof process !== 'undefined' && process.env && typeof process.env.NODE_ENV === 'string') {
    return process.env.NODE_ENV !== 'production';
  }

  return true;
};

const getRouteIdentifier = (value: Record<string, unknown>): string | undefined => {
  const candidateKeys: Array<keyof typeof value> = ['routeId', 'route', 'path'];
  for (const key of candidateKeys) {
    const raw = value[key];
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return raw;
    }
  }
  return undefined;
};

const summarizeAdminInventoryReport = (data: unknown): AdminInventorySummary => {
  const missingByRoute = new Map<string, number>();

  const visit = (node: unknown, currentRoute?: string) => {
    if (Array.isArray(node)) {
      for (const entry of node) {
        visit(entry, currentRoute);
      }
      return;
    }

    if (!node || typeof node !== 'object') {
      return;
    }

    const record = node as Record<string, unknown>;
    const explicitRoute = getRouteIdentifier(record);
    const routeForChildren = explicitRoute ?? currentRoute;

    const status = record.status;
    if (typeof status === 'string' && status.toUpperCase() === 'MISSING') {
      const routeKey = explicitRoute ?? currentRoute ?? 'unknown';
      const previous = missingByRoute.get(routeKey) ?? 0;
      missingByRoute.set(routeKey, previous + 1);
    }

    for (const value of Object.values(record)) {
      if (value && typeof value === 'object') {
        visit(value, routeForChildren);
      }
    }
  };

  visit(data);

  const sortedEntries = [...missingByRoute.entries()].sort(([a], [b]) => a.localeCompare(b));
  const summaryMap: Record<string, number> = {};
  let totalMissing = 0;

  for (const [route, count] of sortedEntries) {
    summaryMap[route] = count;
    totalMissing += count;
  }

  return { totalMissing, missingByRoute: summaryMap };
};

export const useAdminInventoryDiagnostics = (isAdmin: boolean) => {
  const isDev = isDevelopmentEnvironment();

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    let cancelled = false;

    const runDiagnostics = async () => {
      try {
        const response = await fetch(ADMIN_INVENTORY_REPORT_URL, {
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = await response.json();
        if (cancelled) {
          return;
        }

        const summary = summarizeAdminInventoryReport(payload);

        if (!isDev) {
          return;
        }

        const logPayload = {
          missingByRoute: summary.missingByRoute,
          totalMissing: summary.totalMissing,
        };

        if (summary.totalMissing > 0) {
          console.warn('[admin-inventory] Missing admin inventory items detected.', logPayload);
        } else {
          console.info('[admin-inventory] No missing admin inventory items detected.', logPayload);
        }
      } catch (error) {
        if (cancelled || !isDev) {
          return;
        }

        console.warn('[admin-inventory] Failed to load admin inventory report.', error);
      }
    };

    void runDiagnostics();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, isDev]);
};

export interface AdminHeaderConfig {
  title: string;
  description?: string;
  actions?: ReactNode;
  tabs?: ReactNode;
}

const iconComponents: Partial<Record<AdminIconName, ComponentType<{ className?: string }>>> = {
  Users,
  Building2,
  CreditCard,
  Bot,
  Brain,
  LifeBuoy,
  Settings,
  FileText,
  Key,
};

interface CardDefinition {
  routeId: string;
  title: string;
  description: string;
  actionLabel: string;
  icon?: ComponentType<{ className?: string }>;
  requiredPermission: Permission;
  scope: AdminRouteScope;
}

const SYSTEM_CARD_ROUTE_IDS = [
  'system-prompts',
  'output-templates',
  'tool-policies',
  'plans',
  'agents',
  'api-access',
] as const;

const USER_CARD_ROUTE_IDS = [
  'user-management',
  'organizations',
  'plans',
  'agents',
  'memory',
  'tickets',
] as const;

interface AdminLayoutContextValue {
  breadcrumbs: AdminBreadcrumb[];
  setHeader: (config: AdminHeaderConfig) => void;
  resetHeader: () => void;
  activeTab: AdminTabValue;
  setActiveTab: (value: AdminTabValue) => void;
}

const AdminLayoutContext = createContext<AdminLayoutContextValue | null>(null);

const areHeaderConfigsEqual = (a: AdminHeaderConfig, b: AdminHeaderConfig) =>
  a.title === b.title &&
  a.description === b.description &&
  a.actions === b.actions &&
  a.tabs === b.tabs;

const getDefaultHeader = (tab: AdminTabValue): AdminHeaderConfig => {
  if (tab === 'user') {
    return { title: 'User' };
  }

  return { title: 'System' };
};

interface AdminLayoutProps {
  children?: ReactNode;
  systemTabContent?: ReactNode;
  userTabContent?: ReactNode;
  initialTab?: AdminTabValue;
}

export function AdminLayout({ children, systemTabContent, userTabContent, initialTab }: AdminLayoutProps = {}) {
  const [activeTab, setActiveTabState] = useState<AdminTabValue>(initialTab ?? 'system');
  const { isAdmin } = useAuth();
  const { hasPermission } = usePermissions();

  useLastAreaPreference('admin');

  useAdminInventoryDiagnostics(isAdmin);

  const defaultHeader = useMemo(() => getDefaultHeader(activeTab), [activeTab]);
  const [headerConfig, setHeaderConfig] = useState<AdminHeaderConfig>(defaultHeader);

  useEffect(() => {
    if (!initialTab) return;
    setActiveTabState((previous) => (previous === initialTab ? previous : initialTab));
  }, [initialTab]);

  useEffect(() => {
    setHeaderConfig(defaultHeader);
  }, [defaultHeader]);

  const breadcrumbs = useMemo<AdminBreadcrumb[]>(
    () => [
      { label: 'Admin', href: '/admin' },
      { label: activeTab === 'system' ? 'System' : 'User' },
    ],
    [activeTab],
  );

  const handleTabChange = useCallback((value: string) => {
    if (value === 'system' || value === 'user') {
      setActiveTabState(value);
    }
  }, []);

  const setActiveTab = useCallback((value: AdminTabValue) => {
    setActiveTabState(value);
  }, []);

  const setHeader = useCallback((config: AdminHeaderConfig) => {
    setHeaderConfig((previous) => (areHeaderConfigsEqual(previous, config) ? previous : config));
  }, []);

  const resetHeader = useCallback(() => {
    setHeaderConfig(defaultHeader);
  }, [defaultHeader]);

  const contextValue = useMemo<AdminLayoutContextValue>(
    () => ({
      breadcrumbs,
      setHeader,
      resetHeader,
      activeTab,
      setActiveTab,
    }),
    [activeTab, breadcrumbs, resetHeader, setActiveTab, setHeader],
  );

  const systemCards = useMemo<CardDefinition[]>(() => {
    if (!isAdmin) return [];

    return SYSTEM_CARD_ROUTE_IDS.flatMap((routeId) => {
      const route = getAdminRouteById(routeId);
      const cardMeta = getRouteDashboardCard(route, 'system');

      if (!cardMeta || !hasPermission(route.requiredPermission)) {
        return [];
      }

      const Icon = iconComponents[cardMeta.icon];

      return [
        {
          routeId: route.id,
          title: cardMeta.title,
          description: cardMeta.description,
          actionLabel: cardMeta.actionLabel,
          icon: Icon,
          requiredPermission: route.requiredPermission,
          scope: 'system',
        },
      ];
    });
  }, [isAdmin, hasPermission]);

  const userCards = useMemo<CardDefinition[]>(() => {
    if (!isAdmin) return [];

    return USER_CARD_ROUTE_IDS.flatMap((routeId) => {
      const route = getAdminRouteById(routeId);
      const cardMeta = getRouteDashboardCard(route, 'workspace');

      if (!cardMeta || !hasPermission(route.requiredPermission)) {
        return [];
      }

      const Icon = iconComponents[cardMeta.icon];

      return [
        {
          routeId: route.id,
          title: cardMeta.title,
          description: cardMeta.description,
          actionLabel: cardMeta.actionLabel,
          icon: Icon,
          requiredPermission: route.requiredPermission,
          scope: 'user',
        },
      ];
    });
  }, [isAdmin, hasPermission]);

  const tabTriggers = headerConfig.tabs ?? (
    <AdminSectionTabs value={activeTab} onValueChange={setActiveTab} />
  );

  return (
    <AdminLayoutContext.Provider value={contextValue}>
      <div className="flex min-h-screen flex-col bg-background">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-1 flex-col">
          <AdminHeader
            title={headerConfig.title}
            description={headerConfig.description}
            breadcrumbs={breadcrumbs}
            actions={headerConfig.actions}
            tabs={tabTriggers}
          />
          <main className="flex-1 px-6 py-10">
            {children || (
              <>
                <TabsContent value="system" className="flex-1">
                  {systemTabContent || (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {systemCards.map((card) => (
                        <AdminCard
                          key={card.routeId}
                          title={card.title}
                          description={card.description}
                          icon={card.icon}
                          action={{
                            label: card.actionLabel,
                            scope: card.scope,
                            routeKey: card.routeId,
                            testId: `action-${card.routeId}`,
                          }}
                        />
                      ))}
                      {systemCards.length === 0 && (
                        <div className="col-span-full flex h-64 items-center justify-center rounded-lg border border-dashed border-muted-foreground">
                          <p className="text-sm text-muted-foreground">
                            No system management tools available
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="user" className="flex-1">
                  {userTabContent || (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {userCards.map((card) => (
                        <AdminCard
                          key={card.routeId}
                          title={card.title}
                          description={card.description}
                          icon={card.icon}
                          action={{
                            label: card.actionLabel,
                            scope: card.scope,
                            routeKey: card.routeId,
                            testId: `action-${card.routeId}`,
                          }}
                        />
                      ))}
                      {userCards.length === 0 && (
                        <div className="col-span-full flex h-64 items-center justify-center rounded-lg border border-dashed border-muted-foreground">
                          <p className="text-sm text-muted-foreground">
                            No user management tools available
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>
              </>
            )}
          </main>
        </Tabs>
      </div>
    </AdminLayoutContext.Provider>
  );
}

export const useAdminLayout = () => {
  const context = useContext(AdminLayoutContext);
  if (!context) {
    throw new Error('useAdminLayout must be used within an AdminLayout');
  }
  return context;
};

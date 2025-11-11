import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Link, useLocation } from 'wouter';
import { ChevronRight, Settings, Package, Bot, Key, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Sheet, SheetClose, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/useAuth';
import { useLastAreaPreference } from '@/hooks/useLastAreaPreference';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { AdminSectionTabs } from '@/components/admin/AdminSectionTabs';
import type { AdminBreadcrumb } from '@/components/admin/AdminHeader';
import { ADMIN_NAV_GROUPS } from '@shared/constants';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Settings,
  Package,
  Bot,
  Key,
};

type AdminTabValue = 'system' | 'user';

export interface AdminHeaderConfig {
  title: string;
  description?: string;
  actions?: ReactNode;
  tabs?: ReactNode;
}

interface AdminLayoutContextValue {
  breadcrumbs: AdminBreadcrumb[];
  setHeader: (config: AdminHeaderConfig) => void;
  resetHeader: () => void;
  activeTab: AdminTabValue;
  setActiveTab: (value: AdminTabValue) => void;
}

const AdminLayoutContext = createContext<AdminLayoutContextValue | null>(null);

export function useAdminLayout() {
  const ctx = useContext(AdminLayoutContext);
  if (!ctx) {
    throw new Error('useAdminLayout must be used within AdminLayout');
  }
  return ctx;
}

interface AdminLayoutProps {
  children?: ReactNode;
  systemTabContent?: ReactNode;
  userTabContent?: ReactNode;
  initialTab?: AdminTabValue;
}

export function AdminLayout({ children, systemTabContent, userTabContent, initialTab }: AdminLayoutProps = {}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTabValue>(initialTab ?? 'system');
  const [header, setHeaderState] = useState<AdminHeaderConfig | null>(null);
  const [location] = useLocation();
  const { hasPermission } = usePermissions();
  const { user } = useAuth();

  useLastAreaPreference('admin');

  const visibleGroups = useMemo(
    () =>
      ADMIN_NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => hasPermission(item.requiredPermission)),
      })).filter((group) => group.items.length > 0),
    [hasPermission],
  );

  const currentPath = location;

  const breadcrumbs: AdminBreadcrumb[] = useMemo(() => {
    const parts: AdminBreadcrumb[] = [{ label: 'Admin', href: '/admin' }];
    for (const group of ADMIN_NAV_GROUPS) {
      const activeItem = group.items.find((item) => item.path === currentPath);
      if (activeItem) {
        parts.push({ label: group.label });
        parts.push({ label: activeItem.label });
        break;
      }
    }
    return parts;
  }, [currentPath]);

  const defaultHeader: AdminHeaderConfig = useMemo(
    () => ({ title: activeTab === 'user' ? 'User' : 'System' }),
    [activeTab],
  );

  const setHeader = (config: AdminHeaderConfig) => setHeaderState(config);
  const resetHeader = () => setHeaderState(null);

  const getRoleBadge = () => {
    if (!user) return null;
    if (user.role === 'super_admin') {
      return <Badge className="bg-purple-600 text-white">Super Admin</Badge>;
    }
    if (user.role === 'admin') {
      return <Badge variant="default">Admin</Badge>;
    }
    return null;
  };

  const renderNavigation = (options: { closeOnNavigate?: boolean }) => (
    <nav className="space-y-2">
      {visibleGroups.map((group) => {
        const Icon = iconMap[group.icon];
        const hasActiveItem = group.items.some((item) => item.path === currentPath);

        return (
          <Collapsible key={group.id} defaultOpen={hasActiveItem}>
            <CollapsibleTrigger
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent',
                hasActiveItem && 'bg-accent',
              )}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" />}
              <span className="flex-1 text-left">{group.label}</span>
              <ChevronRight
                className={cn('h-4 w-4 transition-transform', hasActiveItem && 'rotate-90')}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="ml-6 mt-1 space-y-1">
              {group.items.map((item) => (
                <Link key={item.id} href={item.path}>
                  {options.closeOnNavigate ? (
                    <SheetClose asChild>
                      <a
                        className={cn(
                          'block rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent',
                          currentPath === item.path && 'bg-accent font-medium text-primary',
                        )}
                        data-testid={`link-admin-${item.id}`}
                      >
                        {item.label}
                      </a>
                    </SheetClose>
                  ) : (
                    <a
                      className={cn(
                        'block rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent',
                        currentPath === item.path && 'bg-accent font-medium text-primary',
                      )}
                      data-testid={`link-admin-${item.id}`}
                    >
                      {item.label}
                    </a>
                  )}
                </Link>
              ))}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </nav>
  );

  const headerTabs = (
    <AdminSectionTabs value={activeTab} onValueChange={setActiveTab} />
  );

  return (
    <AdminLayoutContext.Provider
      value={{ breadcrumbs, setHeader, resetHeader, activeTab, setActiveTab }}
    >
      <div className="flex h-screen w-full">
        {/* Mobile header */}
        <div className="flex w-full flex-col md:hidden">
          <div className="flex h-14 items-center justify-between border-b px-4">
            <div className="font-semibold">Admin</div>
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <div className="border-b p-4 font-semibold">Admin</div>
                <ScrollArea className="h-full p-2">
                  {renderNavigation({ closeOnNavigate: true })}
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Sidebar for desktop */}
        <aside className="hidden h-full w-64 border-r md:flex md:flex-col">
          <div className="flex h-14 items-center justify-between border-b px-4">
            <div className="font-semibold">Admin</div>
            {getRoleBadge()}
          </div>
          <ScrollArea className="flex-1 p-2">{renderNavigation({})}</ScrollArea>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <AdminHeader
            title={(header ?? defaultHeader).title}
            description={header?.description}
            breadcrumbs={breadcrumbs}
            tabs={header?.tabs ?? headerTabs}
          />
          <div className="container mx-auto p-4 sm:p-6">
            {activeTab === 'system' ? (
              <>{systemTabContent ?? children}</>
            ) : (
              <>{userTabContent ?? null}</>
            )}
          </div>
        </main>
      </div>
    </AdminLayoutContext.Provider>
  );
}


import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  ChevronLeft,
  ChevronRight,
  Settings,
  Package,
  Bot,
  Key,
  Menu
} from 'lucide-react';
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
import { ADMIN_NAV_GROUPS } from '@shared/constants';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Settings,
  Package,
  Bot,
  Key,
};

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [location] = useLocation();
  const { hasPermission } = usePermissions();
  const { user } = useAuth();

  // Filter groups: if group has null permission, derive visibility from children
  const visibleGroups = ADMIN_NAV_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(item => hasPermission(item.requiredPermission))
  })).filter(group => {
    // If group has visible children, show the group
    if (group.items.length > 0) {
      return true;
    }
    // If group has a required permission, check it
    if (group.requiredPermission !== null) {
      return hasPermission(group.requiredPermission);
    }
    // No permission and no children = hide
    return false;
  });

  const currentPath = location;
  
  const breadcrumbs = (() => {
    const parts = ['Admin'];
    for (const group of ADMIN_NAV_GROUPS) {
      const activeItem = group.items.find(item => item.path === currentPath);
      if (activeItem) {
        parts.push(group.label);
        parts.push(activeItem.label);
        break;
      }
    }
    return parts;
  })();

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

  const renderNavigation = (options: { isCollapsed: boolean; closeOnNavigate?: boolean }) => (
    <nav className="space-y-2">
      {visibleGroups.map((group) => {
        const Icon = iconMap[group.icon];
        const hasActiveItem = group.items.some(item => item.path === currentPath);

        return (
          <Collapsible key={group.id} defaultOpen={hasActiveItem}>
            <CollapsibleTrigger
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent',
                hasActiveItem && 'bg-accent'
              )}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" />}
              {!options.isCollapsed && (
                <>
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronRight
                    className={cn(
                      'h-4 w-4 transition-transform',
                      hasActiveItem && 'rotate-90'
                    )}
                  />
                </>
              )}
            </CollapsibleTrigger>
            {!options.isCollapsed && (
              <CollapsibleContent className="ml-6 mt-1 space-y-1">
                {group.items.map((item) => (
                  <Link key={item.id} href={item.path}>
                    {options.closeOnNavigate ? (
                      <SheetClose asChild>
                        <a
                          className={cn(
                            'block rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent',
                            currentPath === item.path && 'bg-accent font-medium text-primary'
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
                          currentPath === item.path && 'bg-accent font-medium text-primary'
                        )}
                        data-testid={`link-admin-${item.id}`}
                      >
                        {item.label}
                      </a>
                    )}
                  </Link>
                ))}
              </CollapsibleContent>
            )}
          </Collapsible>
        );
      })}
    </nav>
  );

  return (
    <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Sidebar */}
        <aside
          className={cn(
            'hidden flex-col border-r bg-card transition-all duration-300 md:flex',
            isCollapsed ? 'w-16' : 'w-64'
          )}
        >
          {/* Sidebar Header */}
          <div className="flex h-14 items-center justify-between border-b px-4">
            {!isCollapsed && (
              <Link href="/admin">
                <a className="flex items-center gap-2 font-semibold">
                  <Settings className="h-5 w-5" />
                  <span>Admin Panel</span>
                </a>
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className={cn(isCollapsed && 'mx-auto')}
              data-testid="button-toggle-sidebar"
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Role Badge */}
          {!isCollapsed && (
            <div className="flex items-center justify-center border-b p-3">
              {getRoleBadge()}
            </div>
          )}

          {/* Navigation */}
          <ScrollArea className="flex-1 px-2 py-4">
            {renderNavigation({ isCollapsed })}
          </ScrollArea>

          {/* Back to App */}
          <div className="border-t p-3">
            <Link href="/">
              <Button
                variant="outline"
                className="w-full"
                size={isCollapsed ? 'icon' : 'default'}
                data-testid="button-back-to-app"
              >
                {isCollapsed ? (
                  <ChevronLeft className="h-4 w-4" />
                ) : (
                  <>
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Back to App
                  </>
                )}
              </Button>
            </Link>
          </div>
        </aside>

        {/* Mobile Navigation Sheet */}
        <SheetContent side="left" className="flex h-full w-full flex-col p-0 sm:max-w-xs md:hidden">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2 font-semibold">
              <Settings className="h-5 w-5" />
              <span>Admin Panel</span>
            </div>
            {getRoleBadge()}
          </div>
          <ScrollArea className="flex-1 px-2 py-4">
            {renderNavigation({ isCollapsed: false, closeOnNavigate: true })}
          </ScrollArea>
          <div className="border-t p-3">
            <Link href="/">
              <SheetClose asChild>
                <Button variant="outline" className="w-full">
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Back to App
                </Button>
              </SheetClose>
            </Link>
          </div>
        </SheetContent>

        {/* Main Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Breadcrumbs */}
          <header className="flex h-14 items-center justify-between border-b px-4 sm:px-6">
            <div className="flex items-center gap-2">
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Open navigation menu"
                  data-testid="button-open-mobile-admin-menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {breadcrumbs.map((crumb, index) => (
                  <div key={index} className="flex items-center gap-2">
                    {index > 0 && <span>/</span>}
                    <span className={index === breadcrumbs.length - 1 ? 'font-medium text-foreground' : ''}>
                      {crumb}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 overflow-auto">
            <div className="container mx-auto max-w-7xl p-4 sm:p-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </Sheet>
  );
}

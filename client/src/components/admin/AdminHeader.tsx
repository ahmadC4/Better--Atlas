import { useCallback, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { AdminHeaderMenu } from '@/components/admin/AdminHeaderMenu';

export interface AdminBreadcrumb {
  label: string;
  href?: string;
}

export interface AdminHeaderProps {
  title: string;
  description?: string;
  breadcrumbs: AdminBreadcrumb[];
  actions?: ReactNode;
  tabs?: ReactNode;
  className?: string;
}

export function AdminHeader({
  title,
  description,
  breadcrumbs,
  actions,
  tabs,
  className,
}: AdminHeaderProps) {
  const [, setLocation] = useLocation();

  const handleBackToUser = useCallback(() => {
    setLocation('/');
  }, [setLocation]);

  return (
    <header
      className={cn(
        'border-b border-border/60 bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/70',
        className,
      )}
    >
      <div className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
            {breadcrumbs.map((crumb, index) => (
              <div key={`${crumb.label}-${index}`} className="flex items-center gap-2">
                {index > 0 && <span className="text-border">/</span>}
                {crumb.href ? (
                  <a
                    href={crumb.href}
                    className={cn(
                      'transition-colors hover:text-foreground',
                      index === breadcrumbs.length - 1 && 'text-foreground',
                    )}
                  >
                    {crumb.label}
                  </a>
                ) : (
                  <span
                    className={cn(
                      index === breadcrumbs.length - 1 && 'text-foreground',
                    )}
                  >
                    {crumb.label}
                  </span>
                )}
              </div>
            ))}
          </nav>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h1>
            {description && (
              <p className="text-sm text-muted-foreground sm:text-base">{description}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={handleBackToUser}
            data-testid="button-admin-back-to-user"
          >
            Back to User
          </Button>
          <AdminHeaderMenu />
        </div>
      </div>
      {tabs && (
        <div className="border-t border-border/60 px-4 py-3 sm:px-6">
          {tabs}
        </div>
      )}
    </header>
  );
}


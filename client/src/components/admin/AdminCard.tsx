import React, { type ComponentType, type ReactNode, useMemo } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ADMIN_ROUTES, type AdminRouteId, type AdminRouteScope } from '@shared/adminRoutes';

export type AdminCardStatusVariant = 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'danger';

const statusVariantClasses: Record<AdminCardStatusVariant, string> = {
  default: 'bg-primary/15 text-primary border border-primary/20',
  secondary: 'bg-muted text-muted-foreground border border-border/60',
  outline: 'border border-border text-foreground',
  success: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-200 border border-amber-500/30',
  danger: 'bg-destructive/10 text-destructive border border-destructive/30',
};

export interface AdminCardStatus {
  label: string;
  variant?: AdminCardStatusVariant;
}

export interface AdminCardAction extends Pick<ButtonProps, 'variant' | 'size'> {
  label: string;
  scope?: AdminRouteScope;
  routeKey?: AdminRouteId;
  onClick?: () => void;
  icon?: ComponentType<{ className?: string }>;
  testId?: string;
}

export interface AdminCardSecondaryAction {
  label: string;
  scope: AdminRouteScope;
  routeKey: AdminRouteId;
  testId?: string;
}

export interface AdminCardMetadataItem {
  label?: string;
  value: string;
}

export interface AdminCardProps {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  status?: AdminCardStatus;
  action?: AdminCardAction;
  secondaryActions?: AdminCardSecondaryAction[];
  metadataTitle?: string;
  metadata?: AdminCardMetadataItem[];
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function AdminCard({
  title,
  description,
  icon: Icon,
  status,
  action,
  secondaryActions,
  metadataTitle = 'Endpoints',
  metadata,
  children,
  footer,
  className,
}: AdminCardProps) {
  const [, setLocation] = useLocation();

  const primaryRoute = useMemo(() => {
    if (!action?.scope || !action.routeKey) {
      return undefined;
    }

    return ADMIN_ROUTES[action.scope]?.[action.routeKey];
  }, [action?.routeKey, action?.scope]);

  const actionButton = action ? (
    <Button
      variant={action.variant ?? 'default'}
      size={action.size ?? 'sm'}
      type="button"
      onClick={() => {
        if (primaryRoute?.path) {
          setLocation(primaryRoute.path);
          return;
        }

        action.onClick?.();
      }}
      className="w-full justify-center"
      data-testid={action.testId}
      disabled={!primaryRoute?.path && !action.onClick}
    >
      {action.icon && <action.icon className="mr-2 h-4 w-4" />}
      {action.label}
    </Button>
  ) : null;

  return (
    <Card className={cn('h-full border-border/60 bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/90', className)}>
      <CardHeader className="gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {Icon && (
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
            )}
            <div className="space-y-1">
              <CardTitle className="text-base font-semibold text-foreground">{title}</CardTitle>
              {description && <CardDescription>{description}</CardDescription>}
            </div>
          </div>
          {status && (
            <Badge
              className={cn(
                'whitespace-nowrap px-3 py-1 text-xs font-medium uppercase tracking-wide',
                statusVariantClasses[status.variant ?? 'default'],
              )}
            >
              {status.label}
            </Badge>
          )}
        </div>
      </CardHeader>
      {(children || action || (secondaryActions && secondaryActions.length > 0) || (metadata && metadata.length > 0)) && (
        <CardContent className="space-y-4">
          {children}
          {actionButton}
          {secondaryActions && secondaryActions.length > 0 && (
            <div className="space-y-1">
              {secondaryActions.map((secondary) => (
                <Button
                  key={`${secondary.scope}-${secondary.routeKey}-${secondary.label}`}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-muted-foreground hover:text-foreground"
                  data-testid={secondary.testId}
                  type="button"
                  disabled={!ADMIN_ROUTES[secondary.scope]?.[secondary.routeKey]?.path}
                  onClick={() => {
                    const targetRoute = ADMIN_ROUTES[secondary.scope]?.[secondary.routeKey];

                    if (targetRoute?.path) {
                      setLocation(targetRoute.path);
                      return;
                    }
                  }}
                >
                  {secondary.label}
                </Button>
              ))}
            </div>
          )}
          {metadata && metadata.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{metadataTitle}</p>
              <ul className="space-y-1">
                {metadata.map((item) => (
                  <li
                    key={`${item.label ?? 'item'}-${item.value}`}
                    className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-[11px] font-mono text-muted-foreground"
                  >
                    {item.label && <span className="text-foreground/70">{item.label}</span>}
                    <span className="text-foreground/60">{item.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      )}
      {footer && <CardFooter>{footer}</CardFooter>}
    </Card>
  );
}


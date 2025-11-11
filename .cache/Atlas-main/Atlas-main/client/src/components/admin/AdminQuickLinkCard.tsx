import React, { type ComponentType, useMemo } from 'react';
import { AdminCard } from './AdminCard';
import type { AdminRouteId } from '@shared/adminRoutes';

interface QuickLinkEndpoint {
  method: string;
  path: string;
}

export interface AdminQuickLinkCardProps {
  title: string;
  description: string;
  actionLabel: string;
  routeId: AdminRouteId;
  icon: ComponentType<{ className?: string }>;
  endpoints: QuickLinkEndpoint[];
  actionTestId?: string;
}

export function AdminQuickLinkCard({
  title,
  description,
  actionLabel,
  routeId,
  icon,
  endpoints,
  actionTestId,
}: AdminQuickLinkCardProps) {
  const metadata = useMemo(
    () =>
      endpoints.map((endpoint) => ({
        label: endpoint.method,
        value: endpoint.path,
      })),
    [endpoints],
  );

  return (
    <AdminCard
      icon={icon}
      title={title}
      description={description}
      action={{
        label: actionLabel,
        scope: 'system',
        routeKey: routeId,
        testId: actionTestId,
      }}
      metadata={metadata}
    />
  );
}

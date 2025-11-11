import { Cloud, Book, Mail, Calendar, Plug } from 'lucide-react';
import { useLocation } from 'wouter';
import { useQuery, useQueries } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface Integration {
  id: string;
  label: string;
  icon: any;
  queryKey: string;
  dataTestId: string;
}

const INTEGRATIONS: Integration[] = [
  {
    id: 'google-drive',
    label: 'Google Drive',
    icon: Cloud,
    queryKey: '/api/integrations/google-drive/status',
    dataTestId: 'button-google-drive-menu',
  },
  {
    id: 'notion',
    label: 'Notion',
    icon: Book,
    queryKey: '/api/integrations/notion/status',
    dataTestId: 'button-notion-menu',
  },
  {
    id: 'gmail',
    label: 'Gmail',
    icon: Mail,
    queryKey: '/api/integrations/gmail/status',
    dataTestId: 'button-gmail-menu',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: Calendar,
    queryKey: '/api/integrations/calendar/status',
    dataTestId: 'button-calendar-menu',
  },
];

function IntegrationItem({ 
  integration,
  queryResult 
}: { 
  integration: Integration;
  queryResult: any;
}) {
  const [, setLocation] = useLocation();
  const Icon = integration.icon;
  
  // Only mark as connected if query is successful and data indicates connection
  const status = queryResult.data as IntegrationStatus | undefined;
  const isConnected = (queryResult.status === 'success' || queryResult.isSuccess) && status?.connected === true;
  
  const handleClick = () => {
    if (integration.id === 'google-drive') {
      setLocation('/google-drive');
    } else {
      const params = new URLSearchParams({ settings: 'integrations' });
      if (integration.id === 'notion') {
        params.set('provider', 'notion');
      }
      setLocation(`/?${params.toString()}`);
    }
  };
  
  return (
    <button
      onClick={handleClick}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover-elevate active-elevate-2 text-left"
      data-testid={integration.dataTestId}
    >
      <div className="relative flex-shrink-0">
        <Icon className={cn(
          "h-4 w-4",
          isConnected ? "text-green-600 dark:text-green-500" : "text-muted-foreground"
        )} />
        {isConnected && (
          <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-green-600 dark:bg-green-500 border border-background" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{integration.label}</p>
        <p className="text-xs text-muted-foreground">
          {isConnected ? 'Connected' : 'Not connected'}
        </p>
      </div>
    </button>
  );
}

type IntegrationStatus = { connected?: boolean; needsAuth?: boolean; error?: string };

export function IntegrationsMenu() {
  // Fetch all integration statuses using useQueries
  const statusQueries = useQueries({
    queries: INTEGRATIONS.map(integration => ({
      queryKey: [integration.queryKey],
      retry: false,
    }))
  });

  // Check if any integration is connected (only if query is successful and data indicates connection)
  const hasAnyConnection = statusQueries.some((result, index) => {
    const integration = INTEGRATIONS[index];
    const status = result.data as IntegrationStatus | undefined;
    return (result.status === 'success' || result.isSuccess) && status?.connected === true;
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 flex-shrink-0 relative"
          data-testid="button-integrations-menu"
          title="Integrations"
          aria-label="Integrations"
        >
          <Plug className="h-4 w-4 text-muted-foreground" />
          {hasAnyConnection && (
            <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-600 dark:bg-green-500 border border-background" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-56 p-2" 
        align="start"
        side="top"
        data-testid="integrations-menu-content"
      >
        <div className="space-y-1">
          <div className="px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Integrations
            </p>
          </div>
          {INTEGRATIONS.map((integration, index) => (
            <IntegrationItem 
              key={integration.id} 
              integration={integration}
              queryResult={statusQueries[index]}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

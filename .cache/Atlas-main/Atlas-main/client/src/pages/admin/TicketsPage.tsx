import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Inbox, LifeBuoy, Loader2 } from 'lucide-react';
import { useAdminLayout } from '@/components/AdminLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { getAdminRouteById } from '@shared/adminRoutes';
import type { AdminTicket, AdminTicketsResponse, TicketStatus } from './types';

export const TICKET_STATUS_OPTIONS: TicketStatus[] = ['open', 'pending', 'closed'];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  pending: 'Pending',
  closed: 'Closed',
};

const STATUS_BADGE_VARIANT: Record<TicketStatus, 'default' | 'secondary' | 'outline'> = {
  open: 'default',
  pending: 'secondary',
  closed: 'outline',
};

export interface TicketDrawerFormState {
  status: TicketStatus;
  assignee: string;
}

export const EMPTY_TICKET_FORM: TicketDrawerFormState = {
  status: 'open',
  assignee: '',
};

const normalizeTicketStatus = (status: string | null | undefined): TicketStatus => {
  const normalized = (status ?? '').toLowerCase() as TicketStatus;
  if (TICKET_STATUS_OPTIONS.includes(normalized)) {
    return normalized;
  }
  return 'open';
};

export const initializeTicketFormState = (ticket: AdminTicket | null): TicketDrawerFormState => {
  if (!ticket) {
    return { ...EMPTY_TICKET_FORM };
  }

  return {
    status: normalizeTicketStatus(typeof ticket.status === 'string' ? ticket.status : null),
    assignee: ticket.assignee?.trim() ?? '',
  };
};

export interface MockUpdateTicketInput {
  id: string;
  status: TicketStatus;
  assignee: string;
}

export const mockUpdateTicket = async ({ id, status, assignee }: MockUpdateTicketInput) => {
  await new Promise((resolve) => setTimeout(resolve, 150));

  return {
    mock: true as const,
    ticket: {
      id,
      status: normalizeTicketStatus(status),
      assignee: assignee.trim() || null,
    },
  };
};

export interface TicketsTableCardProps {
  tickets: AdminTicket[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onSelect: (ticket: AdminTicket) => void;
  selectedTicketId: string | null;
}

export function TicketsTableCard({
  tickets,
  isLoading,
  isError,
  onRetry,
  onSelect,
  selectedTicketId,
}: TicketsTableCardProps) {
  const hasTickets = tickets.length > 0;

  return (
    <Card data-testid="card-tickets">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <LifeBuoy className="h-4 w-4 text-primary" />
          Support tickets
        </CardTitle>
        <CardDescription>Monitor escalations and triage workload.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div
            data-testid="tickets-loading"
            className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-muted-foreground/30 p-6 text-center text-sm text-muted-foreground"
          >
            <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
            <p>Fetching support tickets…</p>
          </div>
        ) : isError ? (
          <div
            data-testid="tickets-error"
            className="flex flex-col items-center justify-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-6 text-center text-sm text-muted-foreground"
          >
            <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
            <p>We hit a snag loading tickets.</p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : !hasTickets ? (
          <div
            data-testid="tickets-empty"
            className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-muted-foreground/30 p-6 text-center text-sm text-muted-foreground"
          >
            <Inbox className="h-5 w-5" aria-hidden="true" />
            <p>No tickets to review right now.</p>
            <p className="text-xs text-muted-foreground">
              Connect your support desk integration to sync live cases into Atlas.
            </p>
          </div>
        ) : (
          <div className="space-y-3" data-testid="tickets-table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/4">Ticket</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assignee</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((ticket) => {
                  const isSelected = selectedTicketId === ticket.id;
                  return (
                    <TableRow
                      key={ticket.id}
                      data-testid={`ticket-row-${ticket.id}`}
                      data-state={isSelected ? 'selected' : undefined}
                      className="cursor-pointer"
                      onClick={() => onSelect(ticket)}
                    >
                      <TableCell className="font-medium">{ticket.id}</TableCell>
                      <TableCell>
                        <TicketStatusBadge status={normalizeTicketStatus(ticket.status as string | null | undefined)} />
                      </TableCell>
                      <TableCell>{ticket.assignee?.trim() || 'Unassigned'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground">
              Select a ticket to review mock assignment options.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export interface TicketDrawerFieldsProps {
  formState: TicketDrawerFormState;
  onFieldChange: <Field extends keyof TicketDrawerFormState>(
    field: Field,
    value: TicketDrawerFormState[Field],
  ) => void;
}

export function TicketDrawerFields({ formState, onFieldChange }: TicketDrawerFieldsProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <Label htmlFor="ticket-status">Status</Label>
        <select
          id="ticket-status"
          value={formState.status}
          onChange={(event) => onFieldChange('status', normalizeTicketStatus(event.target.value))}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="ticket-status-select"
        >
          {TICKET_STATUS_OPTIONS.map((option) => (
            <option key={option} value={option} data-testid={`ticket-status-option-${option}`}>
              {TICKET_STATUS_LABELS[option]}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          This status is illustrative. The live integration will sync with your help desk.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="ticket-assignee">Assignee</Label>
        <Input
          id="ticket-assignee"
          value={formState.assignee}
          onChange={(event) => onFieldChange('assignee', event.target.value)}
          placeholder="e.g., support@atlas.dev"
          data-testid="ticket-assignee-input"
        />
        <p className="text-xs text-muted-foreground">Assigning a teammate will notify them in the final build.</p>
      </div>
    </div>
  );
}

interface TicketStatusBadgeProps {
  status: TicketStatus;
}

export function TicketStatusBadge({ status }: TicketStatusBadgeProps) {
  return (
    <Badge variant={STATUS_BADGE_VARIANT[status]} data-testid={`ticket-status-${status}`}>
      {TICKET_STATUS_LABELS[status]}
    </Badge>
  );
}

export default function TicketsPage() {
  const { setHeader, resetHeader } = useAdminLayout();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const route = getAdminRouteById('tickets');
  const headerTitle = route.pageHeader?.title ?? route.label;
  const headerDescription =
    route.pageHeader?.description ?? route.dashboardCards?.workspace?.description ??
    'Keep pace with customer support volume.';

  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [formState, setFormState] = useState<TicketDrawerFormState>(EMPTY_TICKET_FORM);

  const ticketsQuery = useQuery<AdminTicketsResponse>({
    queryKey: ['admin-tickets'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/tickets');
      return (await response.json()) as AdminTicketsResponse;
    },
  });

  const tickets = useMemo<AdminTicket[]>(() => ticketsQuery.data?.tickets ?? [], [ticketsQuery.data?.tickets]);

  const updateTicketMutation = useMutation({
    mutationFn: (input: MockUpdateTicketInput) => mockUpdateTicket(input),
    onSuccess: async () => {
      toast({
        title: 'Ticket updated',
        description: 'This mock save illustrates the edit flow. Data refreshes from the tickets API.',
      });
      await queryClient.invalidateQueries({ queryKey: ['admin-tickets'] });
      setIsDrawerOpen(false);
      setSelectedTicketId(null);
      setFormState(EMPTY_TICKET_FORM);
    },
    onError: (error: unknown) => {
      toast({
        title: 'Unable to update ticket',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    },
  });

  const handleSelectTicket = useCallback((ticket: AdminTicket) => {
    setSelectedTicketId(ticket.id);
    setFormState(initializeTicketFormState(ticket));
    setIsDrawerOpen(true);
  }, []);

  const handleDrawerChange = useCallback((nextOpen: boolean) => {
    setIsDrawerOpen(nextOpen);
    if (!nextOpen) {
      setSelectedTicketId(null);
      setFormState(EMPTY_TICKET_FORM);
    }
  }, []);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedTicketId) return;
      updateTicketMutation.mutate({
        id: selectedTicketId,
        status: formState.status,
        assignee: formState.assignee,
      });
    },
    [formState.assignee, formState.status, selectedTicketId, updateTicketMutation],
  );

  useEffect(() => {
    setHeader({
      title: headerTitle,
      description: headerDescription,
    });
    return () => resetHeader();
  }, [setHeader, resetHeader, headerTitle, headerDescription]);

  return (
    <div className="flex-1 overflow-auto px-4 py-6 sm:px-6">
      <Drawer open={isDrawerOpen} onOpenChange={handleDrawerChange}>
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
          <TicketsTableCard
            tickets={tickets}
            isLoading={ticketsQuery.isLoading}
            isError={ticketsQuery.isError}
            onRetry={() => ticketsQuery.refetch()}
            onSelect={handleSelectTicket}
            selectedTicketId={selectedTicketId}
          />
        </div>

        <DrawerContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
            <DrawerHeader className="text-left">
              <DrawerTitle>Edit ticket</DrawerTitle>
              <DrawerDescription>
                Adjust status or ownership for this mocked record. Live updates will sync with the connected help desk.
              </DrawerDescription>
            </DrawerHeader>
            <TicketDrawerFields
              formState={formState}
              onFieldChange={(field, value) =>
                setFormState((previous) => ({ ...previous, [field]: value }))
              }
            />
            <DrawerFooter className="sm:flex-row sm:justify-end">
              <DrawerClose asChild>
                <Button type="button" variant="outline" disabled={updateTicketMutation.isPending}>
                  Cancel
                </Button>
              </DrawerClose>
              <Button type="submit" disabled={updateTicketMutation.isPending || !selectedTicketId}>
                {updateTicketMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Save changes
              </Button>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

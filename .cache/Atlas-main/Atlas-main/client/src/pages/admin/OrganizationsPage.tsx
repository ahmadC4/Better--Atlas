import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpDown, Loader2, Pencil } from 'lucide-react';
import { useAdminLayout } from '@/components/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { getAdminRouteById } from '@shared/adminRoutes';
import type { AdminOrganization, AdminOrganizationsResponse } from './types';

export type OrganizationSortKey = 'name' | 'members';
export type OrganizationSortDirection = 'asc' | 'desc';

export interface OrganizationSortState {
  key: OrganizationSortKey;
  direction: OrganizationSortDirection;
}

export const DEFAULT_ORGANIZATION_SORT: OrganizationSortState = {
  key: 'name',
  direction: 'asc',
};

export const sortOrganizations = (
  organizations: AdminOrganization[],
  sortState: OrganizationSortState,
): AdminOrganization[] => {
  const sorted = [...organizations];
  const { key, direction } = sortState;
  sorted.sort((a, b) => {
    const factor = direction === 'asc' ? 1 : -1;
    if (key === 'name') {
      return a.name.localeCompare(b.name) * factor;
    }
    return (a.members - b.members) * factor;
  });
  return sorted;
};

export interface OrganizationFormState {
  name: string;
  members: string;
  notes: string;
}

export const initializeOrganizationFormState = (
  organization: AdminOrganization,
): OrganizationFormState => ({
  name: organization.name,
  members: organization.members.toString(),
  notes: organization.notes ?? '',
});

export interface MockUpdateOrganizationInput extends OrganizationFormState {
  id: string;
}

export const mockUpdateOrganization = async (
  input: MockUpdateOrganizationInput,
) => {
  // Mock mutation used until the real admin organization update endpoint is ready.
  await new Promise(resolve => setTimeout(resolve, 200));
  return {
    organization: {
      id: input.id,
      name: input.name.trim(),
      members: Number.parseInt(input.members, 10) || 0,
      notes: input.notes.trim(),
    },
    mock: true,
  };
};

export interface OrganizationsTableCardProps {
  organizations: AdminOrganization[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  sortState: OrganizationSortState;
  onSortChange: (state: OrganizationSortState) => void;
  onEdit: (organization: AdminOrganization) => void;
}

export function OrganizationsTableCard({
  organizations,
  isLoading,
  isError,
  onRetry,
  sortState,
  onSortChange,
  onEdit,
}: OrganizationsTableCardProps) {
  const handleSortClick = useCallback(
    (key: OrganizationSortKey) => {
      const isSameKey = sortState.key === key;
      const nextDirection: OrganizationSortDirection = isSameKey && sortState.direction === 'asc' ? 'desc' : 'asc';
      onSortChange({ key, direction: nextDirection });
    },
    [onSortChange, sortState],
  );

  if (isLoading) {
    return (
      <Card data-testid="organizations-loading">
        <CardHeader>
          <CardTitle>Organizations &amp; Teams</CardTitle>
          <CardDescription>Loading workspace directory…</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">Fetching organizations…</p>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card data-testid="organizations-error">
        <CardHeader>
          <CardTitle>Organizations &amp; Teams</CardTitle>
          <CardDescription>We couldn&apos;t load the organization directory.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Something went wrong while loading organizations. Please try again.
          </p>
          <Button variant="outline" onClick={onRetry} data-testid="organizations-retry">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (organizations.length === 0) {
    return (
      <Card data-testid="organizations-empty">
        <CardHeader>
          <CardTitle>Organizations &amp; Teams</CardTitle>
          <CardDescription>Monitor workspace adoption by team.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 py-10 text-center text-sm text-muted-foreground">
          <p>No organizations have been connected yet.</p>
          <p className="text-xs text-muted-foreground">
            Connect a directory provider to import workspace members and track adoption trends.
          </p>
        </CardContent>
      </Card>
    );
  }

  const sortedOrganizations = sortOrganizations(organizations, sortState);

  return (
    <Card data-testid="organizations-table">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Organizations &amp; Teams</CardTitle>
            <CardDescription>Review workspace adoption and team size.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => onSortChange({ ...DEFAULT_ORGANIZATION_SORT })}>
            Reset sort
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <button
                  type="button"
                  onClick={() => handleSortClick('name')}
                  className="flex items-center gap-1 font-medium text-foreground"
                  data-testid="sort-name"
                >
                  Organization
                  <ArrowUpDown className="h-4 w-4" aria-hidden />
                </button>
              </TableHead>
              <TableHead className="w-32">
                <button
                  type="button"
                  onClick={() => handleSortClick('members')}
                  className="flex items-center gap-1 font-medium text-foreground"
                  data-testid="sort-members"
                >
                  Members
                  <ArrowUpDown className="h-4 w-4" aria-hidden />
                </button>
              </TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-28 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedOrganizations.map((organization) => (
              <TableRow key={organization.id} data-testid={`organization-row-${organization.id}`}>
                <TableCell className="font-medium">{organization.name}</TableCell>
                <TableCell>{organization.members}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {organization.notes?.length ? organization.notes : 'Add context or escalation notes.'}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(organization)}
                    data-testid={`edit-organization-${organization.id}`}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">
          Sorting is client-side while the admin organizations API is under active development.
        </p>
      </CardContent>
    </Card>
  );
}

export interface OrganizationFormFieldsProps {
  formState: OrganizationFormState;
  onFieldChange: (field: keyof OrganizationFormState, value: string) => void;
}

export function OrganizationFormFields({ formState, onFieldChange }: OrganizationFormFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="organization-name">Organization name</Label>
        <Input
          id="organization-name"
          value={formState.name}
          onChange={(event) => onFieldChange('name', event.target.value)}
          placeholder="Acme Corp"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="organization-members">Member count</Label>
        <Input
          id="organization-members"
          type="number"
          min={0}
          value={formState.members}
          onChange={(event) => onFieldChange('members', event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="organization-notes">Notes</Label>
        <Textarea
          id="organization-notes"
          value={formState.notes}
          onChange={(event) => onFieldChange('notes', event.target.value)}
          placeholder="Document renewals, blockers, or escalations."
          rows={4}
        />
      </div>
    </div>
  );
}

const EMPTY_FORM_STATE: OrganizationFormState = {
  name: '',
  members: '',
  notes: '',
};

export default function OrganizationsPage() {
  const { setHeader, resetHeader } = useAdminLayout();
  const route = getAdminRouteById('organizations');
  const headerTitle = route.pageHeader?.title ?? route.label;
  const headerDescription =
    route.pageHeader?.description ?? route.dashboardCards?.workspace?.description ??
    'Review workspace adoption and team size.';

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [sortState, setSortState] = useState<OrganizationSortState>(DEFAULT_ORGANIZATION_SORT);
  const [selectedOrganization, setSelectedOrganization] = useState<AdminOrganization | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [formState, setFormState] = useState<OrganizationFormState>(EMPTY_FORM_STATE);

  const organizationsQuery = useQuery<AdminOrganizationsResponse>({
    queryKey: ['/api/admin/orgs'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/orgs');
      return (await response.json()) as AdminOrganizationsResponse;
    },
  });

  const organizations = useMemo<AdminOrganization[]>(() => {
    const data = organizationsQuery.data;
    if (!data) return [];
    if (Array.isArray(data.organizations)) {
      return data.organizations;
    }
    if (Array.isArray(data.orgs)) {
      return data.orgs;
    }
    return [];
  }, [organizationsQuery.data]);

  const updateOrganizationMutation = useMutation({
    mutationFn: (input: MockUpdateOrganizationInput) => mockUpdateOrganization(input),
    onSuccess: async () => {
      toast({
        title: 'Organization updated',
        description: 'This is a mock update. Data refreshes from the admin organizations API.',
      });
      setIsDrawerOpen(false);
      setSelectedOrganization(null);
      setFormState(EMPTY_FORM_STATE);
      await queryClient.invalidateQueries({ queryKey: ['/api/admin/orgs'] });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Unable to update organization',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    },
  });

  const handleEdit = useCallback(
    (organization: AdminOrganization) => {
      setSelectedOrganization(organization);
      setFormState(initializeOrganizationFormState(organization));
      setIsDrawerOpen(true);
    },
    [],
  );

  const handleDrawerChange = useCallback((nextOpen: boolean) => {
    setIsDrawerOpen(nextOpen);
    if (!nextOpen) {
      setSelectedOrganization(null);
      setFormState(EMPTY_FORM_STATE);
    }
  }, []);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedOrganization) return;
      updateOrganizationMutation.mutate({
        id: selectedOrganization.id,
        ...formState,
      });
    },
    [formState, selectedOrganization, updateOrganizationMutation],
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
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <OrganizationsTableCard
            organizations={organizations}
            isLoading={organizationsQuery.isLoading}
            isError={organizationsQuery.isError}
            onRetry={() => organizationsQuery.refetch()}
            sortState={sortState}
            onSortChange={setSortState}
            onEdit={handleEdit}
          />
        </div>

        <DrawerContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
            <DrawerHeader className="text-left">
              <DrawerTitle>Edit organization</DrawerTitle>
              <DrawerDescription>
                Review directory details and leave notes for other admins. This drawer uses a mock save endpoint.
              </DrawerDescription>
            </DrawerHeader>
            <OrganizationFormFields
              formState={formState}
              onFieldChange={(field, value) => setFormState((prev) => ({ ...prev, [field]: value }))}
            />
            <DrawerFooter className="sm:flex-row sm:justify-end">
              <DrawerClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DrawerClose>
              <Button type="submit" disabled={updateOrganizationMutation.isPending || !selectedOrganization}>
                {updateOrganizationMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Pencil className="mr-2 h-4 w-4" />
                )}
                Save changes
              </Button>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

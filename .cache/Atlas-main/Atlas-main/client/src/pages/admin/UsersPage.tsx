import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Users, Loader2, ChevronDown, Building2, CreditCard, Bot, Brain, LifeBuoy } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/queryClient';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { UserStatus } from '@shared/schema';
import type { AdminUser, AdminUsersResponse } from './types';
import { USER_STATUS_LABELS, userStatusOptions } from './utils';
import { useAdminLayout } from '@/components/AdminLayout';

export interface UsersOverviewMetrics {
  activeUsers: number;
  suspendedUsers: number;
  planSummary: Array<{ label: string; count: number }>;
}

export const userPlanOptions = [
  {
    value: 'free',
    label: 'Free plan',
    description: 'Core features for individuals and small teams.',
  },
  {
    value: 'pro',
    label: 'Pro plan',
    description: 'Advanced collaboration tools and analytics.',
  },
  {
    value: 'enterprise',
    label: 'Enterprise plan',
    description: 'Custom controls, premium support, and SLAs.',
  },
] as const;

export type UserPlan = (typeof userPlanOptions)[number]['value'];

export const getUserPlanLabel = (plan?: string | null) => {
  const normalizedPlan = typeof plan === 'string' ? plan.trim().toLowerCase() : '';
  return userPlanOptions.find((option) => option.value === normalizedPlan)?.label ?? 'Unassigned plan';
};

export const buildUsersOverviewMetrics = (users: AdminUser[]): UsersOverviewMetrics => {
  const activeUsers = users.filter((user) => user.status === 'active').length;
  const suspendedUsers = users.filter((user) => user.status === 'suspended').length;

  const counts = users.reduce<Record<string, number>>((acc, user) => {
    const normalizedPlan = (user.plan ?? '').trim().toLowerCase();
    const key = normalizedPlan.length > 0 ? normalizedPlan : 'unassigned';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const formatPlanLabel = (plan: string) =>
    plan
      .split(/[-_\s]+/u)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');

  const planSummary = Object.entries(counts)
    .sort(([, countA], [, countB]) => countB - countA)
    .map(([plan, count]) => ({
      label: plan === 'unassigned' ? 'Unassigned plan' : formatPlanLabel(plan),
      count,
    }));

  return { activeUsers, suspendedUsers, planSummary };
};

export interface UsersOverviewSectionProps {
  users: AdminUser[];
  metrics: UsersOverviewMetrics;
}

export function UsersOverviewSection({ users, metrics }: UsersOverviewSectionProps) {
  const { activeUsers, suspendedUsers, planSummary } = metrics;

  return (
    <section className="grid gap-4 md:grid-cols-2">
      <Card data-testid="card-organizations">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-4 w-4 text-primary" />
            Organizations / Teams
          </CardTitle>
          <CardDescription>Track workspace adoption and seat usage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {users.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 rounded-md border border-muted-foreground/40 bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Active seats</p>
                <p className="text-lg font-semibold">{activeUsers}</p>
              </div>
              <div className="space-y-1 rounded-md border border-muted-foreground/40 bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Suspended users</p>
                <p className="text-lg font-semibold">{suspendedUsers}</p>
              </div>
              <div className="space-y-1 rounded-md border border-dashed border-muted-foreground/40 p-3 sm:col-span-2">
                <p className="text-sm font-medium">Workspace membership</p>
                <p className="text-xs text-muted-foreground">
                  Sync organization directories to surface team-level seat allocation.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2 rounded-md border border-dashed border-muted-foreground/40 p-4 text-sm text-muted-foreground">
              <p>No team data yet.</p>
              <p className="text-xs text-muted-foreground">Connect your first organization to monitor team membership.</p>
            </div>
          )}
        </CardContent>
      </Card>
      <Card data-testid="card-plans">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CreditCard className="h-4 w-4 text-primary" />
            User Plans &amp; Subscriptions
          </CardTitle>
          <CardDescription>Monitor plan mix and upgrade opportunities.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {planSummary.length > 0 ? (
            <ul className="space-y-2">
              {planSummary.map((plan) => (
                <li
                  key={plan.label}
                  className="flex items-center justify-between rounded-md border border-muted-foreground/40 bg-card/50 p-3"
                >
                  <span className="text-sm font-medium">{plan.label}</span>
                  <span className="text-sm text-muted-foreground">{plan.count} seat{plan.count === 1 ? '' : 's'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-1 rounded-md border border-dashed border-muted-foreground/40 p-4 text-center text-sm text-muted-foreground">
              <p>No plan assignments yet.</p>
              <p className="text-xs text-muted-foreground">Plan counts will appear once users are onboarded.</p>
            </div>
          )}
        </CardContent>
      </Card>
      <Card data-testid="card-user-agents">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="h-4 w-4 text-primary" />
            User AI Agents
          </CardTitle>
          <CardDescription>Review which assistants are provisioned to each user.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 rounded-md border border-dashed border-muted-foreground/40 p-4 text-sm text-muted-foreground">
            <p>Agent assignments are not connected yet.</p>
            <p className="text-xs text-muted-foreground">
              Link agent provisioning to surface usage by workspace members.
            </p>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>See which copilots each team relies on.</li>
            <li>Spot inactive assignments to reclaim seats.</li>
          </ul>
        </CardContent>
      </Card>
      <Card data-testid="card-knowledge">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain className="h-4 w-4 text-primary" />
            User Knowledge &amp; Memory
          </CardTitle>
          <CardDescription>Surface knowledge base adoption across the workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 rounded-md border border-dashed border-muted-foreground/40 p-4 text-sm text-muted-foreground">
            <p>No knowledge sources linked yet.</p>
            <p className="text-xs text-muted-foreground">
              Connect shared knowledge bases to view ingestion and memory stats per team.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Import knowledge items to make workspace insights available for every user session.
          </p>
        </CardContent>
      </Card>
      <Card data-testid="card-support" className="md:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <LifeBuoy className="h-4 w-4 text-primary" />
            Support / Tickets
          </CardTitle>
          <CardDescription>Keep an eye on escalations and support load.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {['Open', 'Pending', 'Resolved'].map((label) => (
              <div key={label} className="space-y-1 rounded-md border border-muted-foreground/40 bg-muted/30 p-3 text-center">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold">0</p>
              </div>
            ))}
          </div>
          <div className="space-y-2 rounded-md border border-dashed border-muted-foreground/40 p-4 text-sm text-muted-foreground">
            <p>No support integration connected.</p>
            <p className="text-xs text-muted-foreground">
              Connect your help desk to sync cases automatically and notify admins in real time.
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export interface UserPlanDropdownProps {
  user: AdminUser;
  isUpdating: boolean;
  onSelect: (plan: UserPlan) => void;
}

export function UserPlanDropdown({ user, isUpdating, onSelect }: UserPlanDropdownProps) {
  const normalizedPlan = typeof user.plan === 'string' ? user.plan.trim().toLowerCase() : '';
  const currentPlanLabel = getUserPlanLabel(normalizedPlan);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-2 sm:w-auto"
          disabled={isUpdating}
          data-testid={`button-plan-${user.id}`}
        >
          {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-3 w-3" />}
          <span className="text-sm font-medium">{currentPlanLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64" forceMount>
        <DropdownMenuLabel>Choose plan</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {userPlanOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            disabled={isUpdating || normalizedPlan === option.value}
            onClick={() => onSelect(option.value)}
            className="flex flex-col items-start gap-0.5"
          >
            <span className="text-sm font-medium">{option.label}</span>
            <span className="text-xs text-muted-foreground">{option.description}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


export default function UsersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: currentUser, isAdmin, isLoading: isAuthLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [mutatingUserId, setMutatingUserId] = useState<string | null>(null);
  const { setHeader, resetHeader } = useAdminLayout();

  const usersQuery = useQuery<AdminUsersResponse>({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/users');
      return response.json();
    },
    enabled: isAdmin,
    refetchInterval: 30000,
    staleTime: 25000,
  });

  const users = usersQuery.data?.users ?? [];
  const overviewMetrics = useMemo(() => buildUsersOverviewMetrics(users), [users]);

  useEffect(() => {
    if (!isAuthLoading && !isAdmin) {
      setLocation('/');
    }
  }, [isAdmin, isAuthLoading, setLocation]);

  useEffect(() => {
    setHeader({
      title: 'User Management',
      description: 'Review user roles, reset access, and manage account status across the workspace.',
    });
    return () => resetHeader();
  }, [setHeader, resetHeader]);

  const userStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: UserStatus }) => {
      const response = await apiRequest('PATCH', `/api/admin/users/${id}/status`, { status });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error ?? 'Failed to update user status');
      }
      return response.json() as Promise<{ user: AdminUser }>;
    },
    onMutate: ({ id }) => {
      setMutatingUserId(id);
    },
    onSuccess: (result) => {
      queryClient.setQueryData<AdminUsersResponse | undefined>(['admin-users'], (current) => {
        if (!current) {
          return { users: [result.user] };
        }
        return {
          users: current.users.map((user) => (user.id === result.user.id ? result.user : user)),
        };
      });
      const statusLabel = USER_STATUS_LABELS[(result.user.status ?? 'active') as UserStatus] ?? result.user.status;
      toast({
        title: 'User status updated',
        description: `${result.user.name} is now ${statusLabel.toLowerCase()}.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to update user status',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setMutatingUserId(null);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const userPlanMutation = useMutation({
    mutationFn: async ({ id, plan }: { id: string; plan: UserPlan }) => {
      const response = await apiRequest('PATCH', `/api/admin/users/${id}/plan`, { plan });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error ?? 'Failed to update user plan');
      }
      return response.json() as Promise<{ user: AdminUser }>;
    },
    onMutate: ({ id }) => {
      setMutatingUserId(id);
    },
    onSuccess: (result) => {
      queryClient.setQueryData<AdminUsersResponse | undefined>(['admin-users'], (current) => {
        if (!current) {
          return { users: [result.user] };
        }
        return {
          users: current.users.map((user) => (user.id === result.user.id ? result.user : user)),
        };
      });
      const planLabel = getUserPlanLabel(result.user.plan);
      toast({
        title: 'User plan updated',
        description: `${result.user.name} is now on the ${planLabel.toLowerCase()}.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to update user plan',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setMutatingUserId(null);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const userPasswordResetMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest('POST', `/api/admin/users/${userId}/reset-password`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error ?? 'Failed to send password reset');
      }
      return response.json() as Promise<{ success: boolean; expiresAt: string }>;
    },
    onMutate: (userId) => {
      setMutatingUserId(userId);
    },
    onSuccess: (_, userId) => {
      const user = users.find(u => u.id === userId);
      toast({
        title: 'Password reset email sent',
        description: `A password reset link has been sent to ${user?.email || 'the user'}.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to send password reset',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setMutatingUserId(null);
    },
  });

  const userRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: 'user' | 'admin' | 'super_admin' }) => {
      const response = await apiRequest('PATCH', `/api/admin/users/${id}/role`, { role });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error ?? 'Failed to update user role');
      }
      return response.json() as Promise<{ user: AdminUser }>;
    },
    onMutate: ({ id }) => {
      setMutatingUserId(id);
    },
    onSuccess: (result) => {
      queryClient.setQueryData<AdminUsersResponse | undefined>(['admin-users'], (current) => {
        if (!current) {
          return { users: [result.user] };
        }
        return {
          users: current.users.map((user) => (user.id === result.user.id ? result.user : user)),
        };
      });
      toast({
        title: 'User role updated',
        description: `${result.user.name}'s role has been updated to ${result.user.role}.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to update user role',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setMutatingUserId(null);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  if (usersQuery.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center" data-testid="loading-users">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <Card data-testid="card-users">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-4 w-4 text-primary" />
              User dashboard
            </CardTitle>
            <CardDescription>Monitor account health and manage access.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {usersQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : users.length > 0 ? (
              <div className="space-y-3">
                {users.map((user) => {
                  const planLabel = getUserPlanLabel(user.plan);
                  const statusLabel = USER_STATUS_LABELS[(user.status ?? 'active') as UserStatus] ?? user.status;
                  const isUpdatingStatus = mutatingUserId === user.id && userStatusMutation.isPending;
                  const isUpdatingPlan = mutatingUserId === user.id && userPlanMutation.isPending;
                  return (
                    <div key={user.id} className="space-y-3 rounded-lg border bg-card p-3" data-testid={`user-${user.id}`}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-medium leading-none">{user.name}</p>
                          <p className="text-xs text-muted-foreground">{user.email ?? user.username ?? 'No email on file'}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {user.role === 'super_admin' ? (
                            <Badge variant="default" className="bg-purple-600 hover:bg-purple-700 rounded-full">
                              Super Admin
                            </Badge>
                          ) : user.role === 'admin' ? (
                            <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">
                              Admin
                            </Badge>
                          ) : (
                            <Badge
                              variant={
                                user.plan === 'enterprise'
                                  ? 'secondary'
                                  : user.plan === 'pro'
                                    ? 'default'
                                    : 'outline'
                              }
                            >
                              {planLabel}
                            </Badge>
                          )}
                          <Badge
                            variant={user.status === 'active' ? 'default' : user.status === 'suspended' ? 'destructive' : 'secondary'}
                          >
                            {statusLabel}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-muted-foreground">Manage account</p>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <UserPlanDropdown
                            user={user}
                            isUpdating={isUpdatingPlan}
                            onSelect={(plan) => userPlanMutation.mutate({ id: user.id, plan })}
                          />
                          {currentUser?.role === 'super_admin' && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="w-full gap-2 sm:w-auto"
                                  disabled={mutatingUserId === user.id && userRoleMutation.isPending}
                                  data-testid={`button-role-${user.id}`}
                                >
                                  {mutatingUserId === user.id && userRoleMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <ChevronDown className="h-3 w-3" />
                                  )}
                                  <span className="text-sm font-medium">
                                    {user.role === 'super_admin' ? 'Super Admin' : user.role === 'admin' ? 'Admin' : 'User'}
                                  </span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-60">
                                <DropdownMenuLabel>Choose role</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  disabled={mutatingUserId === user.id && userRoleMutation.isPending || user.role === 'user'}
                                  onClick={() => userRoleMutation.mutate({ id: user.id, role: 'user' })}
                                  className="flex flex-col items-start gap-0.5"
                                >
                                  <span className="text-sm font-medium">User</span>
                                  <span className="text-xs text-muted-foreground">Standard user with no admin privileges</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={mutatingUserId === user.id && userRoleMutation.isPending || user.role === 'admin'}
                                  onClick={() => userRoleMutation.mutate({ id: user.id, role: 'admin' })}
                                  className="flex flex-col items-start gap-0.5"
                                >
                                  <span className="text-sm font-medium">Admin</span>
                                  <span className="text-xs text-muted-foreground">Can access admin dashboard</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={mutatingUserId === user.id && userRoleMutation.isPending || user.role === 'super_admin'}
                                  onClick={() => userRoleMutation.mutate({ id: user.id, role: 'super_admin' })}
                                  className="flex flex-col items-start gap-0.5"
                                >
                                  <span className="text-sm font-medium">Super Admin</span>
                                  <span className="text-xs text-muted-foreground">Full system access and role management</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full gap-2 sm:w-auto"
                                disabled={isUpdatingStatus}
                                data-testid={`button-status-${user.id}`}
                              >
                                {isUpdatingStatus ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <ChevronDown className="h-3 w-3" />
                                )}
                                <span className="text-sm font-medium">{statusLabel}</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-60">
                              <DropdownMenuLabel>Choose status</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {userStatusOptions.map((option) => (
                                <DropdownMenuItem
                                  key={option.value}
                                  disabled={isUpdatingStatus || user.status === option.value}
                                  onClick={() => userStatusMutation.mutate({ id: user.id, status: option.value })}
                                  className="flex flex-col items-start gap-0.5"
                                >
                                  <span className="text-sm font-medium">{option.label}</span>
                                  <span className="text-xs text-muted-foreground">{option.description}</span>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full sm:w-auto"
                            disabled={mutatingUserId === user.id && userPasswordResetMutation.isPending}
                            onClick={() => {
                              if (confirm(`Send password reset email to ${user.email || 'this user'}?`)) {
                                userPasswordResetMutation.mutate(user.id);
                              }
                            }}
                            data-testid={`button-reset-password-${user.id}`}
                          >
                            {mutatingUserId === user.id && userPasswordResetMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              'Reset Password'
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No users found yet.</p>
            )}
          </CardContent>
        </Card>
        <UsersOverviewSection users={users} metrics={overviewMetrics} />
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useAdminLayout } from '@/components/AdminLayout';
import { getAdminRouteById } from '@shared/adminRoutes';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Users, Loader2, ChevronDown } from 'lucide-react';
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
import type { PlatformSettingsData, UserStatus } from '@shared/schema';
import type { AdminUser, AdminUsersResponse } from './types';
import { USER_STATUS_LABELS, formatPlanLabel, userStatusOptions } from './utils';

interface PlanOption {
  id: string;
  slug: string;
  label: string;
}

const normalizePlanSlug = (value?: string | null): string => {
  if (!value) {
    return '';
  }
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

export default function UsersPage() {
  const { setHeader, resetHeader } = useAdminLayout();
  const routeMeta = getAdminRouteById('user-management');
  useEffect(() => {
    setHeader({ title: routeMeta.pageHeader?.title ?? routeMeta.label, description: routeMeta.pageHeader?.description });
    return () => resetHeader();
  }, [setHeader, resetHeader]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: currentUser, isAdmin, isLoading: isAuthLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [mutatingUserId, setMutatingUserId] = useState<string | null>(null);

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

  const planOptionsQuery = useQuery<PlanOption[]>({
    queryKey: ['admin-plan-options'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/plans');
      const plans = (await response.json()) as Array<{ id: string; name: string; slug?: string | null; isActive: boolean }>;
      const activePlans = plans
        .filter((plan) => plan.isActive)
        .map<PlanOption | null>((plan) => {
          const slug = normalizePlanSlug(plan.slug ?? plan.name);
          if (!slug) {
            return null;
          }
          return { id: plan.id, slug, label: plan.name };
        })
        .filter((plan): plan is PlanOption => Boolean(plan));

      if (activePlans.length === 0) {
        return [
          { id: 'free', slug: 'free', label: 'Free' },
          { id: 'pro', slug: 'pro', label: 'Pro' },
          { id: 'enterprise', slug: 'enterprise', label: 'Enterprise' },
        ];
      }

      return activePlans.sort((a, b) => a.label.localeCompare(b.label));
    },
    enabled: currentUser?.role === 'super_admin',
    staleTime: 5 * 60 * 1000,
    onError: (error) => {
      console.error('Failed to load plan options', error);
      toast({
        title: 'Unable to load plan options',
        description: 'Plan changes are temporarily unavailable. Please try again later.',
        variant: 'destructive',
      });
    },
  });

  const planOptions = useMemo(() => {
    if (currentUser?.role !== 'super_admin') {
      return [] as PlanOption[];
    }
    return planOptionsQuery.data ?? [
      { id: 'free', slug: 'free', label: 'Free' },
      { id: 'pro', slug: 'pro', label: 'Pro' },
    ];
  }, [currentUser?.role, planOptionsQuery.data]);

  useEffect(() => {
    if (!isAuthLoading && !isAdmin) {
      setLocation('/');
    }
  }, [isAdmin, isAuthLoading, setLocation]);

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

  const userPlanMutation = useMutation({
    mutationFn: async ({
      id,
      planSlug,
      planId: selectedPlanId,
      effective,
    }: {
      id: string;
      planSlug?: string;
      planId?: string;
      effective?: 'immediate' | 'next_cycle';
    }) => {
      const payload: Record<string, unknown> = {
        effective: effective ?? 'immediate',
        prorate: true,
      };

      if (planSlug) {
        payload.plan = planSlug;
      }
      if (selectedPlanId) {
        payload.planId = selectedPlanId;
      }

      if (!payload.plan && !payload.planId) {
        throw new Error('Plan identifier is required');
      }

      const response = await apiRequest('PATCH', `/api/admin/users/${id}/plan`, payload);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error ?? 'Failed to update user plan');
      }
      return response.json() as Promise<{ user: AdminUser; applied: boolean }>;
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
        title: 'User plan updated',
        description: `${result.user.name} is now on the ${formatPlanLabel(result.user.planMetadata ?? result.user.plan)} plan.`,
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
                  const statusLabel = USER_STATUS_LABELS[(user.status ?? 'active') as UserStatus] ?? user.status;
                  const isUpdatingStatus = mutatingUserId === user.id && userStatusMutation.isPending;
                  const isUpdatingPlan = mutatingUserId === user.id && userPlanMutation.isPending;
                  const planLabel = formatPlanLabel(user.planMetadata ?? user.plan);
                  const planSlug = user.planMetadata?.slug ?? user.plan;
                  const isFreePlan = planSlug === 'free' || planSlug === 'basic';
                  return (
                    <div key={user.id} className="space-y-3 rounded-lg border bg-card p-3" data-testid={`user-${user.id}`}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-medium leading-none">{user.name}</p>
                          <p className="text-xs text-muted-foreground">{user.email ?? user.username ?? 'No email on file'}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {user.role === 'super_admin' ? (
                            <Badge variant="default" className="bg-purple-600 hover:bg-purple-700">
                              Super Admin
                            </Badge>
                          ) : user.role === 'admin' ? (
                            <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">
                              Admin
                            </Badge>
                          ) : (
                            <Badge variant={isFreePlan ? 'outline' : 'default'}>
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
                          {currentUser?.role === 'super_admin' && planOptions.length > 0 && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="w-full gap-2 sm:w-auto"
                                  disabled={isUpdatingPlan || planOptionsQuery.isLoading}
                                  data-testid={`button-plan-${user.id}`}
                                >
                                  {isUpdatingPlan ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <ChevronDown className="h-3 w-3" />
                                  )}
                                  <span className="text-sm font-medium">{planLabel}</span>
                                </Button>
                              </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-60">
                                  <DropdownMenuLabel>Choose plan</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  {planOptions.map((plan) => {
                                    const isCurrentPlan = planSlug === plan.slug;
                                    return (
                                      <DropdownMenuItem
                                        key={`${plan.id}:${plan.slug}`}
                                        disabled={isUpdatingPlan || isCurrentPlan}
                                        onClick={() => {
                                          if (!isCurrentPlan) {
                                            userPlanMutation.mutate({
                                              id: user.id,
                                              planSlug: plan.slug,
                                              planId: plan.id,
                                              effective: 'immediate',
                                            });
                                          }
                                        }}
                                        className="flex flex-col items-start gap-0.5 capitalize"
                                      >
                                        <span className="text-sm font-medium">{plan.label}</span>
                                        <span className="text-xs text-muted-foreground">
                                          {isCurrentPlan
                                            ? `Currently assigned (${plan.slug})`
                                            : `Apply plan (${plan.slug})`}
                                        </span>
                                      </DropdownMenuItem>
                                    );
                                  })}
                                </DropdownMenuContent>
                            </DropdownMenu>
                          )}
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
      </div>
    </div>
  );
}

import { useCallback, useMemo, useState, useEffect } from 'react';
import { useForm, type UseFormReturn, type UseFormSetError } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { format } from 'date-fns';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { parseDateTimeInput } from '@/lib/datetime';
import { proCouponCreateSchema, proCouponResponseSchema } from '@shared/schema';

const couponsQueryKey = ['admin-pro-coupons'] as const;

const couponFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, 'Coupon code must be at least 3 characters long')
    .max(64, 'Coupon code must be 64 characters or less')
    .regex(/^[A-Za-z0-9_-]+$/, 'Coupon codes may only contain letters, numbers, hyphens, and underscores.'),
  label: z.string().trim().max(120, 'Label must be 120 characters or less').optional(),
  description: z.string().trim().max(500, 'Description must be 500 characters or less').optional(),
  maxRedemptions: z.string().optional(),
  expiresAt: z.string().optional(),
  isActive: z.boolean().default(true),
});

export type CouponFormValues = z.infer<typeof couponFormSchema>;

type ProCouponResponse = z.infer<typeof proCouponResponseSchema>;

interface AdminCouponsResponse {
  coupons: ProCouponResponse[];
}

interface CouponPayload extends z.infer<typeof proCouponCreateSchema> {}

const couponStatus = (coupon: ProCouponResponse) => {
  if (!coupon.isActive) {
    return { label: 'Inactive', variant: 'secondary' as const };
  }
  if (coupon.expiresAt) {
    const expiresAt = new Date(coupon.expiresAt);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
      return { label: 'Expired', variant: 'destructive' as const };
    }
  }
  if (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions) {
    return { label: 'Redeemed', variant: 'secondary' as const };
  }
  return { label: 'Active', variant: 'default' as const };
};

const toLocalDateInput = (value: string | null): string => {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const formatDateTime = (value: string | null): string => {
  if (!value) {
    return 'No expiration';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Invalid date';
  }
  return format(date, 'PPpp');
};

const sanitizeCouponValues = (
  values: CouponFormValues,
  setError: UseFormSetError<CouponFormValues>,
): CouponPayload | null => {
  const sanitized = {
    code: values.code.trim().toUpperCase(),
    label: values.label?.trim() ? values.label.trim() : null,
    description: values.description?.trim() ? values.description.trim() : null,
    maxRedemptions: null as number | null,
    expiresAt: null as string | null,
    isActive: values.isActive,
  } satisfies CouponPayload;

  if (values.maxRedemptions && values.maxRedemptions.trim()) {
    const parsed = Number(values.maxRedemptions.trim());
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setError('maxRedemptions', { message: 'Max redemptions must be a positive integer' });
      return null;
    }
    sanitized.maxRedemptions = parsed;
  }

  if (values.expiresAt && values.expiresAt.trim()) {
    const parsed = parseDateTimeInput(values.expiresAt);
    if (!parsed) {
      setError('expiresAt', { message: 'Enter a valid date and time' });
      return null;
    }
    sanitized.expiresAt = parsed.toISOString();
  }

  const result = proCouponCreateSchema.safeParse(sanitized);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path?.[0] as keyof CouponFormValues | undefined;
    if (path && typeof path === 'string') {
      setError(path, { message: issue.message });
    } else {
      setError('code', { message: issue.message });
    }
    return null;
  }

  return result.data;
};

const couponFormDefaults: CouponFormValues = {
  code: '',
  label: '',
  description: '',
  maxRedemptions: '',
  expiresAt: '',
  isActive: true,
};

const sortCoupons = (coupons: ProCouponResponse[]) =>
  coupons.slice().sort((a, b) => a.code.localeCompare(b.code));

const AdminCouponsCard = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ProCouponResponse | null>(null);

  const couponsQuery = useQuery<AdminCouponsResponse>({
    queryKey: couponsQueryKey,
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/pro-coupons');
      return response.json();
    },
  });

  const coupons = useMemo(() => couponsQuery.data?.coupons ?? [], [couponsQuery.data]);

  const updateCachedCoupons = useCallback(
    (updater: (existing: ProCouponResponse[]) => ProCouponResponse[]) => {
      queryClient.setQueryData<AdminCouponsResponse | undefined>(couponsQueryKey, (current) => {
        const currentCoupons = current?.coupons ?? [];
        const nextCoupons = sortCoupons(updater(currentCoupons));
        return { coupons: nextCoupons } satisfies AdminCouponsResponse;
      });
    },
    [queryClient],
  );

  const createForm = useForm<CouponFormValues>({
    resolver: zodResolver(couponFormSchema),
    defaultValues: couponFormDefaults,
  });

  const editForm = useForm<CouponFormValues>({
    resolver: zodResolver(couponFormSchema),
    defaultValues: couponFormDefaults,
  });

  useEffect(() => {
    if (editing) {
      editForm.reset({
        code: editing.code,
        label: editing.label ?? '',
        description: editing.description ?? '',
        maxRedemptions: editing.maxRedemptions !== null ? String(editing.maxRedemptions) : '',
        expiresAt: toLocalDateInput(editing.expiresAt),
        isActive: editing.isActive,
      });
    }
  }, [editing, editForm]);

  const createMutation = useMutation({
    mutationFn: async (payload: CouponPayload) => {
      const response = await apiRequest('POST', '/api/admin/pro-coupons', payload);
      return response.json() as Promise<{ coupon: ProCouponResponse }>;
    },
    onSuccess: ({ coupon }) => {
      updateCachedCoupons((existing) => [coupon, ...existing.filter((item) => item.id !== coupon.id)]);
      queryClient.invalidateQueries({ queryKey: couponsQueryKey });
      createForm.reset(couponFormDefaults);
      toast({ title: 'Coupon created', description: 'The coupon is now available for users.' });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unable to create coupon';
      toast({ title: 'Failed to create coupon', description: message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: CouponPayload }) => {
      const response = await apiRequest('PUT', `/api/admin/pro-coupons/${id}`, payload);
      return response.json() as Promise<{ coupon: ProCouponResponse }>;
    },
    onSuccess: ({ coupon }) => {
      updateCachedCoupons((existing) =>
        existing.map((item) => (item.id === coupon.id ? coupon : item)),
      );
      queryClient.invalidateQueries({ queryKey: couponsQueryKey });
      setEditing(null);
      toast({ title: 'Coupon updated', description: 'Changes saved successfully.' });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unable to update coupon';
      toast({ title: 'Failed to update coupon', description: message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/admin/pro-coupons/${id}`);
      return response.json() as Promise<{ success: boolean }>;
    },
    onSuccess: (_result, id) => {
      updateCachedCoupons((existing) => existing.filter((coupon) => coupon.id !== id));
      queryClient.invalidateQueries({ queryKey: couponsQueryKey });
      toast({ title: 'Coupon removed', description: 'The coupon can no longer be redeemed.' });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unable to delete coupon';
      toast({ title: 'Failed to delete coupon', description: message, variant: 'destructive' });
    },
  });

  const handleCreate = createForm.handleSubmit((values) => {
    const payload = sanitizeCouponValues(values, createForm.setError);
    if (!payload) {
      return;
    }
    createMutation.mutate(payload);
  });

  const handleUpdate = editForm.handleSubmit((values) => {
    if (!editing) {
      return;
    }
    const payload = sanitizeCouponValues(values, editForm.setError);
    if (!payload) {
      return;
    }
    updateMutation.mutate({ id: editing.id, payload });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pro access coupons</CardTitle>
        <CardDescription>Create and manage coupons that unlock the Pro plan for selected teammates.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <Form {...createForm}>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={createForm.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Coupon code</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. TEAM2025" data-testid="input-coupon-code" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="label"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Label (optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Marketing team" data-testid="input-coupon-label" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="maxRedemptions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max redemptions (optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Unlimited" inputMode="numeric" data-testid="input-coupon-max" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="expiresAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expires at (optional)</FormLabel>
                      <FormControl>
                        <Input {...field} type="datetime-local" data-testid="input-coupon-expiration" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={createForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} placeholder="Notes for internal tracking" data-testid="input-coupon-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Active</FormLabel>
                      <CardDescription>This coupon can be redeemed immediately when active.</CardDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-coupon-active" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="flex justify-end">
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-create-coupon">
                  {createMutation.isPending ? 'Saving…' : 'Create coupon'}
                </Button>
              </div>
            </form>
          </Form>
        </section>

        <Separator />

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Existing coupons</h3>
            {couponsQuery.isLoading && <span className="text-sm text-muted-foreground">Loading…</span>}
          </div>
          {coupons.length === 0 && !couponsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">No coupons have been created yet.</p>
          ) : (
            <div className="space-y-3">
              {coupons.map((coupon) => {
                const status = couponStatus(coupon);
                return (
                  <div key={coupon.id} className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{coupon.code}</span>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                      {coupon.label && <p className="text-sm text-muted-foreground">{coupon.label}</p>}
                      {coupon.description && <p className="text-sm text-muted-foreground">{coupon.description}</p>}
                      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span>
                          Redeemed {coupon.redemptionCount}
                          {coupon.maxRedemptions ? ` / ${coupon.maxRedemptions}` : ''}
                        </span>
                        <span>Expires: {formatDateTime(coupon.expiresAt)}</span>
                        <span>Updated {formatDateTime(coupon.updatedAt)}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditing(coupon)} data-testid={`button-edit-coupon-${coupon.id}`}>
                        Edit
                      </Button>
                      <DeleteCouponButton
                        coupon={coupon}
                        onConfirm={() => deleteMutation.mutate(coupon.id)}
                        isPending={deleteMutation.isPending}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </CardContent>

      <EditCouponDialog
        coupon={editing}
        form={editForm}
        onClose={() => setEditing(null)}
        onSubmit={handleUpdate}
        isSubmitting={updateMutation.isPending}
      />
    </Card>
  );
};

const EditCouponDialog = ({
  coupon,
  form,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  coupon: ProCouponResponse | null;
  form: UseFormReturn<CouponFormValues>;
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}) => (
  <Dialog open={Boolean(coupon)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
    <DialogContent className="max-w-lg" data-testid="dialog-edit-coupon">
      <DialogHeader>
        <DialogTitle>Edit coupon</DialogTitle>
        <DialogDescription>Update redemption limits, expiration, or status.</DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form id="edit-coupon-form" onSubmit={onSubmit} className="space-y-4">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Coupon code</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="label"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Label</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={3} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="maxRedemptions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max redemptions</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="numeric" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="expiresAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expires at</FormLabel>
                  <FormControl>
                    <Input {...field} type="datetime-local" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <FormLabel>Active</FormLabel>
                  <DialogDescription>Inactive coupons cannot be redeemed.</DialogDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        </form>
      </Form>
      <DialogFooter className="gap-2 sm:justify-end">
        <Button variant="outline" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" form="edit-coupon-form" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save changes'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

const DeleteCouponButton = ({
  coupon,
  onConfirm,
  isPending,
}: {
  coupon: ProCouponResponse;
  onConfirm: () => void;
  isPending: boolean;
}) => (
  <AlertDialog>
    <AlertDialogTrigger asChild>
      <Button variant="destructive" size="sm" disabled={isPending} data-testid={`button-delete-coupon-${coupon.id}`}>
        Delete
      </Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete {coupon.code}?</AlertDialogTitle>
        <AlertDialogDescription>
          This coupon will no longer be redeemable. Existing Pro users will keep their plan.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm} disabled={isPending}>
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export default AdminCouponsCard;

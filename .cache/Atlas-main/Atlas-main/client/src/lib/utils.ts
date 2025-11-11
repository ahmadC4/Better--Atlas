import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type UserBadgeType = 'super_admin' | 'enterprise' | 'pro' | 'free';

export function getUserBadge(user: { role?: string; plan?: string } | null | undefined): UserBadgeType {
  if (!user) return 'free';
  if (user.role === 'super_admin') return 'super_admin';
  if (user.plan === 'enterprise') return 'enterprise';
  if (user.plan === 'pro') return 'pro';
  return 'free';
}

export function getUserBadgeLabel(badgeType: UserBadgeType): string {
  switch (badgeType) {
    case 'super_admin':
      return 'Super Admin';
    case 'enterprise':
      return 'Enterprise';
    case 'pro':
      return 'Pro';
    case 'free':
      return 'Free';
  }
}

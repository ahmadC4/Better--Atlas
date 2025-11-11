import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { EffectiveCapabilities } from "@shared/schema"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type UserBadgeType = 'super_admin' | 'pro' | 'free' | 'enterprise';

// Updated to optionally use capabilities for more accurate badge
export function getUserBadge(
  user: { role?: string; plan?: string } | null | undefined,
  capabilities?: EffectiveCapabilities | null
): UserBadgeType {
  if (!user) return 'free';
  if (user.role === 'super_admin') return 'super_admin';
  
  // If capabilities are provided, use them for accurate plan tier
  if (capabilities) {
    const tier = capabilities.plan.tier;
    if (tier === 'enterprise') return 'enterprise';
    if (tier === 'pro') return 'pro';
    return 'free';
  }
  
  // Fallback to user.plan if no capabilities
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

import type { User, UserPlan } from "@shared/schema";

type PlanFilter = UserPlan;

const PLAN_FILTER_VALUES: PlanFilter[] = ['free', 'pro', 'enterprise'];

export interface SerializedAdminUser {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  plan: User["plan"];
  role: User["role"];
  status: string;
  createdAt: string;
  updatedAt: string;
}

const normalizePlanQuery = (value: unknown): PlanFilter | undefined => {
  if (Array.isArray(value)) {
    return normalizePlanQuery(value[0]);
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.toLowerCase();
  return PLAN_FILTER_VALUES.find((plan) => plan === normalized) as PlanFilter | undefined;
};

export const filterSerializedAdminUsersByPlan = <T extends Pick<SerializedAdminUser, "plan">>(
  users: T[],
  planQuery: unknown,
): T[] => {
  const planFilter = normalizePlanQuery(planQuery);
  if (!planFilter) {
    return users;
  }

  return users.filter((user) => user.plan === planFilter);
};

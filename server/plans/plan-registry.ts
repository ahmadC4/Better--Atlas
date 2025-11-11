import type { Plan } from '../../shared/schema.js';
import type { IStorage } from '../storage/index.js';

export interface PlanPriceMapping {
  [priceId: string]: string;
}

const priceIdToSlug = new Map<string, string>();

function normalizeSlug(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function applyMapping(mapping: Map<string, string>): void {
  priceIdToSlug.clear();
  for (const [priceId, slug] of mapping.entries()) {
    const normalizedPrice = priceId.trim();
    const normalizedSlug = normalizeSlug(slug);
    if (!normalizedPrice || !normalizedSlug) {
      continue;
    }
    priceIdToSlug.set(normalizedPrice, normalizedSlug);
  }
}

function parseMappingInput(value: unknown): Map<string, string> {
  const map = new Map<string, string>();

  if (!value) {
    return map;
  }

  if (value instanceof Map) {
    for (const [priceId, slug] of value.entries()) {
      map.set(priceId, slug);
    }
    return map;
  }

  if (typeof value === 'string') {
    const segments = value.split(/[,\n]/);
    for (const segment of segments) {
      const [priceId, slug] = segment.split(':');
      if (!priceId || !slug) {
        continue;
      }
      map.set(priceId.trim(), slug.trim());
    }
    return map;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const priceId = Reflect.get(entry, 'priceId');
      const slug = Reflect.get(entry, 'slug') ?? Reflect.get(entry, 'plan') ?? Reflect.get(entry, 'planSlug');
      if (typeof priceId === 'string' && typeof slug === 'string') {
        map.set(priceId, slug);
      }
    }
    return map;
  }

  if (typeof value === 'object') {
    for (const [priceId, slug] of Object.entries(value as Record<string, unknown>)) {
      if (typeof slug === 'string') {
        map.set(priceId, slug);
      }
    }
    return map;
  }

  return map;
}

function loadMappingFromEnv(): void {
  const raw = process.env.STRIPE_PRICE_PLAN_MAP;
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    applyMapping(parseMappingInput(parsed));
    return;
  } catch {
    // Fall back to simple parsing rules if JSON.parse fails
  }

  applyMapping(parseMappingInput(raw));
}

loadMappingFromEnv();

export function setPlanPriceMapping(mapping: PlanPriceMapping | Map<string, string>): void {
  applyMapping(parseMappingInput(mapping));
}

export function getPlanSlugForPriceId(priceId: string): string | undefined {
  const normalized = priceId.trim();
  if (!normalized) {
    return undefined;
  }
  return priceIdToSlug.get(normalized);
}

export async function resolvePlanByIdentifier(storage: IStorage, identifier: string): Promise<Plan | undefined> {
  const trimmed = identifier?.trim();
  if (!trimmed) {
    return undefined;
  }

  const byId = await storage.getPlan(trimmed).catch(() => undefined);
  if (byId) {
    return byId;
  }

  const normalizedSlug = normalizeSlug(trimmed);
  if (!normalizedSlug) {
    return undefined;
  }

  const bySlug = await storage.getPlanBySlug(normalizedSlug).catch(() => undefined);
  if (bySlug) {
    return bySlug;
  }

  // Final fallback: try matching against plan names by normalization
  const plans = await storage.listPlans().catch(() => [] as Plan[]);
  for (const plan of plans) {
    if (normalizeSlug(plan.name) === normalizedSlug) {
      return plan;
    }
  }

  return undefined;
}

export async function resolvePlanFromPriceId(storage: IStorage, priceId: string): Promise<Plan | undefined> {
  const slug = getPlanSlugForPriceId(priceId);
  if (!slug) {
    return undefined;
  }
  return storage.getPlanBySlug(slug);
}

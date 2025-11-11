import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type PlanSummary = {
  name: string;
  tier: string;
};

type ModelSummary = {
  provider: string;
  modelId: string;
};

const defaultSqlPath = resolve(process.cwd(), "production-migration.sql");

export const loadMigrationSql = (filePath: string = defaultSqlPath): string => {
  const sqlPath = resolve(filePath);
  return readFileSync(sqlPath, "utf8");
};

const PLAN_INSERT_REGEX = /INSERT\s+INTO\s+plans[\s\S]+?VALUES\s*\(\s*'[^']+'\s*,\s*'([^']+)'\s*,\s*'([^']+)'/gi;
const MODEL_ROW_REGEX = /\('\s*[-0-9a-fA-F]+'\s*,\s*'([a-z]+)'\s*,\s*'([a-z0-9.-]+)'/gi;

export const extractPlans = (sql: string): PlanSummary[] => {
  const plans: PlanSummary[] = [];
  let match: RegExpExecArray | null;

  while ((match = PLAN_INSERT_REGEX.exec(sql)) !== null) {
    const [, name, tier] = match;
    plans.push({ name, tier });
  }

  return plans;
};

export const extractModels = (sql: string): ModelSummary[] => {
  const models: ModelSummary[] = [];
  let match: RegExpExecArray | null;

  while ((match = MODEL_ROW_REGEX.exec(sql)) !== null) {
    const [, provider, modelId] = match;
    models.push({ provider, modelId });
  }

  return models;
};

export const summarizeMigration = (filePath: string = defaultSqlPath) => {
  const sql = loadMigrationSql(filePath);
  const plans = extractPlans(sql);
  const models = extractModels(sql);

  const providerCounts = models.reduce<Record<string, number>>((acc, model) => {
    acc[model.provider] = (acc[model.provider] ?? 0) + 1;
    return acc;
  }, {});

  return {
    plans,
    models,
    providerCounts,
    totalModels: models.length,
  };
};

const isMainModule = (): boolean => {
  if (!process.argv[1]) {
    return false;
  }

  const entryPath = resolve(process.argv[1]);
  const currentPath = fileURLToPath(import.meta.url);
  return entryPath === currentPath;
};

if (isMainModule()) {
  const summary = summarizeMigration();

  console.log("Plans (name → tier):");
  for (const plan of summary.plans) {
    console.log(`- ${plan.name} → ${plan.tier}`);
  }

  console.log("\nModel counts by provider:");
  for (const [provider, count] of Object.entries(summary.providerCounts)) {
    console.log(`- ${provider}: ${count}`);
  }

  console.log(`\nTotal models: ${summary.totalModels}`);
}

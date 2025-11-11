import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADMIN_ROUTE_CATALOG } from '../shared/adminRoutes';
import { ADMIN_PAGE_ROUTES } from '../client/src/App';

type RouteCatalogLike = Record<
  string,
  {
    id: string;
    path: string;
    apis: { method: string; path: string }[];
  }
>;

type PageRouteLike = { path: string };

export interface InventoryStatus {
  page: string;
  [key: string]: string;
}

export type InventoryReport = Record<string, InventoryStatus>;

export const EXPRESS_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

export function parseExpressRoutes(source: string): Record<string, Set<string>> {
  const routeMap: Record<string, Set<string>> = {};
  const routeRegex = /app\.(get|post|put|patch|delete)\(\s*['"]([^'"`]+)['"]/gi;
  let match: RegExpExecArray | null;

  while ((match = routeRegex.exec(source))) {
    const method = match[1].toUpperCase();
    const routePath = match[2];
    if (!routeMap[method]) {
      routeMap[method] = new Set();
    }
    routeMap[method]!.add(routePath);
  }

  return routeMap;
}

export function generateAdminInventory({
  routeCatalog,
  pageRoutes,
  serverSource,
}: {
  routeCatalog: RouteCatalogLike;
  pageRoutes: PageRouteLike[];
  serverSource: string;
}): InventoryReport {
  const report: InventoryReport = {};
  const pageRouteSet = new Set(pageRoutes.map((route) => route.path));
  const serverRoutes = parseExpressRoutes(serverSource);

  for (const [routeId, routeDef] of Object.entries(routeCatalog)) {
    const entry: InventoryStatus = {
      page: pageRouteSet.has(routeDef.path) ? 'OK' : `MISSING: ${routeDef.path}`,
    };

    for (const { method, path: apiPath } of routeDef.apis) {
      const methodKey = `api.${method.toLowerCase()}`;
      const hasRoute = Boolean(serverRoutes[method]?.has(apiPath));

      if (!entry[methodKey]) {
        entry[methodKey] = 'OK';
      }

      if (!hasRoute) {
        entry[methodKey] =
          entry[methodKey] === 'OK'
            ? `MISSING: ${apiPath}`
            : `${entry[methodKey]}, ${apiPath}`;
      }
    }

    report[routeId] = entry;
  }

  return report;
}

async function main(): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const projectRoot = path.resolve(__dirname, '..');
  const serverRoutesPath = path.resolve(projectRoot, 'server/routes.ts');
  const reportOutputPath = path.resolve(
    projectRoot,
    'client/public/admin/_reports/admin-inventory.json',
  );

  const serverSource = await readFile(serverRoutesPath, 'utf-8');
  const report = generateAdminInventory({
    routeCatalog: ADMIN_ROUTE_CATALOG,
    pageRoutes: ADMIN_PAGE_ROUTES,
    serverSource,
  });

  const outputJson = JSON.stringify(report, null, 2);
  console.log(outputJson);

  await mkdir(path.dirname(reportOutputPath), { recursive: true });
  await writeFile(reportOutputPath, `${outputJson}\n`);
}

const isMain = process.argv[1]
  ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
  : false;

if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

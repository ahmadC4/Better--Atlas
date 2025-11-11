import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildDependencyGraph, detectCycles } from './cycle-graph';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CLIENT_SRC = path.join(PROJECT_ROOT, 'client', 'src');

export function scanClientSourceForCycles(): string[][] {
  const graph = buildDependencyGraph(CLIENT_SRC, {
    projectRoot: PROJECT_ROOT,
    aliasMap: {
      '@/': path.join(PROJECT_ROOT, 'client', 'src'),
      '@shared/': path.join(PROJECT_ROOT, 'shared'),
    },
  });

  return detectCycles(graph);
}

export function printCycleReport(cycles: string[][]): void {
  if (cycles.length === 0) {
    console.log('No circular dependencies detected in client/src');
    return;
  }

  console.error('Circular dependencies detected:');
  for (const cycle of cycles) {
    console.error(`  - ${cycle.join(' -> ')}`);
  }
}

if (path.resolve(process.argv[1] ?? '') === __filename) {
  const cycles = scanClientSourceForCycles();
  printCycleReport(cycles);
  if (cycles.length > 0) {
    process.exitCode = 1;
  }
}

import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDependencyGraph, detectCycles } from './cycle-graph';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

interface ParsedArgs {
  circular: boolean;
  targets: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = [...argv];
  let circular = false;
  const targets: string[] = [];

  while (args.length > 0) {
    const token = args.shift();
    if (!token) {
      continue;
    }

    if (token === '--circular') {
      circular = true;
      continue;
    }

    if (token === '--extensions') {
      // Accept the next argument (comma separated extensions) to mimic madge.
      args.shift();
      continue;
    }

    if (token.startsWith('-')) {
      console.warn(`Ignoring unsupported flag: ${token}`);
      continue;
    }

    targets.push(token);
  }

  return {
    circular,
    targets,
  };
}

function scanTarget(relativeTarget: string): string[][] {
  const absoluteTarget = path.resolve(PROJECT_ROOT, relativeTarget);
  try {
    // Validate directory exists before scanning to mirror madge feedback.
    if (!statSync(absoluteTarget).isDirectory()) {
      throw new Error(`Target is not a directory: ${relativeTarget}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Target not found: ${relativeTarget}`);
    }
    throw error;
  }
  const graph = buildDependencyGraph(absoluteTarget, {
    projectRoot: PROJECT_ROOT,
    aliasMap: {
      '@/': path.join(PROJECT_ROOT, 'client', 'src'),
      '@shared/': path.join(PROJECT_ROOT, 'shared'),
    },
  });

  return detectCycles(graph);
}

function main() {
  const { circular, targets } = parseArgs(process.argv.slice(2));
  const scanTargets = targets.length > 0 ? targets : ['client/src'];

  let exitCode = 0;
  for (const target of scanTargets) {
    let cycles: string[][];
    try {
      cycles = scanTarget(target);
    } catch (error) {
      console.error(`✖ ${target}: ${(error as Error).message}`);
      exitCode = 1;
      continue;
    }
    if (circular) {
      if (cycles.length === 0) {
        console.log(`✔ ${target}: no circular dependencies`);
      } else {
        console.error(`✖ ${target}: found ${cycles.length} circular dependenc${cycles.length === 1 ? 'y' : 'ies'}`);
        for (const cycle of cycles) {
          console.error('  - ' + cycle.join(' -> '));
        }
        exitCode = 1;
      }
    } else {
      console.log(`${target}: scanned ${cycles.length === 0 ? 'without circular dependencies' : 'with circular dependencies found'}`);
      if (cycles.length > 0) {
        for (const cycle of cycles) {
          console.log('  - ' + cycle.join(' -> '));
        }
        exitCode = 1;
      }
    }
  }

  process.exitCode = exitCode;
}

if (path.resolve(process.argv[1] ?? '') === __filename) {
  main();
}

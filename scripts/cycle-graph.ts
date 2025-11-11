import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export const SUPPORTED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

export interface CycleScannerOptions {
  projectRoot: string;
  aliasMap?: Record<string, string>;
}

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(absolute));
    } else if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(absolute);
    }
  }
  return files;
}

function resolveViaAlias(importPath: string, aliasMap: Record<string, string>): string | null {
  for (const [prefix, target] of Object.entries(aliasMap)) {
    if (importPath.startsWith(prefix)) {
      return path.join(target, importPath.slice(prefix.length));
    }
  }
  return null;
}

function resolveModule(importPath: string, fromFile: string, options: CycleScannerOptions): string | null {
  if (!importPath) {
    return null;
  }

  const aliasTarget = options.aliasMap && resolveViaAlias(importPath, options.aliasMap);
  let candidate: string | null = null;

  if (aliasTarget) {
    candidate = aliasTarget;
  } else if (importPath.startsWith('.')) {
    candidate = path.resolve(path.dirname(fromFile), importPath);
  } else {
    return null;
  }

  const possibilities = [candidate];
  for (const ext of SUPPORTED_EXTENSIONS) {
    possibilities.push(candidate + ext);
  }
  possibilities.push(path.join(candidate, 'index.ts'));
  possibilities.push(path.join(candidate, 'index.tsx'));
  possibilities.push(path.join(candidate, 'index.js'));
  possibilities.push(path.join(candidate, 'index.jsx'));

  for (const filePath of possibilities) {
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      return path.relative(options.projectRoot, filePath);
    }
  }

  return null;
}

function parseImports(filePath: string, options: CycleScannerOptions): string[] {
  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx')
      ? ts.ScriptKind.TSX
      : filePath.endsWith('.jsx')
      ? ts.ScriptKind.JSX
      : ts.ScriptKind.TS,
  );

  const imports: string[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) {
        const resolved = resolveModule(moduleSpecifier.text, filePath, options);
        if (resolved) {
          imports.push(resolved);
        }
      }
    } else if (ts.isCallExpression(node)) {
      if (ts.isImportCall(node)) {
        const [firstArg] = node.arguments ?? [];
        if (firstArg && ts.isStringLiteral(firstArg)) {
          const resolved = resolveModule(firstArg.text, filePath, options);
          if (resolved) {
            imports.push(resolved);
          }
        }
      } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        const [firstArg] = node.arguments ?? [];
        if (firstArg && ts.isStringLiteral(firstArg)) {
          const resolved = resolveModule(firstArg.text, filePath, options);
          if (resolved) {
            imports.push(resolved);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return imports;
}

export function buildDependencyGraph(entryDir: string, options: CycleScannerOptions): Map<string, string[]> {
  const files = collectSourceFiles(entryDir);
  const graph = new Map<string, string[]>();

  for (const file of files) {
    const relative = path.relative(options.projectRoot, file);
    const imports = parseImports(file, options);
    graph.set(relative, imports);
  }

  return graph;
}

export function detectCycles(graph: Map<string, string[]>): string[][] {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  function dfs(node: string) {
    if (inStack.has(node)) {
      const index = stack.indexOf(node);
      cycles.push([...stack.slice(index), node]);
      return;
    }
    if (visited.has(node)) {
      return;
    }

    visited.add(node);
    inStack.add(node);
    stack.push(node);

    const neighbours = graph.get(node) ?? [];
    for (const neighbour of neighbours) {
      dfs(neighbour);
    }

    stack.pop();
    inStack.delete(node);
  }

  for (const node of graph.keys()) {
    dfs(node);
  }

  return cycles;
}

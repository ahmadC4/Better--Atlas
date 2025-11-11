import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const routesPath = resolve(__dirname, '../server/routes.ts');
const routesSource = readFileSync(routesPath, 'utf-8');

test('chat index route does not mask static archived route', () => {
  assert.ok(
    routesSource.includes("app.get('/api/chats',"),
    'Expected a top-level /api/chats route without a userId parameter',
  );
  assert.ok(
    !routesSource.includes("app.get('/api/chats/:userId'"),
    'The userId-parameterized chat route should be removed to avoid masking static routes',
  );
});

test('archived chats route remains registered', () => {
  assert.ok(
    routesSource.includes("app.get('/api/chats/archived',"),
    'Archived chats endpoint should remain available',
  );
});

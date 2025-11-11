import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MIGRATION_GUIDANCE_MESSAGE,
  POSTGRES_UNDEFINED_TABLE,
  extractPostgresErrorCode,
  isUndefinedTableError,
} from '../server/storage/errors';

test('extractPostgresErrorCode returns direct code', () => {
  const error = { code: POSTGRES_UNDEFINED_TABLE };
  assert.equal(extractPostgresErrorCode(error), POSTGRES_UNDEFINED_TABLE);
});

test('extractPostgresErrorCode walks nested error structures', () => {
  const error = { originalError: { cause: { code: POSTGRES_UNDEFINED_TABLE } } };
  assert.equal(extractPostgresErrorCode(error), POSTGRES_UNDEFINED_TABLE);
});

test('extractPostgresErrorCode returns null when no code found', () => {
  assert.equal(extractPostgresErrorCode({ message: 'no code' }), null);
});

test('isUndefinedTableError detects Postgres undefined table errors', () => {
  assert.equal(isUndefinedTableError({ code: POSTGRES_UNDEFINED_TABLE }), true);
  assert.equal(isUndefinedTableError({ code: '23505' }), false);
});

test('MIGRATION_GUIDANCE_MESSAGE provides actionable guidance', () => {
  assert.match(MIGRATION_GUIDANCE_MESSAGE, /npm run db:push/);
});

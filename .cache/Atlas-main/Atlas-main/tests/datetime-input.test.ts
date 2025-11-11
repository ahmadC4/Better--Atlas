import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDateTimeInput } from '../client/src/lib/datetime';

test('parseDateTimeInput handles local datetime strings without timezone', () => {
  const result = parseDateTimeInput('2024-12-12T08:30');
  assert.ok(result, 'expected a parsed date for local input');
  assert.equal(result?.getFullYear(), 2024);
  assert.equal(result?.getMonth(), 11);
  assert.equal(result?.getDate(), 12);
  assert.equal(result?.getHours(), 8);
  assert.equal(result?.getMinutes(), 30);
});

test('parseDateTimeInput preserves timezone-aware strings', () => {
  const isoString = '2024-05-01T14:45:10.000Z';
  const result = parseDateTimeInput(isoString);
  assert.ok(result);
  assert.equal(result?.toISOString(), isoString);
});

test('parseDateTimeInput returns null for invalid values', () => {
  assert.equal(parseDateTimeInput('not-a-date'), null);
  assert.equal(parseDateTimeInput(''), null);
});

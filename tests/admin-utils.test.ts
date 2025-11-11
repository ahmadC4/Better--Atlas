import test from 'node:test';
import assert from 'node:assert/strict';

import { formatPlanLabel } from '../client/src/pages/admin/utils';

test('formatPlanLabel converts identifiers into readable labels', () => {
  assert.equal(formatPlanLabel('pro'), 'Pro');
  assert.equal(formatPlanLabel('free'), 'Free');
  assert.equal(formatPlanLabel('enterprise_plus'), 'Enterprise Plus');
  assert.equal(formatPlanLabel('team-plan'), 'Team Plan');
});

test('formatPlanLabel falls back when plan is missing', () => {
  assert.equal(formatPlanLabel(''), 'No plan');
  assert.equal(formatPlanLabel(null), 'No plan');
  assert.equal(formatPlanLabel(undefined), 'No plan');
});

test('formatPlanLabel prefers metadata label when available', () => {
  assert.equal(
    formatPlanLabel({ label: 'Atlas Pro', slug: 'atlas-pro' }),
    'Atlas Pro',
  );
  assert.equal(
    formatPlanLabel({ label: null, slug: 'atlas-enterprise' }),
    'Atlas Enterprise',
  );
});

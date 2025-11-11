import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FILE_UPLOAD_LIMITS_MB, formatFileUploadLimitLabel, PLAN_LABELS } from '@shared/schema';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';

const { validateUploadSizeForPlan } = await import('../server/routes');

const BYTES_PER_MB = 1024 * 1024;

test('rejects free plan project knowledge uploads slightly above the limit', () => {
  const limitMb = DEFAULT_FILE_UPLOAD_LIMITS_MB.free;
  assert.notEqual(limitMb, null, 'Free plan upload limit should be defined for this test');

  const result = validateUploadSizeForPlan('free', (limitMb as number) * BYTES_PER_MB + 1);

  assert.ok(result, 'Expected validation to fail for free plan upload');
  assert.equal(result?.status, 413);
  assert.equal(
    result?.message,
    `File too large. Maximum size is ${formatFileUploadLimitLabel(limitMb)} for ${PLAN_LABELS.free} users.`,
  );
});

test('rejects pro plan project knowledge uploads slightly above the limit', () => {
  const limitMb = DEFAULT_FILE_UPLOAD_LIMITS_MB.pro;
  assert.notEqual(limitMb, null, 'Pro plan upload limit should be defined for this test');

  const result = validateUploadSizeForPlan('pro', (limitMb as number) * BYTES_PER_MB + 1);

  assert.ok(result, 'Expected validation to fail for pro plan upload');
  assert.equal(result?.status, 413);
  assert.equal(
    result?.message,
    `File too large. Maximum size is ${formatFileUploadLimitLabel(limitMb)} for ${PLAN_LABELS.pro} users.`,
  );
});

test('rejects enterprise plan project knowledge uploads slightly above the limit', () => {
  const limitMb = DEFAULT_FILE_UPLOAD_LIMITS_MB.enterprise;
  assert.notEqual(limitMb, null, 'Enterprise plan upload limit should be defined for this test');

  const result = validateUploadSizeForPlan('enterprise', (limitMb as number) * BYTES_PER_MB + 1);

  assert.ok(result, 'Expected validation to fail for enterprise plan upload');
  assert.equal(result?.status, 413);
  assert.equal(
    result?.message,
    `File too large. Maximum size is ${formatFileUploadLimitLabel(limitMb)} for ${PLAN_LABELS.enterprise} users.`,
  );
});

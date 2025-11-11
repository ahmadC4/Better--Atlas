import test from 'node:test';
import assert from 'node:assert/strict';

import { filterSerializedAdminUsersByPlan, type SerializedAdminUser } from '../server/admin-user-filters';

let userIdCounter = 0;

const buildUser = (overrides: Partial<SerializedAdminUser>): SerializedAdminUser => ({
  id: overrides.id ?? `user-${userIdCounter++}`,
  name: overrides.name ?? 'Test User',
  email: overrides.email ?? null,
  username: overrides.username ?? null,
  plan: overrides.plan ?? 'free',
  role: overrides.role ?? 'user',
  status: overrides.status ?? 'active',
  createdAt: overrides.createdAt ?? new Date().toISOString(),
  updatedAt: overrides.updatedAt ?? new Date().toISOString(),
});

test('returns all users when plan query is missing or invalid', () => {
  const users = [
    buildUser({ id: 'user-1', plan: 'free' }),
    buildUser({ id: 'user-2', plan: 'pro' }),
    buildUser({ id: 'user-3', plan: 'enterprise' }),
  ];

  assert.deepEqual(filterSerializedAdminUsersByPlan(users, undefined), users);
  assert.deepEqual(filterSerializedAdminUsersByPlan(users, 'invalid'), users);
  assert.deepEqual(filterSerializedAdminUsersByPlan(users, 123), users);
});

test('filters users when plan query is a known tier', () => {
  const users = [
    buildUser({ id: 'user-1', plan: 'free' }),
    buildUser({ id: 'user-2', plan: 'pro' }),
    buildUser({ id: 'user-3', plan: 'enterprise' }),
    buildUser({ id: 'user-4', plan: 'free' }),
  ];

  const proUsers = filterSerializedAdminUsersByPlan(users, 'pro');
  assert.equal(proUsers.length, 1);
  assert.ok(proUsers.every((user) => user.plan === 'pro'));

  const freeUsers = filterSerializedAdminUsersByPlan(users, 'free');
  assert.equal(freeUsers.length, 2);
  assert.ok(freeUsers.every((user) => user.plan === 'free'));

  const enterpriseUsers = filterSerializedAdminUsersByPlan(users, 'enterprise');
  assert.equal(enterpriseUsers.length, 1);
  assert.ok(enterpriseUsers.every((user) => user.plan === 'enterprise'));
});

test('handles array and case-insensitive plan query values', () => {
  const users = [
    buildUser({ id: 'user-1', plan: 'pro' }),
    buildUser({ id: 'user-2', plan: 'enterprise' }),
    buildUser({ id: 'user-3', plan: 'free' }),
  ];

  const arrayQuery = filterSerializedAdminUsersByPlan(users, ['pro', 'free']);
  assert.equal(arrayQuery.length, 1);
  assert.ok(arrayQuery.every((user) => user.plan === 'pro'));

  const upperQuery = filterSerializedAdminUsersByPlan(users, 'FREE');
  assert.equal(upperQuery.length, 1);
  assert.ok(upperQuery.every((user) => user.plan === 'free'));

  const mixedCaseEnterprise = filterSerializedAdminUsersByPlan(users, 'Enterprise');
  assert.equal(mixedCaseEnterprise.length, 1);
  assert.ok(mixedCaseEnterprise.every((user) => user.plan === 'enterprise'));
});

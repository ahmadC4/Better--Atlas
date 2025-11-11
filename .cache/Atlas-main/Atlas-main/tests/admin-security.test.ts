import test from 'node:test';
import assert from 'node:assert/strict';

import { randomUUID } from 'node:crypto';

import type { User } from '@shared/schema';
import type { IStorage } from '../server/storage';
import { ensureAdminRole } from '../server/security/admin';

const createUser = (overrides: Partial<User>): User => ({
  id: overrides.id ?? randomUUID(),
  username: overrides.username ?? 'user',
  password: overrides.password ?? 'hashed-password',
  email: overrides.email ?? 'user@example.com',
  avatar: overrides.avatar ?? null,
  firstName: overrides.firstName ?? null,
  lastName: overrides.lastName ?? null,
  profileImageUrl: overrides.profileImageUrl ?? null,
  plan: overrides.plan ?? 'free',
  proAccessCode: overrides.proAccessCode ?? null,
  role: overrides.role ?? 'user',
  status: overrides.status ?? 'active',
  createdAt: overrides.createdAt ?? new Date('2024-01-01T00:00:00Z'),
  updatedAt: overrides.updatedAt ?? new Date('2024-01-01T00:00:00Z'),
});

const stubStorage = (users: User[]): IStorage => ({
  listUsers: async () => users,
} as unknown as IStorage);

test('bootstrap registration promotes only the first account to super_admin', async () => {
  const firstAccount = createUser({ role: 'user' });
  const storage = stubStorage([firstAccount]);

  const ensured = await ensureAdminRole(firstAccount, storage);
  assert.equal(ensured?.role, 'super_admin');
});

test('registration flow keeps unprivileged emails as regular users', async () => {
  const seededSuperAdmin = createUser({ role: 'super_admin', email: 'owner@example.com' });
  const registrant = createUser({ email: 'austin@c4saas.com', role: 'user' });
  const storage = stubStorage([seededSuperAdmin, registrant]);

  const ensured = await ensureAdminRole(registrant, storage);
  assert.equal(ensured?.role, 'user');
});

test('login flow does not escalate returning non-admin users', async () => {
  const existingSuperAdmin = createUser({ role: 'super_admin', email: 'owner@example.com' });
  const regularUser = createUser({ email: 'member@example.com', role: 'user' });
  const storage = stubStorage([existingSuperAdmin, regularUser]);

  const ensured = await ensureAdminRole(regularUser, storage);
  assert.equal(ensured?.role, 'user');
});

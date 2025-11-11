#!/usr/bin/env tsx

import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

import { db, pool } from '../server/db';
import { users, plans, type InsertUser } from '../shared/schema';
import { seedPlans } from './seed-plans';

type Role = 'user' | 'admin' | 'super_admin';

function parseArgs(argv: string[]) {
  const args: Record<string, string | undefined> = {};
  for (let i = 0; i < argv.length; i++) {
    const part = argv[i];
    if (!part.startsWith('--')) continue;
    const [rawKey, maybeValue] = part.split('=');
    const key = rawKey.replace(/^--/, '');
    if (maybeValue !== undefined) {
      args[key] = maybeValue;
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i++;
    } else {
      args[key] = 'true';
    }
  }
  return args as {
    email?: string;
    username?: string;
    password?: string;
    role?: Role;
    plan?: 'free' | 'pro' | 'enterprise';
  };
}

async function main() {
  const { email, username, password, role = 'user', plan } = parseArgs(process.argv.slice(2));

  if ((!email && !username) || !password) {
    console.error('[seed-user] Usage: tsx scripts/seed-user.ts --email someone@example.com [--username name] --password pass123 [--role user|admin|super_admin] [--plan free|pro|enterprise]');
    process.exitCode = 1;
    return;
  }

  // Ensure default plans exist to satisfy planId/plan linkage
  let [proPlan] = await db.select().from(plans).where(eq(plans.slug, 'pro')).limit(1);
  if (!proPlan) {
    console.log('[seed-user] Plans missing. Seeding default plans...');
    await seedPlans({ silent: true });
    [proPlan] = await db.select().from(plans).where(eq(plans.slug, 'pro')).limit(1);
  }

  let [freePlan] = await db.select().from(plans).where(eq(plans.slug, 'free')).limit(1);

  const desiredPlanSlug = plan
    ?? (role === 'admin' || role === 'super_admin' ? 'pro' : 'free');

  const planRow = desiredPlanSlug === 'pro' ? proPlan
    : desiredPlanSlug === 'free' ? freePlan
    : (await db.select().from(plans).where(eq(plans.slug, desiredPlanSlug)).limit(1))[0];

  if (!planRow) {
    throw new Error(`[seed-user] Required plan '${desiredPlanSlug}' not found after seeding.`);
  }

  const hashed = bcrypt.hashSync(password!, 10);

  let target = undefined as (typeof users.$inferSelect) | undefined;
  if (email) {
    [target] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  }
  if (!target && username) {
    const [byUsername] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    target = byUsername;
  }

  if (target) {
    await db.update(users)
      .set({
        email: email?.toLowerCase() ?? target.email ?? null,
        username: username ?? target.username ?? null,
        password: hashed,
        role,
        status: 'active',
        plan: planRow.slug,
        planId: planRow.id,
        updatedAt: new Date(),
      })
      .where(eq(users.id, target.id));
    console.log(`[seed-user] Updated existing user ${email ?? username} (role=${role}, plan=${planRow.slug}).`);
  } else {
    const payload: InsertUser = {
      email: email?.toLowerCase() ?? null,
      username: username ?? (email ? email.split('@')[0] : null),
      password: hashed,
      role,
      status: 'active',
      plan: planRow.slug,
      planId: planRow.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as InsertUser;

    await db.insert(users).values(payload);
    console.log(`[seed-user] Created user ${email ?? username} (role=${role}, plan=${planRow.slug}).`);
  }
}

main()
  .catch((err) => {
    console.error('[seed-user] Failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
    process.exit(process.exitCode ?? 0);
  });


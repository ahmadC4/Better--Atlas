import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

import { db, pool } from '../server/db';
import { users, plans } from '../shared/schema';
import { seedPlans } from './seed-plans';

async function main() {
  const email = (process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@example.com').toLowerCase();
  const configuredPassword = process.env.SUPER_ADMIN_PASSWORD;
  let generatedPassword: string | null = null;

  if (!configuredPassword) {
    generatedPassword = randomBytes(12).toString('base64url');
    console.warn('[seed-super-admin] SUPER_ADMIN_PASSWORD not provided, generated a temporary password.');
  }

  const passwordToUse = configuredPassword ?? generatedPassword!;
  const hashedPassword = bcrypt.hashSync(passwordToUse, 10);

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);

  let [proPlan] = await db.select().from(plans).where(eq(plans.slug, 'pro')).limit(1);

  if (!proPlan) {
    console.warn('[seed-super-admin] Pro plan missing. Seeding default plans...');
    await seedPlans({ silent: true });
    [proPlan] = await db.select().from(plans).where(eq(plans.slug, 'pro')).limit(1);
  }

  if (!proPlan) {
    throw new Error('[seed-super-admin] Unable to find or create the Pro plan required for super_admin.');
  }

  const planSlug = proPlan.slug;
  const planId = proPlan.id;

  if (existing.length > 0) {
    const [current] = existing;
    await db
      .update(users)
      .set({
        role: 'super_admin',
        password: hashedPassword,
        plan: planSlug,
        planId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, current.id));

    console.log(`[seed-super-admin] Promoted existing account ${email} to super_admin.`);
  } else {
    await db
      .insert(users)
      .values({
        email,
        username: email.split('@')[0] ?? null,
        password: hashedPassword,
        role: 'super_admin',
        status: 'active',
        plan: planSlug,
        planId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    console.log(`[seed-super-admin] Created new super_admin account for ${email}.`);
  }

  if (!configuredPassword && generatedPassword) {
    console.warn(`[seed-super-admin] Temporary super_admin password: ${generatedPassword}`);
  }
}

main()
  .catch((error) => {
    console.error('[seed-super-admin] Failed to seed super_admin:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
  });

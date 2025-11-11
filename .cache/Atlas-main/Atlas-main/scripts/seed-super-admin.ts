import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

import { db, pool } from '../server/db';
import { users } from '../shared/schema';

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

  if (existing.length > 0) {
    const [current] = existing;
    await db
      .update(users)
      .set({
        role: 'super_admin',
        password: hashedPassword,
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
        plan: 'pro',
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

import bcrypt from 'bcryptjs';
import type { IStorage } from './storage/index.js';

export async function ensureSupportUserFromEnv(storage: IStorage) {
  const email = process.env.SUPPORT_USER_EMAIL;
  const password = process.env.SUPPORT_USER_PASSWORD;
  if (!email || !password) return; // nothing to do

  const role = (process.env.SUPPORT_USER_ROLE || 'super_admin').toLowerCase();
  const planPref = (process.env.SUPPORT_USER_PLAN || '').toLowerCase();

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await storage.getUserByEmail(normalizedEmail).catch(() => undefined);

  // Pick plan: prefer explicit, else pro for privileged roles, else free
  let plan = planPref || (role === 'admin' || role === 'super_admin' ? 'pro' : 'free');
  const planRecord = await storage.getPlanBySlug(plan).catch(() => undefined);
  if (!planRecord) {
    // Fall back sensibly
    const pro = await storage.getPlanBySlug('pro').catch(() => undefined);
    plan = pro ? 'pro' : 'free';
  }

  const hashed = bcrypt.hashSync(password, 10);

  if (existing) {
    await storage.updateUser(existing.id, {
      password: hashed,
      role: (role as any),
      status: 'active',
      plan,
      planId: planRecord?.id ?? existing.planId ?? null,
    });
    console.log(`[bootstrap] Updated support user ${normalizedEmail} (role=${role}, plan=${plan}).`);
  } else {
    await storage.createUser({
      email: normalizedEmail,
      username: normalizedEmail.split('@')[0] ?? null,
      password: hashed,
      role: (role as any),
      status: 'active',
      plan,
      planId: planRecord?.id ?? null,
    });
    console.log(`[bootstrap] Created support user ${normalizedEmail} (role=${role}, plan=${plan}).`);
  }
}

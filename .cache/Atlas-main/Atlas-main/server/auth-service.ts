import { Request, Response, NextFunction, type RequestHandler } from 'express';
import * as bcrypt from 'bcryptjs';
import { pbkdf2Sync, timingSafeEqual } from 'crypto';
import type { PlatformSettingsData, ProCoupon, User } from '@shared/schema';
import { IStorage } from './storage';
import { ensureAdminRole, isAdminUser } from './security/admin';
import { requireRole } from './security/roles';
import { secureCompare } from './security/secure-compare';

type CouponErrorCode =
  | 'PRO_COUPON_INVALID'
  | 'PRO_COUPON_INACTIVE'
  | 'PRO_COUPON_EXPIRED'
  | 'PRO_COUPON_FULLY_REDEEMED'
  | 'PRO_COUPON_ALREADY_USED';

export class CouponRedemptionError extends Error {
  code: CouponErrorCode;

  constructor(code: CouponErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export class AuthService {
  private readonly requireAdminGuard: RequestHandler;

  constructor(private storage: IStorage) {
    this.requireAdminGuard = requireRole(['admin', 'super_admin'], storage);
  }

  private resolvePlanKey(plan: User['plan']): keyof PlatformSettingsData['planTiers'] {
    if (plan === 'enterprise') {
      return 'enterprise';
    }
    if (plan === 'pro') {
      return 'pro';
    }
    return 'free';
  }

  private getProAccessCode(): string | null {
    const configuredCode = process.env.PRO_ACCESS_CODE;
    if (!configuredCode) {
      return null;
    }
    return configuredCode;
  }

  // Hash password using bcrypt
  hashPassword(password: string): string {
    const saltRounds = 10; // Recommended default for bcrypt
    return bcrypt.hashSync(password, saltRounds);
  }

  private parseLegacyPbkdf2Hash(
    hashedPassword: string,
  ): { algorithm: string; iterations: number; salt: string; derivedKey: string } | null {
    const normalized = hashedPassword.trim();
    if (!normalized) {
      return null;
    }

    const colonParts = normalized.split(':');
    if (colonParts[0]?.startsWith('pbkdf2')) {
      if (colonParts.length === 4) {
        const [, iterationsStr, salt, derivedKey] = colonParts;
        const iterations = Number.parseInt(iterationsStr, 10);
        if (!Number.isFinite(iterations)) {
          return null;
        }
        const algorithm = this.resolvePbkdf2Algorithm(colonParts[0]);
        return { algorithm, iterations, salt, derivedKey };
      }
      if (colonParts.length === 5) {
        const [, algorithmName, iterationsStr, salt, derivedKey] = colonParts;
        const iterations = Number.parseInt(iterationsStr, 10);
        if (!Number.isFinite(iterations)) {
          return null;
        }
        return { algorithm: algorithmName.toLowerCase(), iterations, salt, derivedKey };
      }
    }

    const dollarParts = normalized.split('$');
    if (dollarParts[0]?.startsWith('pbkdf2')) {
      if (dollarParts.length >= 4) {
        const [, iterationsStr, salt, derivedKey] = dollarParts.slice(0, 4);
        const iterations = Number.parseInt(iterationsStr, 10);
        if (!Number.isFinite(iterations)) {
          return null;
        }
        const algorithm = this.resolvePbkdf2Algorithm(dollarParts[0]);
        return { algorithm, iterations, salt, derivedKey };
      }
    }

    if (colonParts.length === 3 && /^\d+$/.test(colonParts[0])) {
      const [iterationsStr, salt, derivedKey] = colonParts;
      const iterations = Number.parseInt(iterationsStr, 10);
      if (!Number.isFinite(iterations)) {
        return null;
      }
      return { algorithm: 'sha256', iterations, salt, derivedKey };
    }

    return null;
  }

  private resolvePbkdf2Algorithm(input: string): string {
    const schemeParts = input.split(/[:_]/);
    return (schemeParts[1] ?? 'sha256').toLowerCase();
  }

  private decodeKeyMaterial(value: string): Buffer {
    const trimmed = value.trim();
    if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
      return Buffer.from(trimmed, 'hex');
    }
    try {
      return Buffer.from(trimmed, 'base64');
    } catch {
      return Buffer.from(trimmed, 'utf8');
    }
  }

  private verifyLegacyPbkdf2(password: string, hashedPassword: string): boolean {
    const parsed = this.parseLegacyPbkdf2Hash(hashedPassword);
    if (!parsed) {
      return false;
    }

    try {
      const saltBuffer = this.decodeKeyMaterial(parsed.salt);
      const storedKeyBuffer = this.decodeKeyMaterial(parsed.derivedKey);
      if (storedKeyBuffer.length === 0) {
        return false;
      }

      const derived = pbkdf2Sync(
        password,
        saltBuffer,
        parsed.iterations,
        storedKeyBuffer.length,
        parsed.algorithm,
      );

      if (derived.length !== storedKeyBuffer.length) {
        return false;
      }

      return timingSafeEqual(derived, storedKeyBuffer);
    } catch {
      return false;
    }
  }

  // Verify password using bcrypt or legacy PBKDF2 hashes
  verifyPassword(
    password: string,
    hashedPassword: string,
  ): { isValid: boolean; needsRehash: boolean } {
    if (!hashedPassword) {
      return { isValid: false, needsRehash: false };
    }

    const isLegacyMatch = this.verifyLegacyPbkdf2(password, hashedPassword);
    if (isLegacyMatch) {
      return { isValid: true, needsRehash: true };
    }

    const isValid = bcrypt.compareSync(password, hashedPassword);
    return { isValid, needsRehash: false };
  }

  // Register new user
  async register(username: string, password: string, email?: string): Promise<User> {
    // Check if username already exists
    const existingUser = await this.storage.getUserByUsername(username);
    if (existingUser) {
      throw new Error('Username already exists');
    }

    // Hash password
    const hashedPassword = this.hashPassword(password);

    // Create user
    const user = await this.storage.createUser({
      username,
      password: hashedPassword,
      email: email || null,
      avatar: null,
      plan: 'free',
      proAccessCode: null,
      role: 'user',
    });

    return user;
  }

  // Login user
  async login(username: string, password: string): Promise<User> {
    const user = await this.storage.getUserByUsername(username);
    
    if (!user) {
      throw new Error('Invalid username or password');
    }

    // If user doesn't have a password (legacy user), update it
    if (!user.password) {
      const hashedPassword = this.hashPassword(password);
      await this.storage.updateUser(user.id, { password: hashedPassword });
      return user;
    }

    // Verify password
    const verification = this.verifyPassword(password, user.password);
    if (!verification.isValid) {
      throw new Error('Invalid username or password');
    }

    if (verification.needsRehash) {
      const hashedPassword = this.hashPassword(password);
      await this.storage.updateUser(user.id, { password: hashedPassword });
      user.password = hashedPassword;
    }

    const status = user.status ?? 'active';
    if (status !== 'active') {
      if (status === 'suspended') {
        throw new Error('Account suspended. Please contact support.');
      }
      throw new Error('Account is inactive. Please contact support.');
    }

    return user;
  }

  // Upgrade to Pro plan
  private assertCouponActive(coupon: ProCoupon): void {
    if (!coupon.isActive) {
      throw new CouponRedemptionError('PRO_COUPON_INACTIVE', 'This coupon is not currently active.');
    }
    if (coupon.expiresAt) {
      const expiresAt = coupon.expiresAt instanceof Date ? coupon.expiresAt : new Date(coupon.expiresAt);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
        throw new CouponRedemptionError('PRO_COUPON_EXPIRED', 'This coupon has expired.');
      }
    }
  }

  async upgradeToProPlan(userId: string, accessCode: string): Promise<boolean> {
    const sanitizedCode = accessCode.trim();
    if (!sanitizedCode) {
      throw new CouponRedemptionError('PRO_COUPON_INVALID', 'The supplied Pro access code is invalid.');
    }

    const coupon = await this.storage.getProCouponByCode(sanitizedCode);

    if (coupon) {
      this.assertCouponActive(coupon);

      const existingRedemption = await this.storage.getProCouponRedemption(coupon.id, userId);
      if (existingRedemption) {
        throw new CouponRedemptionError('PRO_COUPON_ALREADY_USED', 'You have already redeemed this coupon.');
      }

      const redemption = await this.storage.createProCouponRedemption(coupon.id, userId);
      const incremented = await this.storage.incrementProCouponRedemption(coupon.id);
      if (!incremented) {
        await this.storage.deleteProCouponRedemption(redemption.id);
        throw new CouponRedemptionError('PRO_COUPON_FULLY_REDEEMED', 'This coupon has reached its redemption limit.');
      }

      await this.storage.updateUser(userId, {
        plan: 'pro',
        proAccessCode: coupon.code,
      });
      return true;
    }

    const configuredCode = this.getProAccessCode();
    if (!configuredCode) {
      throw new Error('Pro upgrades are currently disabled');
    }
    if (!secureCompare(sanitizedCode, configuredCode)) {
      throw new CouponRedemptionError('PRO_COUPON_INVALID', 'Invalid Pro access code');
    }

    const user = await this.storage.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    await this.storage.updateUser(userId, {
      plan: 'pro',
      proAccessCode: sanitizedCode
    });

    return true;
  }

  // Check if user has Pro plan
  async hasProPlan(userId: string): Promise<boolean> {
    const user = await this.storage.getUser(userId);
    return user?.plan === 'pro' || user?.plan === 'enterprise';
  }

  // Get user limits based on plan
  async getUserLimits(userId: string) {
    const user = await this.storage.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const normalizedUser = await ensureAdminRole(user, this.storage) ?? user;
    if (normalizedUser.role !== user.role) {
      await this.storage.updateUser(user.id, { role: normalizedUser.role });
    }

    const settingsRecord = await this.storage.getPlatformSettings();
    const settings: PlatformSettingsData = structuredClone(settingsRecord.data);
    const planKey = this.resolvePlanKey(normalizedUser.plan);
    const planSettings = settings.planTiers[planKey];

    return {
      plan: planKey,
      messageLimitPerDay: planSettings.messageLimitPerDay,
      allowedModels: [...planSettings.allowedModels],
      features: [...planSettings.features],
      fileUploadLimitMb: planSettings.fileUploadLimitMb,
      chatHistoryEnabled: planSettings.chatHistoryEnabled,
      knowledgeBase: structuredClone(settings.knowledgeBase),
      memory: structuredClone(settings.memory),
      aiAgents: structuredClone(settings.aiAgents),
      templates: structuredClone(settings.templates),
      projects: structuredClone(settings.projects),
      apiProviders: structuredClone(settings.apiProviders),
      legacyModels: [...(settings.legacyModels ?? [])],
      isAdmin: isAdminUser(normalizedUser),
    };
  }

  // Middleware to check if user is authenticated
  async requireAuth(req: Request, res: Response, next: NextFunction) {
    if (!req.session?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await this.storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const normalized = await ensureAdminRole(user, this.storage);
    let effectiveUser = normalized ?? user;

    if (normalized && normalized.role !== user.role) {
      const updated = await this.storage.updateUser(user.id, { role: normalized.role });
      effectiveUser = updated ?? normalized;
    }

    const status = effectiveUser.status ?? 'active';
    if (status !== 'active') {
      const message = status === 'suspended'
        ? 'Account suspended. Please contact support.'
        : 'Account is inactive.';
      return res.status(403).json({ error: message });
    }

    (req as any).user = effectiveUser;
    next();
  }

  // Middleware to check if user has Pro plan
  async requireProPlan(req: Request, res: Response, next: NextFunction) {
    const userId = req.session?.userId || (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const hasPro = await this.hasProPlan(userId);
    if (!hasPro) {
      return res.status(403).json({ 
        error: 'Pro plan required',
        message: 'This feature requires a Pro subscription'
      });
    }

    next();
  }

  async requireAdmin(req: Request, res: Response, next: NextFunction) {
    return this.requireAdminGuard(req, res, next);
  }

  createRoleGuard(allowedRoles: User['role'][]): RequestHandler {
    return requireRole(allowedRoles, this.storage);
  }

  // Rate limiting for free users
  async checkRateLimit(userId: string): Promise<{ allowed: boolean; remaining: number; limit: number }> {
    const limits = await this.getUserLimits(userId);

    if (limits.messageLimitPerDay === null) {
      return { allowed: true, remaining: Infinity, limit: Infinity };
    }

    // Get today's usage count
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const messages = await this.storage.getMessagesSince(userId, today);
    const used = messages.length;
    const remaining = Math.max(0, (limits.messageLimitPerDay ?? 0) - used);

    return {
      allowed: remaining > 0,
      remaining,
      limit: limits.messageLimitPerDay ?? Infinity
    };
  }
}

// Session type definition
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    username?: string;
    csrfToken?: string;
  }
}
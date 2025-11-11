import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

let fallbackWarningEmitted = false;
let lengthWarningEmitted = false;

function resolveSecret(): string | null {
  const configured = process.env.API_KEY_ENCRYPTION_KEY?.trim();
  if (configured) {
    return configured;
  }

  const fallback = process.env.SESSION_SECRET?.trim();
  if (fallback) {
    if (!fallbackWarningEmitted) {
      console.warn('[secret-storage] API_KEY_ENCRYPTION_KEY is not set. Falling back to SESSION_SECRET for encrypting user provided API keys.');
      fallbackWarningEmitted = true;
    }
    return fallback;
  }

  return null;
}

function getRawKey(): Buffer {
  const secret = resolveSecret();
  if (!secret) {
    throw new Error('API_KEY_ENCRYPTION_KEY must be set to encrypt sensitive data');
  }

  if (secret.length < 32 && !lengthWarningEmitted) {
    console.warn('[secret-storage] The configured API key encryption secret is shorter than 32 characters. Please rotate to a longer secret for stronger encryption.');
    lengthWarningEmitted = true;
  }

  return createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptSecret(plaintext: string): { cipherText: string; lastFour: string } {
  const key = getRawKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, encrypted]).toString('base64');
  const trimmed = plaintext.replace(/\s/g, '');
  const lastFour = trimmed.slice(-4);
  return { cipherText: payload, lastFour };
}

export function decryptSecret(cipherText: string): string {
  const key = getRawKey();
  const payload = Buffer.from(cipherText, 'base64');
  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

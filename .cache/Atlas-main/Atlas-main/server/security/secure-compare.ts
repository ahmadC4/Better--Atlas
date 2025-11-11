import { timingSafeEqual, randomBytes } from 'crypto';

function toBuffer(value: string): Buffer {
  return Buffer.from(value, 'utf8');
}

export function secureCompare(a: string, b: string): boolean {
  const aBuffer = toBuffer(a);
  const bBuffer = toBuffer(b);

  if (aBuffer.length !== bBuffer.length) {
    const maxLength = Math.max(aBuffer.length, bBuffer.length);
    const paddedA = Buffer.allocUnsafe(maxLength);
    const paddedB = Buffer.allocUnsafe(maxLength);
    paddedA.fill(0);
    paddedB.fill(0);
    aBuffer.copy(paddedA);
    bBuffer.copy(paddedB);
    try {
      timingSafeEqual(paddedA, paddedB);
    } catch {
      // Ignore errors when lengths mismatch – comparison will be false
    }
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

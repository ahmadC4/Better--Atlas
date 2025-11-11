export const POSTGRES_UNDEFINED_TABLE = '42P01';

const NESTED_ERROR_KEYS: Array<'cause' | 'originalError' | 'error'> = ['cause', 'originalError', 'error'];

export function extractPostgresErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const record = error as Record<string, unknown>;
  const directCode = record.code;
  if (typeof directCode === 'string' && directCode.trim().length > 0) {
    return directCode;
  }

  for (const key of NESTED_ERROR_KEYS) {
    const nested = record[key];
    if (!nested) {
      continue;
    }

    const nestedCode = extractPostgresErrorCode(nested);
    if (nestedCode) {
      return nestedCode;
    }
  }

  return null;
}

export function isUndefinedTableError(error: unknown): boolean {
  return extractPostgresErrorCode(error) === POSTGRES_UNDEFINED_TABLE;
}

export const MIGRATION_GUIDANCE_MESSAGE =
  'Atlas AI needs its database tables. Run `npm run db:push` to apply Drizzle migrations, then restart the server.';

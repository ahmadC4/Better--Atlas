import { randomUUID } from "crypto";
import { pool } from "../db.js";

export interface FileWriteRequest {
  ownerId: string;
  buffer: Buffer;
  name: string;
  mimeType: string;
  analyzedContent?: string;
  metadata?: Record<string, unknown> | null;
}

export interface FileRecord {
  id: string;
  ownerId: string;
  buffer: Buffer;
  name: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  expiresAt: Date;
  analyzedContent?: string;
  metadata?: Record<string, unknown> | null;
}

export interface FileStorageAdapter {
  put(input: FileWriteRequest): Promise<FileRecord>;
  get(id: string): Promise<FileRecord | undefined>;
  delete(id: string): Promise<void>;
  getSignedUrl(id: string): Promise<string>;
}

export class FileQuotaExceededError extends Error {
  constructor(public readonly limitBytes: number) {
    super(`File storage quota exceeded. Limit is ${Math.floor(limitBytes / (1024 * 1024))}MB per user.`);
    this.name = "FileQuotaExceededError";
  }
}

export interface InMemoryFileStorageOptions {
  ttlMs?: number;
  quotaBytes?: number;
}

export class InMemoryFileStorage implements FileStorageAdapter {
  private readonly files = new Map<string, FileRecord>();
  private readonly ttlMs: number;
  private readonly quotaBytes: number;
  private readonly locks = new Map<string, Promise<void>>();

  constructor(options: InMemoryFileStorageOptions = {}) {
    this.ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1000; // 24 hours
    this.quotaBytes = options.quotaBytes ?? 5 * 1024 * 1024 * 1024; // 5GB per user by default
  }

  async put(input: FileWriteRequest): Promise<FileRecord> {
    const previousLock = this.locks.get(input.ownerId) || Promise.resolve();
    
    let resolve: () => void;
    const currentLock = previousLock.then(() => new Promise<void>((r) => { resolve = r; }));
    this.locks.set(input.ownerId, currentLock);

    await previousLock;

    try {
      this.cleanupExpired();

      const now = Date.now();
      const size = input.buffer.byteLength;
      const usage = this.calculateUsage(input.ownerId);

      if (usage + size > this.quotaBytes) {
        throw new FileQuotaExceededError(this.quotaBytes);
      }

      const record: FileRecord = {
        id: randomUUID(),
        ownerId: input.ownerId,
        buffer: input.buffer,
        name: input.name,
        mimeType: input.mimeType,
        size,
        createdAt: new Date(now),
        expiresAt: new Date(now + this.ttlMs),
        analyzedContent: input.analyzedContent,
        metadata: input.metadata ?? null,
      };

      this.files.set(record.id, record);

      return record;
    } finally {
      resolve!();
      if (this.locks.get(input.ownerId) === currentLock) {
        this.locks.delete(input.ownerId);
      }
    }
  }

  async get(id: string): Promise<FileRecord | undefined> {
    this.cleanupExpired();
    const record = this.files.get(id);

    if (!record) {
      return undefined;
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      this.files.delete(id);
      return undefined;
    }

    return record;
  }

  async delete(id: string): Promise<void> {
    this.files.delete(id);
  }

  async getSignedUrl(id: string): Promise<string> {
    return `/api/files/${id}`;
  }

  private calculateUsage(ownerId: string): number {
    let total = 0;
    for (const file of Array.from(this.files.values())) {
      if (file.ownerId === ownerId && file.expiresAt.getTime() > Date.now()) {
        total += file.size;
      }
    }
    return total;
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [id, file] of Array.from(this.files.entries())) {
      if (file.expiresAt.getTime() <= now) {
        this.files.delete(id);
      }
    }
  }
}

export function createFileStorage(): FileStorageAdapter {
  const ttlStr = process.env.FILE_STORAGE_TTL_MS;
  const quotaStr = process.env.FILE_STORAGE_QUOTA_BYTES;
  const ttlMs = ttlStr !== undefined ? Number(ttlStr) : undefined;
  const quotaBytes = quotaStr !== undefined ? Number(quotaStr) : undefined;

  if (ttlStr !== undefined && Number.isNaN(ttlMs)) {
    throw new Error("Invalid FILE_STORAGE_TTL_MS");
  }
  if (quotaStr !== undefined && Number.isNaN(quotaBytes)) {
    throw new Error("Invalid FILE_STORAGE_QUOTA_BYTES");
  }

  // Prefer Postgres-backed storage when a DB pool is available
  try {
    if (pool) {
      return new PostgresFileStorage({ ttlMs, quotaBytes });
    }
  } catch {
    // fall back to in-memory
  }
  return new InMemoryFileStorage({ ttlMs, quotaBytes });
}

class PostgresFileStorage implements FileStorageAdapter {
  private readonly ttlMs?: number;
  private readonly quotaBytes?: number;

  constructor(options: InMemoryFileStorageOptions = {}) {
    this.ttlMs = options.ttlMs;
    this.quotaBytes = options.quotaBytes;
  }

  private async getCurrentUsage(ownerId: string): Promise<number> {
    const { rows } = await pool.query<{ total: string | null }>(
      `select coalesce(sum(size), 0) as total
       from stored_files
       where owner_id = $1 and (expires_at is null or expires_at > now())`,
      [ownerId],
    );
    const total = rows[0]?.total ?? "0";
    const n = Number(total);
    return Number.isFinite(n) ? n : 0;
  }

  async put(input: FileWriteRequest): Promise<FileRecord> {
    // Enforce quota if configured
    if (typeof this.quotaBytes === 'number' && Number.isFinite(this.quotaBytes)) {
      const usage = await this.getCurrentUsage(input.ownerId);
      if (usage + input.buffer.byteLength > this.quotaBytes) {
        throw new FileQuotaExceededError(this.quotaBytes);
      }
    }

    const expiresAt = typeof this.ttlMs === 'number' && Number.isFinite(this.ttlMs)
      ? new Date(Date.now() + this.ttlMs)
      : null;

    const { rows } = await pool.query<{
      id: string;
      owner_id: string;
      name: string;
      mime_type: string;
      size: number;
      content: Buffer;
      analyzed_content: string | null;
      metadata: any;
      created_at: Date;
      expires_at: Date | null;
    }>(
      `insert into stored_files (owner_id, name, mime_type, size, content, analyzed_content, metadata, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id, owner_id, name, mime_type, size, content, analyzed_content, metadata, created_at, expires_at`,
      [
        input.ownerId,
        input.name,
        input.mimeType,
        input.buffer.byteLength,
        input.buffer,
        input.analyzedContent ?? null,
        input.metadata ?? null,
        expiresAt,
      ],
    );

    const row = rows[0];
    return {
      id: row.id,
      ownerId: row.owner_id,
      buffer: input.buffer, // Avoid re-hydrating
      name: row.name,
      mimeType: row.mime_type,
      size: row.size,
      createdAt: row.created_at,
      expiresAt: row.expires_at ?? new Date(8640000000000000),
      analyzedContent: row.analyzed_content ?? undefined,
      metadata: input.metadata ?? null,
    };
  }

  async get(id: string): Promise<FileRecord | undefined> {
    const { rows } = await pool.query<{
      id: string;
      owner_id: string;
      name: string;
      mime_type: string;
      size: number;
      content: Buffer;
      analyzed_content: string | null;
      metadata: any;
      created_at: Date;
      expires_at: Date | null;
    }>(
      `select id, owner_id, name, mime_type, size, content, analyzed_content, metadata, created_at, expires_at
       from stored_files where id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) return undefined;
    if (row.expires_at && row.expires_at.getTime() <= Date.now()) {
      // Treat expired as missing
      return undefined;
    }
    return {
      id: row.id,
      ownerId: row.owner_id,
      buffer: row.content,
      name: row.name,
      mimeType: row.mime_type,
      size: row.size,
      createdAt: row.created_at,
      expiresAt: row.expires_at ?? new Date(8640000000000000),
      analyzedContent: row.analyzed_content ?? undefined,
      metadata: row.metadata ?? null,
    };
  }

  async delete(id: string): Promise<void> {
    await pool.query(`delete from stored_files where id = $1`, [id]);
  }

  async getSignedUrl(id: string): Promise<string> {
    return `/api/files/${id}`;
  }
}

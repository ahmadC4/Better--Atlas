import { lookup as dnsLookup } from 'node:dns/promises';
import net from 'node:net';

const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 30_000;

export class UnsafeRemoteURLError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeRemoteURLError';
  }
}

type LookupRecord = ReadonlyArray<{ address: string; family: number }>;

type LookupFn = (hostname: string) => Promise<LookupRecord>;

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

interface FetchWithGuardOptions {
  lookupFn?: LookupFn;
  fetchFn?: FetchFn;
  timeoutMs?: number;
  allowlist?: string[];
  headers?: Record<string, string>;
}

const defaultAllowlist = (process.env.KNOWLEDGE_FETCH_HOST_ALLOWLIST || '')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

export async function fetchWithSsrfProtection(
  url: string,
  options: FetchWithGuardOptions = {},
): Promise<{ response: Response; finalUrl: URL }> {
  const defaultLookup: LookupFn = async (hostname: string) => {
    const result = await dnsLookup(hostname, { all: true });
    return Array.isArray(result) ? result : [result];
  };

  const lookupFn = options.lookupFn ?? defaultLookup;
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const allowlist = options.allowlist ?? defaultAllowlist;
  const headers = options.headers ?? {};

  if (!fetchFn) {
    throw new Error('Global fetch implementation not available');
  }

  let currentUrl = new URL(url);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertUrlIsPublic(currentUrl, { lookupFn, allowlist });

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;

    try {
      response = await fetchFn(currentUrl.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; KnowledgeBaseFetcher/1.0)',
          ...headers,
        },
      });
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new UnsafeRemoteURLError('Redirect location missing');
      }

      const nextUrl = new URL(location, currentUrl);

      if (response.body) {
        try {
          await response.body.cancel();
        } catch {
          // Ignore cancellation errors
        }
      }

      currentUrl = nextUrl;
      continue;
    }

    if (response.status >= 400) {
      return { response, finalUrl: currentUrl };
    }

    return { response, finalUrl: currentUrl };
  }

  throw new UnsafeRemoteURLError('Too many redirects');
}

async function assertUrlIsPublic(
  url: URL,
  options: { lookupFn: LookupFn; allowlist: string[] },
): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeRemoteURLError('Only HTTP and HTTPS protocols are allowed');
  }

  const hostname = url.hostname.toLowerCase();

  if (hostname === '') {
    throw new UnsafeRemoteURLError('Hostname is required');
  }

  if (hostname === 'localhost') {
    throw new UnsafeRemoteURLError('Localhost is not allowed');
  }

  if (options.allowlist.length > 0 && !isHostAllowlisted(hostname, options.allowlist)) {
    throw new UnsafeRemoteURLError('Host is not included in the allowlist');
  }

  if (net.isIP(hostname) !== 0) {
    if (isBlockedIp(hostname)) {
      throw new UnsafeRemoteURLError('Target resolves to a private IP address');
    }
    return;
  }

  let records: ReadonlyArray<{ address: string; family: number }>;

  try {
    records = await options.lookupFn(hostname);
  } catch (error) {
    throw new UnsafeRemoteURLError(`Failed to resolve hostname: ${(error as Error).message}`);
  }

  if (records.length === 0) {
    throw new UnsafeRemoteURLError('Hostname did not resolve to any addresses');
  }

  for (const record of records) {
    if (isBlockedIp(record.address)) {
      throw new UnsafeRemoteURLError('Target resolves to a private IP address');
    }
  }
}

function isBlockedIp(address: string): boolean {
  const version = net.isIP(address);

  if (version === 4) {
    const value = parseIPv4(address);
    return value === null ? true : isPrivateIPv4(value);
  }

  if (version === 6) {
    const mapped = extractMappedIPv4(address);
    if (mapped !== null) {
      return isPrivateIPv4(mapped);
    }

    const value = parseIPv6(address);
    if (value === null) {
      return true;
    }

    return (
      isIpv6InRange(value, '::1/128') ||
      isIpv6InRange(value, '::/128') ||
      isIpv6InRange(value, 'fc00::/7') ||
      isIpv6InRange(value, 'fe80::/10')
    );
  }

  return true;
}

function isHostAllowlisted(hostname: string, allowlist: string[]): boolean {
  return allowlist.some((entryRaw) => {
    const entry = entryRaw.trim().toLowerCase();
    if (!entry) {
      return false;
    }

    if (entry === hostname) {
      return true;
    }

    if (entry.startsWith('*.')) {
      const suffix = entry.slice(2);
      return hostname === suffix || hostname.endsWith(`.${suffix}`);
    }

    if (entry.startsWith('.')) {
      const suffix = entry.slice(1);
      return hostname === suffix || hostname.endsWith(`.${suffix}`);
    }

    return false;
  });
}

function parseIPv4(address: string): number | null {
  const parts = address.split('.');
  if (parts.length !== 4) {
    return null;
  }

  let value = 0;

  for (const part of parts) {
    if (part === '' || /[^0-9]/.test(part)) {
      return null;
    }
    const parsed = Number(part);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255) {
      return null;
    }
    value = (value << 8) + parsed;
  }

  return value >>> 0;
}

function isPrivateIPv4(value: number): boolean {
  return (
    inRange(value, '10.0.0.0', 8) ||
    inRange(value, '172.16.0.0', 12) ||
    inRange(value, '192.168.0.0', 16) ||
    inRange(value, '127.0.0.0', 8) ||
    inRange(value, '169.254.0.0', 16) ||
    inRange(value, '0.0.0.0', 8) ||
    inRange(value, '100.64.0.0', 10) ||
    inRange(value, '192.0.0.0', 24) ||
    inRange(value, '198.18.0.0', 15) ||
    inRange(value, '224.0.0.0', 4)
  );
}

function inRange(value: number, cidrBase: string, prefixLength: number): boolean {
  const base = parseIPv4(cidrBase);
  if (base === null) {
    return false;
  }

  const mask = prefixLength === 0 ? 0 : (~((1 << (32 - prefixLength)) - 1) >>> 0);
  return (value & mask) === (base & mask);
}

function extractMappedIPv4(address: string): number | null {
  const lower = address.toLowerCase();
  if (!lower.includes('.')) {
    return null;
  }

  const lastColon = lower.lastIndexOf(':');
  const ipv4Part = lower.slice(lastColon + 1);
  return parseIPv4(ipv4Part);
}

const MAX_IPV6 = BigInt('0xffffffffffffffffffffffffffffffff');

function parseIPv6(address: string): bigint | null {
  const lower = address.toLowerCase();

  const [head, tail] = lower.split('::');
  const headParts = head ? head.split(':').filter(Boolean) : [];
  const tailPartsRaw = tail ? tail.split(':').filter(Boolean) : [];

  const tailParts: string[] = [];
  for (const part of tailPartsRaw) {
    if (part.includes('.')) {
      const ipv4 = parseIPv4(part);
      if (ipv4 === null) {
        return null;
      }
      const high = ((ipv4 >>> 16) & 0xffff).toString(16);
      const low = (ipv4 & 0xffff).toString(16);
      tailParts.push(high, low);
    } else {
      tailParts.push(part);
    }
  }

  if (tail === undefined && headParts.length !== 8) {
    return null;
  }

  const missing = 8 - (headParts.length + tailParts.length);
  if (missing < 0) {
    return null;
  }

  const parts = [
    ...headParts,
    ...Array(missing).fill('0'),
    ...tailParts,
  ];

  if (parts.length !== 8) {
    return null;
  }

  let value = 0n;
  for (const part of parts) {
    const segment = part === '' ? 0 : parseInt(part, 16);
    if (!Number.isFinite(segment) || Number.isNaN(segment) || segment < 0 || segment > 0xffff) {
      return null;
    }
    value = (value << 16n) + BigInt(segment);
  }

  return value & MAX_IPV6;
}

function isIpv6InRange(value: bigint, cidr: string): boolean {
  const [prefix, lengthStr] = cidr.split('/');
  const length = Number(lengthStr);
  if (!Number.isInteger(length) || length < 0 || length > 128) {
    return false;
  }

  const base = parseIPv6(prefix);
  if (base === null) {
    return false;
  }

  const mask = length === 0 ? 0n : (((1n << BigInt(length)) - 1n) << BigInt(128 - length)) & MAX_IPV6;

  if (mask === 0n) {
    return true;
  }

  return (value & mask) === (base & mask);
}

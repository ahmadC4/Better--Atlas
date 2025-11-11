import type { RequestHandler } from 'express';

type RateLimiterOptions = {
  windowMs: number;
  max: number;
  message?: string | Record<string, unknown>;
};

type HitRecord = {
  count: number;
  resetAt: number;
};

const stores = new WeakMap<RequestHandler, Map<string, HitRecord>>();

function getKey(req: any): string {
  return req.user?.id || req.ip;
}

export function createRateLimiter(options: RateLimiterOptions): RequestHandler {
  const { windowMs, max, message } = options;
  const store = new Map<string, HitRecord>();
  const middleware: RequestHandler = (req, res, next) => {
    const key = getKey(req);
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (entry.count >= max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter.toString());
      return res.status(429).json(
        message && typeof message === 'object'
          ? message
          : { error: typeof message === 'string' ? message : 'Too many requests, please try again later.' },
      );
    }

    entry.count += 1;
    return next();
  };

  stores.set(middleware, store);
  return middleware;
}

export function resetRateLimiter(middleware: RequestHandler): void {
  const store = stores.get(middleware);
  if (store) {
    store.clear();
  }
}

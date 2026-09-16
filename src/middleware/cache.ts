import { Request, Response, NextFunction } from "express";

// Tiny in-memory cache for public GET endpoints.
// Avoids hitting Postgres on every visitor request.
// Entries expire after TTL; admin mutations call clearCache().

// NOTE: single-instance memory cache. If Render ever scales to 2+ instances,
// each has its own copy and clearCache() won't propagate — switch to Redis then.
const store = new Map<string, { body: unknown; expires: number }>();
const MAX_ENTRIES = 500;
// Junk query-variant URLs (?x=1, ?x=2, ...) each create a key — refuse to
// cache very long URLs so attackers can't thrash the 500-entry budget.
const MAX_CACHEABLE_URL_LENGTH = 256;

function cacheKey(req: Request): string {
  return `${req.method}:${req.originalUrl}`;
}

export function cache(ttlSeconds = 60) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET") return next();
    // Too long / too many params → serve fresh, don't pollute the cache
    if (req.originalUrl.length > MAX_CACHEABLE_URL_LENGTH) return next();

    const key = cacheKey(req);
    const hit = store.get(key);
    if (hit && hit.expires > Date.now()) {
      res.setHeader("X-Cache", "HIT");
      res.setHeader("Cache-Control", `public, max-age=${ttlSeconds}`);
      return res.json(hit.body);
    }

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        if (store.size >= MAX_ENTRIES) {
          const oldest = store.keys().next();
          if (!oldest.done) store.delete(oldest.value);
        }
        store.set(key, { body, expires: Date.now() + ttlSeconds * 1000 });
      }
      res.setHeader("X-Cache", "MISS");
      res.setHeader("Cache-Control", `public, max-age=${ttlSeconds}`);
      return originalJson(body);
    }) as typeof res.json;

    next();
  };
}

export function clearCache() {
  store.clear();
}

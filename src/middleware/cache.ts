import { Request, Response, NextFunction } from "express";

// Tiny in-memory cache for public GET endpoints.
// Avoids hitting Postgres on every visitor request.
// Entries expire after TTL; admin mutations call clearCache().

const store = new Map<string, { body: unknown; expires: number }>();
const MAX_ENTRIES = 500;

function cacheKey(req: Request): string {
  return `${req.method}:${req.originalUrl}`;
}

export function cache(ttlSeconds = 60) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET") return next();

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

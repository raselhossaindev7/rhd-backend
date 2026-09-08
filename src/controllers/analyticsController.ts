import { Request, Response } from "express";
import prisma from "../config/db";
import { sendSuccess, sendError } from "../utils/helpers";
import { UAParser } from "ua-parser-js";

function parseUserAgent(ua: string | null) {
  if (!ua) return { browser: null, os: null, device: null };
  const parser = new UAParser(ua);
  const browser = parser.getBrowser();
  const os = parser.getOS();
  const device = parser.getDevice();
  return {
    browser: browser.name || null,
    os: os.name || null,
    device: device.type || "desktop",
  };
}

async function geolocateIp(ip: string | null) {
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.")) {
    return { country: "Local", city: "Local", region: "Local" };
  }
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      signal: AbortSignal.timeout(2000),
    });
    const data: any = await res.json();
    return {
      country: data.country_name || null,
      city: data.city || null,
      region: data.region || null,
    };
  } catch {
    return { country: null, city: null, region: null };
  }
}

export async function trackPageView(req: Request, res: Response) {
  const { path, ip: clientIp, referrer: clientReferrer } = req.body;

  if (!path) {
    return sendError(res, new Error("Path is required"));
  }

  // Respond immediately so tracking never blocks the client.
  // The external geo lookup (up to 2s) and DB insert run in background.
  sendSuccess(res, { tracked: true }, 201);

  void (async () => {
    try {
      const referrer = clientReferrer || req.headers.referer || null;
      const userAgent = req.headers["user-agent"] || null;
      // Prefer client-provided IP, fallback to x-forwarded-for, then req.ip
      const forwarded = req.headers["x-forwarded-for"];
      const fallbackIp = (typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : null) || req.ip || null;
      const ip = clientIp || fallbackIp;

      const uaData = parseUserAgent(userAgent);
      const geo = await geolocateIp(ip);

      await prisma.pageView.create({
        data: {
          path,
          referrer,
          userAgent,
          ip,
          ...uaData,
          ...geo,
        },
      });
    } catch (err) {
      console.error("[Analytics] Background page-view insert failed:", err);
    }
  })();
}

export async function getAnalytics(req: Request, res: Response) {
  try {
    const { days = "30" } = req.query;
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days as string));

    // NOTE: sequential reads, NOT prisma.$transaction([...]) and NOT
    // Promise.all. Each query checks a pooled connection out briefly and
    // releases it. A $transaction batch pins one server connection on the
    // Supabase transaction-mode pooler for all 12 queries — and mixing
    // $queryRaw into the batch is especially fragile there (10054 /
    // "server closed the connection"). With the admin polling this
    // endpoint every 30s, pinning starved the pool (pool-timeout → retry
    // storm → P1001 for everyone). Slight staleness between aggregates
    // is fine for analytics. (Route is also cached 30s — see routes.)
    // Raw queries stay unmapped; mapping happens after.
    const totalViews = await prisma.pageView.count({ where: { createdAt: { gte: since } } });

    // COUNT(DISTINCT ...) in SQL instead of fetching all rows into Node.
    // The old version loaded every matching row and counted in JS.
    const uniqueIpRows = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT ip)::int AS count FROM page_views
      WHERE "createdAt" >= ${since} AND ip IS NOT NULL
    `;

    const uniquePathRows = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT path)::int AS count FROM page_views
      WHERE "createdAt" >= ${since}
    `;

    const topPages = await prisma.pageView.groupBy({
      by: ["path"],
      where: { createdAt: { gte: since } },
      _count: { path: true },
      orderBy: { _count: { path: "desc" } },
      take: 10,
    });

    const viewsByDay = await prisma.$queryRaw`
      SELECT DATE("createdAt") as date, COUNT(*)::int as views
      FROM page_views
      WHERE "createdAt" >= ${since}
      GROUP BY DATE("createdAt")
      ORDER BY date DESC
    `;

    const browserStats = await prisma.pageView.groupBy({
      by: ["browser"],
      where: { createdAt: { gte: since }, browser: { not: null } },
      _count: { browser: true },
      orderBy: { _count: { browser: "desc" } },
      take: 8,
    });

    const osStats = await prisma.pageView.groupBy({
      by: ["os"],
      where: { createdAt: { gte: since }, os: { not: null } },
      _count: { os: true },
      orderBy: { _count: { os: "desc" } },
      take: 8,
    });

    const deviceStats = await prisma.pageView.groupBy({
      by: ["device"],
      where: { createdAt: { gte: since }, device: { not: null } },
      _count: { device: true },
      orderBy: { _count: { device: "desc" } },
    });

    const countryStats = await prisma.pageView.groupBy({
      by: ["country"],
      where: { createdAt: { gte: since }, country: { not: null } },
      _count: { country: true },
      orderBy: { _count: { country: "desc" } },
      take: 10,
    });

    const cityStats = await prisma.pageView.groupBy({
      by: ["city"],
      where: { createdAt: { gte: since }, city: { not: null, notIn: ["Local"] } },
      _count: { city: true },
      orderBy: { _count: { city: "desc" } },
      take: 10,
    });

    const recentViews = await prisma.pageView.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        path: true,
        browser: true,
        os: true,
        device: true,
        country: true,
        city: true,
        ip: true,
        createdAt: true,
      },
    });

    const hourlyTraffic = await prisma.$queryRaw`
      SELECT EXTRACT(HOUR FROM "createdAt")::int as hour, COUNT(*)::int as views
      FROM page_views
      WHERE "createdAt" >= NOW() - INTERVAL '24 hours'
      GROUP BY EXTRACT(HOUR FROM "createdAt")
      ORDER BY hour
    `;

    sendSuccess(res, {
      totalViews,
      uniqueVisitors: uniqueIpRows[0]?.count ?? 0,
      uniquePages: uniquePathRows[0]?.count ?? 0,
      topPages: topPages.map((p) => ({
        path: p.path,
        views: p._count.path,
      })),
      viewsByDay,
      browsers: browserStats.map((b) => ({
        name: b.browser || "Unknown",
        count: b._count.browser,
      })),
      os: osStats.map((o) => ({
        name: o.os || "Unknown",
        count: o._count.os,
      })),
      devices: deviceStats.map((d) => ({
        name: d.device || "Unknown",
        count: d._count.device,
      })),
      countries: countryStats.map((c) => ({
        name: c.country || "Unknown",
        count: c._count.country,
      })),
      cities: cityStats.map((c) => ({
        name: c.city || "Unknown",
        count: c._count.city,
      })),
      recentViews: recentViews.map((v) => ({
        path: v.path,
        browser: v.browser,
        os: v.os,
        device: v.device,
        country: v.country,
        city: v.city,
        ip: v.ip,
        time: v.createdAt,
      })),
      hourlyTraffic,
    });
  } catch (error) {
    sendError(res, error as Error);
  }
}

// "/blog/my-post?utm=x" → "my-post". Returns "" for non-post paths.
function blogSlug(cleanPath: string): string {
  const c = String(cleanPath ?? "");
  if (!c.startsWith("/blog/")) return "";
  return c.slice("/blog/".length).split("/")[0] || "";
}

// ─── Blog-only analytics (ADDITIVE — existing handlers untouched) ───
// Per-post totals + per-post daily series for /blog/:slug paths.
// Powers the admin "Blog Analytics" page and the views column /
// trending badges on the admin blog list.
export async function getBlogAnalytics(req: Request, res: Response) {
  try {
    const days = Math.min(Math.max(parseInt((req.query.days as string) || "30", 10) || 30, 1), 90);
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Sequential reads (same reason as getAnalytics: never pin the
    // Supabase transaction-mode pooler with a batched transaction).
    const siteViews = await prisma.pageView.count({ where: { createdAt: { gte: since } } });

    // NOTE: leading slash is KEPT (RTRIM only) so blogSlug() can match
    // "/blog/…". Query strings are stripped so "/blog/x?utm=1" and
    // "/blog/x" collapse to the same post.
    const totals = await prisma.$queryRaw<{ clean: string; views: number }[]>`
      SELECT RTRIM(SPLIT_PART(path, '?', 1), '/') AS clean,
             COUNT(*)::int AS views
      FROM page_views
      WHERE "createdAt" >= ${since}
        AND path LIKE '/blog/%'
        AND path <> '/blog'
      GROUP BY clean
      ORDER BY views DESC
    `;

    // Aggregate per slug (trailing-slash / query variants already collapsed).
    const bySlug = new Map<string, number>();
    for (const r of totals) {
      const slug = blogSlug((r as any).clean);
      if (!slug) continue;
      bySlug.set(slug, (bySlug.get(slug) ?? 0) + (Number((r as any).views) || 0));
    }
    const posts = [...bySlug.entries()]
      .map(([slug, views]) => ({ slug, views }))
      .sort((a, b) => b.views - a.views);

    const daily = await prisma.$queryRaw<{ date: string; clean: string; views: number }[]>`
      SELECT DATE("createdAt") AS date,
             RTRIM(SPLIT_PART(path, '?', 1), '/') AS clean,
             COUNT(*)::int AS views
      FROM page_views
      WHERE "createdAt" >= ${since}
        AND path LIKE '/blog/%'
        AND path <> '/blog'
      GROUP BY DATE("createdAt"), clean
      ORDER BY date ASC
    `;

    const byDaySlug = new Map<string, number>();
    for (const r of daily) {
      const slug = blogSlug((r as any).clean);
      if (!slug) continue;
      const d = (r as any).date instanceof Date
        ? ((r as any).date as Date).toISOString().slice(0, 10)
        : String((r as any).date).slice(0, 10);
      const key = `${d}|${slug}`;
      byDaySlug.set(key, (byDaySlug.get(key) ?? 0) + (Number((r as any).views) || 0));
    }
    const series = [...byDaySlug.entries()].map(([key, views]) => {
      const [date, slug] = key.split("|");
      return { date, slug, views };
    });

    const totalBlogViews = posts.reduce((sum, p) => sum + p.views, 0);

    sendSuccess(res, {
      days,
      totalBlogViews,
      siteViews,
      posts,
      daily: series,
    });
  } catch (error) {
    sendError(res, error as Error);
  }
}

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
  try {
    const { path, ip: clientIp, referrer: clientReferrer } = req.body;
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

    sendSuccess(res, { tracked: true }, 201);
  } catch (error) {
    sendError(res, error as Error);
  }
}

export async function getAnalytics(req: Request, res: Response) {
  try {
    const { days = "30" } = req.query;
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days as string));

    const [
      totalViews,
      uniqueIps,
      uniquePaths,
      topPages,
      viewsByDay,
      browserStats,
      osStats,
      deviceStats,
      countryStats,
      cityStats,
      recentViews,
      hourlyTraffic,
    ] = await Promise.all([
      prisma.pageView.count({ where: { createdAt: { gte: since } } }),

      prisma.pageView.findMany({
        where: { createdAt: { gte: since } },
        select: { ip: true },
        distinct: ["ip"],
      }).then((rows) => rows.length),

      prisma.pageView.findMany({
        where: { createdAt: { gte: since } },
        select: { path: true },
        distinct: ["path"],
      }).then((rows) => rows.length),

      prisma.pageView.groupBy({
        by: ["path"],
        where: { createdAt: { gte: since } },
        _count: { path: true },
        orderBy: { _count: { path: "desc" } },
        take: 10,
      }),

      prisma.$queryRaw`
        SELECT DATE("createdAt") as date, COUNT(*)::int as views
        FROM page_views
        WHERE "createdAt" >= ${since}
        GROUP BY DATE("createdAt")
        ORDER BY date DESC
      `,

      prisma.pageView.groupBy({
        by: ["browser"],
        where: { createdAt: { gte: since }, browser: { not: null } },
        _count: { browser: true },
        orderBy: { _count: { browser: "desc" } },
        take: 8,
      }),

      prisma.pageView.groupBy({
        by: ["os"],
        where: { createdAt: { gte: since }, os: { not: null } },
        _count: { os: true },
        orderBy: { _count: { os: "desc" } },
        take: 8,
      }),

      prisma.pageView.groupBy({
        by: ["device"],
        where: { createdAt: { gte: since }, device: { not: null } },
        _count: { device: true },
        orderBy: { _count: { device: "desc" } },
      }),

      prisma.pageView.groupBy({
        by: ["country"],
        where: { createdAt: { gte: since }, country: { not: null } },
        _count: { country: true },
        orderBy: { _count: { country: "desc" } },
        take: 10,
      }),

      prisma.pageView.groupBy({
        by: ["city"],
        where: { createdAt: { gte: since }, city: { not: null, notIn: ["Local"] } },
        _count: { city: true },
        orderBy: { _count: { city: "desc" } },
        take: 10,
      }),

      prisma.pageView.findMany({
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
      }),

      prisma.$queryRaw`
        SELECT EXTRACT(HOUR FROM "createdAt")::int as hour, COUNT(*)::int as views
        FROM page_views
        WHERE "createdAt" >= NOW() - INTERVAL '24 hours'
        GROUP BY EXTRACT(HOUR FROM "createdAt")
        ORDER BY hour
      `,
    ]);

    sendSuccess(res, {
      totalViews,
      uniqueVisitors: uniqueIps,
      uniquePages: uniquePaths,
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

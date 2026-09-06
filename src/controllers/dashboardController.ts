import { Request, Response } from "express";
import prisma from "../config/db";
import { sendSuccess, sendError } from "../utils/helpers";

export async function getDashboardStats(_req: Request, res: Response) {
  try {
    // NOTE: sequential reads, NOT prisma.$transaction([...]) and NOT
    // Promise.all. Each query checks a pooled connection out briefly and
    // releases it. A $transaction batch pins one server connection on the
    // Supabase transaction-mode pooler for all 17 queries; with ~10
    // concurrent admin requests on a connection_limit=10 pool that
    // starved every other endpoint (pool-timeout → retry storm → P1001).
    // Slight staleness between counts is fine for a stats endpoint.
    // (This route is also cached 30s — see dashboardRoutes.)
    const totalProjects = await prisma.project.count();
    const featuredProjects = await prisma.project.count({ where: { featured: true } });
    const totalPosts = await prisma.post.count();
    const publishedPosts = await prisma.post.count({ where: { published: true } });
    const totalServices = await prisma.service.count();
    const activeServices = await prisma.service.count({ where: { active: true } });
    const totalContacts = await prisma.contact.count();
    const newContacts = await prisma.contact.count({ where: { status: "NEW" } });
    const readContacts = await prisma.contact.count({ where: { status: "READ" } });
    const archivedContacts = await prisma.contact.count({ where: { status: "ARCHIVED" } });
    const activeSubscribers = await prisma.subscriber.count({ where: { active: true } });
    const totalSubscribers = await prisma.subscriber.count();
    const totalPageViews = await prisma.pageView.count();
    const projectCategories = await prisma.project.groupBy({ by: ["category"], _count: { category: true } });
    const recentContacts = await prisma.contact.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, email: true, type: true, status: true, createdAt: true },
    });
    const recentProjects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, title: true, slug: true, category: true, featured: true, createdAt: true },
    });
    const recentPosts = await prisma.post.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, title: true, slug: true, category: true, published: true, createdAt: true },
    });

    const categoryBreakdown = (projectCategories as { category: string | null; _count: { category: number } }[]).map((c) => ({
      name: c.category || "Uncategorized",
      value: c._count.category,
    }));

    const recentActivity = [
      ...(recentContacts as { id: string; name: string; email: string; type: string; status: string; createdAt: Date }[]).map((c) => ({
        type: "contact" as const,
        text: `New contact from ${c.name} (${c.type})`,
        status: c.status,
        date: c.createdAt.toISOString(),
      })),
      ...(recentProjects as { id: string; title: string; slug: string; category: string; featured: boolean; createdAt: Date }[]).map((p) => ({
        type: "project" as const,
        text: `Project "${p.title}" ${p.featured ? "(featured)" : ""}`,
        status: "active",
        date: p.createdAt.toISOString(),
      })),
      ...(recentPosts as { id: string; title: string; slug: string; category: string; published: boolean; createdAt: Date }[]).map((p) => ({
        type: "post" as const,
        text: `Blog post "${p.title}" ${p.published ? "(published)" : "(draft)"}`,
        status: p.published ? "published" : "draft",
        date: p.createdAt.toISOString(),
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);

    sendSuccess(res, {
      stats: {
        totalProjects,
        featuredProjects,
        totalPosts,
        publishedPosts,
        totalServices,
        activeServices,
        totalContacts,
        newContacts,
        readContacts,
        archivedContacts,
        activeSubscribers,
        totalSubscribers,
        totalPageViews,
      },
      categoryBreakdown,
      recentActivity,
    });
  } catch (error) {
    sendError(res, error as Error);
  }
}

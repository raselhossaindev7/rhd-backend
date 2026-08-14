import { Request, Response } from "express";
import prisma from "../config/db";
import { sendSuccess, sendError } from "../utils/helpers";

export async function getDashboardStats(_req: Request, res: Response) {
  try {
    const [
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
      projectCategories,
      recentContacts,
      recentProjects,
      recentPosts,
    ] = await Promise.all([
      prisma.project.count(),
      prisma.project.count({ where: { featured: true } }),
      prisma.post.count(),
      prisma.post.count({ where: { published: true } }),
      prisma.service.count(),
      prisma.service.count({ where: { active: true } }),
      prisma.contact.count(),
      prisma.contact.count({ where: { status: "NEW" } }),
      prisma.contact.count({ where: { status: "READ" } }),
      prisma.contact.count({ where: { status: "ARCHIVED" } }),
      prisma.subscriber.count({ where: { active: true } }),
      prisma.subscriber.count(),
      prisma.pageView.count(),
      prisma.project.groupBy({ by: ["category"], _count: { category: true } }),
      prisma.contact.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, name: true, email: true, type: true, status: true, createdAt: true },
      }),
      prisma.project.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, title: true, slug: true, category: true, featured: true, createdAt: true },
      }),
      prisma.post.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, title: true, slug: true, category: true, published: true, createdAt: true },
      }),
    ]);

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

import { Request, Response } from "express";
import prisma from "../config/db";
import { ApiError, sendSuccess, sendError, slugify } from "../utils/helpers";

function shapePost(p: any) {
  return {
    ...p,
    tags: p.tags ? p.tags.map((t: any) => t.name || t) : [],
    keywords: parseJson(p.keywords),
    availableLanguages: parseJson(p.availableLanguages),
    faqJson: parseJson(p.faqJson),
    howToSteps: parseJson(p.howToSteps),
    metaTitle: p.metaTitle ?? null,
    metaDescription: p.metaDescription ?? null,
    ogImage: p.ogImage ?? null,
    canonical: p.canonical ?? null,
    speakableText: p.speakableText ?? null,
  };
}

function parseJson(val: any): any {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return []; }
  }
  return val || [];
}

export async function getPosts(req: Request, res: Response) {
  try {
    const category = req.query.category as string | undefined;
    const tag = req.query.tag as string | undefined;
    const published = req.query.published as string | undefined;
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = parseInt((req.query.limit as string) || "20", 10);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (category) where.category = category;
    if (published === "true") where.published = true;
    if (tag) where.tags = { some: { name: tag } };

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: { tags: true },
        orderBy: { date: "desc" },
        skip,
        take: limit,
      }),
      prisma.post.count({ where }),
    ]);

    sendSuccess(res, {
      posts: posts.map(shapePost),
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    sendError(res, error as Error);
  }
}

export async function getPost(req: Request, res: Response) {
  try {
    const { id, slug } = req.params;

    const where = id ? { id } : { slug };

    const post = await prisma.post.findUnique({
      where,
      include: { tags: true },
    });

    if (!post) throw new ApiError(404, "Post not found");

    sendSuccess(res, shapePost(post));
  } catch (error) {
    sendError(res, error as Error);
  }
}

export async function createPost(req: Request, res: Response) {
  try {
    const d = req.body;

    const post = await prisma.post.create({
      data: {
        slug: d.slug || slugify(d.title),
        title: d.title,
        category: d.category,
        excerpt: d.excerpt,
        content: typeof d.content === "string" ? d.content : JSON.stringify(d.content || []),
        image: d.image || null,
        readTime: d.readTime || "5 min read",
        date: d.date ? new Date(d.date) : new Date(),
        published: d.published || false,
        order: d.order || 0,
        metaTitle: d.metaTitle || null,
        metaDescription: d.metaDescription || null,
        ogImage: d.ogImage || null,
        keywords: d.keywords || [],
        canonical: d.canonical || null,
        geoRegion: d.geoRegion || null,
        geoPlaceName: d.geoPlaceName || null,
        geoPosition: d.geoPosition || null,
        geoCountry: d.geoCountry || null,
        areaServed: d.areaServed || "Worldwide",
        availableLanguages: d.availableLanguages || ["en"],
        faqJson: d.faqJson || [],
        howToSteps: d.howToSteps || [],
        speakableText: d.speakableText || null,
        userId: d.userId || null,
        tags: d.tags
          ? { connectOrCreate: d.tags.map((name: string) => ({ where: { name }, create: { name } })) }
          : {},
      },
      include: { tags: true },
    });

    sendSuccess(res, shapePost(post), 201);
  } catch (error) {
    sendError(res, error as Error);
  }
}

export async function updatePost(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const d = req.body;

    const existing = await prisma.post.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Post not found");

    const updateData: any = {
      ...(d.slug !== undefined && { slug: d.slug }),
      ...(d.title !== undefined && { title: d.title }),
      ...(d.category !== undefined && { category: d.category }),
      ...(d.excerpt !== undefined && { excerpt: d.excerpt }),
      ...(d.content !== undefined && { content: typeof d.content === "string" ? d.content : JSON.stringify(d.content) }),
      ...(d.image !== undefined && { image: d.image }),
      ...(d.readTime !== undefined && { readTime: d.readTime }),
      ...(d.date !== undefined && { date: new Date(d.date) }),
      ...(d.published !== undefined && { published: d.published }),
      ...(d.order !== undefined && { order: d.order }),
      ...(d.metaTitle !== undefined && { metaTitle: d.metaTitle }),
      ...(d.metaDescription !== undefined && { metaDescription: d.metaDescription }),
      ...(d.ogImage !== undefined && { ogImage: d.ogImage }),
      ...(d.keywords !== undefined && { keywords: d.keywords }),
      ...(d.canonical !== undefined && { canonical: d.canonical }),
      ...(d.geoRegion !== undefined && { geoRegion: d.geoRegion }),
      ...(d.geoPlaceName !== undefined && { geoPlaceName: d.geoPlaceName }),
      ...(d.geoPosition !== undefined && { geoPosition: d.geoPosition }),
      ...(d.geoCountry !== undefined && { geoCountry: d.geoCountry }),
      ...(d.areaServed !== undefined && { areaServed: d.areaServed }),
      ...(d.availableLanguages !== undefined && { availableLanguages: d.availableLanguages }),
      ...(d.faqJson !== undefined && { faqJson: d.faqJson }),
      ...(d.howToSteps !== undefined && { howToSteps: d.howToSteps }),
      ...(d.speakableText !== undefined && { speakableText: d.speakableText }),
    };

    if (d.tags && Array.isArray(d.tags)) {
      await prisma.$executeRaw`DELETE FROM "_PostToTag" WHERE "A" = ${id}`;
      updateData.tags = {
        connectOrCreate: d.tags.map((name: string) => ({
          where: { name },
          create: { name },
        })),
      };
    }

    if (d.title && !d.slug) {
      updateData.slug = slugify(d.title);
    }

    const post = await prisma.post.update({
      where: { id },
      data: updateData,
      include: { tags: true },
    });

    sendSuccess(res, shapePost(post));
  } catch (error) {
    sendError(res, error as Error);
  }
}

export async function deletePost(req: Request, res: Response) {
  try {
    const id = req.params.id as string;

    await prisma.post.delete({ where: { id } });

    sendSuccess(res, { message: "Post deleted" });
  } catch (error) {
    sendError(res, error as Error);
  }
}

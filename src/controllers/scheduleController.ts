import { Request, Response } from "express";
import prisma from "../config/db";
import { ApiError, sendSuccess, sendError, slugify } from "../utils/helpers";
import { generateTopics, saveTopics } from "../services/aiTopicGenerator";
import { generateBlogPost } from "../services/aiBlogGenerator";
import { TopicStatus } from "@prisma/client";

// ─── Topic CRUD ──────────────────────────────────────────

export async function getTopics(req: Request, res: Response) {
  try {
    const status = req.query.status as string | undefined;
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = parseInt((req.query.limit as string) || "20", 10);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status && typeof status === "string") where.status = status;

    const [topics, total] = await Promise.all([
      prisma.topic.findMany({
        where,
        include: { post: { select: { id: true, slug: true, title: true, published: true } } },
        orderBy: [
          { priority: "desc" },
          { scheduledFor: "asc" },
          { createdAt: "desc" },
        ],
        skip,
        take: limit,
      }),
      prisma.topic.count({ where }),
    ]);

    sendSuccess(res, {
      topics,
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    sendError(res, error as Error);
  }
}

export async function createTopic(req: Request, res: Response) {
  try {
    const { title, category, keywords, description, priority, scheduledFor } = req.body;

    if (!title || !category) {
      throw new ApiError(400, "Title and category are required");
    }

    const topic = await prisma.topic.create({
      data: {
        title,
        category,
        keywords: keywords || [],
        description: description || null,
        priority: priority || 0,
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
        status: "PENDING",
      },
    });

    sendSuccess(res, topic, 201);
  } catch (error) {
    sendError(res, error as Error);
  }
}

export async function updateTopic(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const { title, category, keywords, description, priority, scheduledFor, status } = req.body as {
      title?: string;
      category?: string;
      keywords?: string[];
      description?: string;
      priority?: number;
      scheduledFor?: string;
      status?: TopicStatus;
    };

    const existing = await prisma.topic.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Topic not found");

    const topic = await prisma.topic.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(category !== undefined && { category }),
        ...(keywords !== undefined && { keywords }),
        ...(description !== undefined && { description }),
        ...(priority !== undefined && { priority }),
        ...(scheduledFor !== undefined && { scheduledFor: scheduledFor ? new Date(scheduledFor) : null }),
        ...(status !== undefined && { status }),
      },
    });

    sendSuccess(res, topic);
  } catch (error) {
    sendError(res, error as Error);
  }
}

export async function deleteTopic(req: Request, res: Response) {
  try {
    const id = req.params.id as string;

    const existing = await prisma.topic.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Topic not found");

    // Only allow deleting PENDING or FAILED topics
    if (existing.status === "GENERATING") {
      throw new ApiError(400, "Cannot delete a topic that is currently being generated");
    }

    await prisma.topic.delete({ where: { id } });

    sendSuccess(res, { message: "Topic deleted" });
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── AI Topic Generation ─────────────────────────────────

export async function generateTopicSuggestions(req: Request, res: Response) {
  try {
    const count = parseInt((req.query.count as string) || "5", 10);
    const limitedCount = Math.min(Math.max(count, 1), 10);

    const topics = await generateTopics(limitedCount);
    const saved = await saveTopics(topics);

    sendSuccess(res, {
      generated: topics.length,
      saved,
      topics,
    });
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Manual Post Generation ──────────────────────────────

export async function generatePost(req: Request, res: Response) {
  try {
    const { topicId } = req.body;

    let topic;
    if (topicId) {
      topic = await prisma.topic.findUnique({ where: { id: topicId } });
      if (!topic) throw new ApiError(404, "Topic not found");
      if (topic.status === "GENERATING") {
        throw new ApiError(400, "Topic is already being generated");
      }
    } else {
      // Find the next pending topic
      topic = await prisma.topic.findFirst({
        where: { status: "PENDING" },
        orderBy: [{ priority: "desc" }, { scheduledFor: "asc" }, { createdAt: "asc" }],
      });
      if (!topic) throw new ApiError(404, "No pending topics found");
    }

    // Mark as generating
    await prisma.topic.update({
      where: { id: topic.id },
      data: { status: "GENERATING", attempts: { increment: 1 } },
    });

    try {
      // Generate the blog post
      const postData = await generateBlogPost(
        topic.title,
        topic.category,
        topic.keywords,
        topic.description || undefined
      );

      // Create the post
      const post = await prisma.post.create({
        data: {
          slug: postData.slug,
          title: postData.title,
          category: postData.category,
          excerpt: postData.excerpt,
          content: postData.content,
          image: postData.image,
          readTime: postData.readTime,
          date: postData.date,
          published: postData.published,
          metaTitle: postData.metaTitle,
          metaDescription: postData.metaDescription,
          keywords: postData.keywords,
          ogImage: postData.ogImage,
          canonical: postData.canonical,
          geoRegion: postData.geoRegion,
          geoPlaceName: postData.geoPlaceName,
          geoPosition: postData.geoPosition,
          geoCountry: postData.geoCountry,
          areaServed: postData.areaServed,
          availableLanguages: postData.availableLanguages,
          faqJson: postData.faqJson,
          howToSteps: postData.howToSteps,
          speakableText: postData.speakableText,
          scheduledAt: new Date(),
          tags: {
            connectOrCreate: postData.tags.map((name) => ({
              where: { name },
              create: { name },
            })),
          },
        },
        include: { tags: true },
      });

      // Update topic status
      await prisma.topic.update({
        where: { id: topic.id },
        data: {
          status: "PUBLISHED",
          postId: post.id,
          generatedAt: new Date(),
          publishedAt: new Date(),
        },
      });

      sendSuccess(res, {
        message: "Blog post generated and published successfully",
        post: {
          id: post.id,
          slug: post.slug,
          title: post.title,
          category: post.category,
        },
        topic: {
          id: topic.id,
          title: topic.title,
          status: "PUBLISHED",
        },
      });
    } catch (genError) {
      // Mark as failed
      await prisma.topic.update({
        where: { id: topic.id },
        data: {
          status: "FAILED",
          error: genError instanceof Error ? genError.message : "Unknown error",
        },
      });
      throw genError;
    }
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Schedule Stats ──────────────────────────────────────

export async function getScheduleStats(req: Request, res: Response) {
  try {
    const [pending, generating, completed, failed, published, totalPosts] = await Promise.all([
      prisma.topic.count({ where: { status: "PENDING" } }),
      prisma.topic.count({ where: { status: "GENERATING" } }),
      prisma.topic.count({ where: { status: "COMPLETED" } }),
      prisma.topic.count({ where: { status: "FAILED" } }),
      prisma.topic.count({ where: { status: "PUBLISHED" } }),
      prisma.post.count(),
    ]);

    const nextTopic = await prisma.topic.findFirst({
      where: { status: "PENDING" },
      orderBy: [{ priority: "desc" }, { scheduledFor: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true, category: true, scheduledFor: true },
    });

    const lastPublished = await prisma.topic.findFirst({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      select: { title: true, publishedAt: true, post: { select: { slug: true } } },
    });

    sendSuccess(res, {
      stats: {
        pending,
        generating,
        completed,
        failed,
        published,
        totalPosts,
      },
      nextTopic,
      lastPublished,
    });
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Cron Job Trigger (Internal) ─────────────────────────

export async function runScheduledGeneration() {
  console.log("[CRON] Running scheduled blog generation...");

  try {
    // Find next pending topic
    const topic = await prisma.topic.findFirst({
      where: { status: "PENDING" },
      orderBy: [{ priority: "desc" }, { scheduledFor: "asc" }, { createdAt: "asc" }],
    });

    if (!topic) {
      console.log("[CRON] No pending topics found. Generating suggestions...");

      // Auto-generate topics if none exist
      const topics = await generateTopics(3);
      await saveTopics(topics);
      console.log(`[CRON] Generated ${topics.length} new topics`);

      // Try again to find a topic
      const newTopic = await prisma.topic.findFirst({
        where: { status: "PENDING" },
        orderBy: [{ priority: "desc" }, { scheduledFor: "asc" }, { createdAt: "asc" }],
      });

      if (!newTopic) {
        console.log("[CRON] Still no topics available. Skipping.");
        return;
      }

      return await processTopic(newTopic.id);
    }

    return await processTopic(topic.id);
  } catch (error) {
    console.error("[CRON] Error in scheduled generation:", error);
  }
}

async function processTopic(topicId: string) {
  const topic = await prisma.topic.findUnique({ where: { id: topicId } });
  if (!topic) return null;

  // Mark as generating
  await prisma.topic.update({
    where: { id: topic.id },
    data: { status: "GENERATING", attempts: { increment: 1 } },
  });

  try {
    const postData = await generateBlogPost(
      topic.title,
      topic.category,
      topic.keywords,
      topic.description || undefined
    );

    const post = await prisma.post.create({
      data: {
        slug: postData.slug,
        title: postData.title,
        category: postData.category,
        excerpt: postData.excerpt,
        content: postData.content,
        image: postData.image,
        readTime: postData.readTime,
        date: postData.date,
        published: postData.published,
        metaTitle: postData.metaTitle,
        metaDescription: postData.metaDescription,
        keywords: postData.keywords,
        ogImage: postData.ogImage,
        canonical: postData.canonical,
        geoRegion: postData.geoRegion,
        geoPlaceName: postData.geoPlaceName,
        geoPosition: postData.geoPosition,
        geoCountry: postData.geoCountry,
        areaServed: postData.areaServed,
        availableLanguages: postData.availableLanguages,
        faqJson: postData.faqJson,
        howToSteps: postData.howToSteps,
        speakableText: postData.speakableText,
        scheduledAt: new Date(),
        tags: {
          connectOrCreate: postData.tags.map((name) => ({
            where: { name },
            create: { name },
          })),
        },
      },
      include: { tags: true },
    });

    await prisma.topic.update({
      where: { id: topic.id },
      data: {
        status: "PUBLISHED",
        postId: post.id,
        generatedAt: new Date(),
        publishedAt: new Date(),
      },
    });

    console.log(`[CRON] Successfully generated post: ${post.title}`);
    return post;
  } catch (error) {
    await prisma.topic.update({
      where: { id: topic.id },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    console.error(`[CRON] Failed to generate post for topic: ${topic.title}`, error);
    return null;
  }
}

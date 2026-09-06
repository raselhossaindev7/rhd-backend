import { Request, Response } from "express";
import prisma, { safeQuery } from "../config/db";
import { ApiError, sendSuccess, sendError, slugify } from "../utils/helpers";
import { generateTopics, saveTopics } from "../services/aiTopicGenerator";
import { generateBlogPost, BlogPostData } from "../services/aiBlogGenerator";
import { TopicStatus } from "@prisma/client";

// ─── Generation concurrency guard ─────────────────────────
// One blog generation burns ~6k TPM-limited Groq tokens per attempt and
// holds its HTTP connection for 1-2 minutes. Two overlapping runs
// (cron + manual "Generate Now", double-clicks, retry spam) instantly
// 429 the key AND pile more load on the DB pool. One at a time, globally.
let generationInFlight = false;

// ─── Topic CRUD ──────────────────────────────────────────

export async function getTopics(req: Request, res: Response) {
  try {
    const status = req.query.status as string | undefined;
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = parseInt((req.query.limit as string) || "20", 10);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status && typeof status === "string") where.status = status;

    // Sequential reads (no $transaction — see db.ts: a batch pins one
    // server connection on the Supabase transaction-mode pooler).
    const topics = await prisma.topic.findMany({
      where,
      include: { post: { select: { id: true, slug: true, title: true, published: true } } },
      orderBy: [
        { priority: "desc" },
        { scheduledFor: "asc" },
        { createdAt: "desc" },
      ],
      skip,
      take: limit,
    });
    const total = await prisma.topic.count({ where });

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
  // NOTE: generation takes 1-3 min (two sequential AI calls). Awaiting it
  // inside the HTTP cycle trips gateway timeouts (504 on Cloudflare/Render
  // ~100s). So we validate + enqueue synchronously, respond 202 at once,
  // and run the heavy work detached. Clients poll topics/stats for completion.
  if (generationInFlight) {
    return sendError(res, new ApiError(409, "A generation is already in progress — try again in a minute"));
  }
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

    // Mark as generating BEFORE responding, so polls/retries see it
    await prisma.topic.update({
      where: { id: topic.id },
      data: { status: "GENERATING", attempts: { increment: 1 } },
    });

    generationInFlight = true;
    const target = { id: topic.id, title: topic.title, category: topic.category, keywords: topic.keywords, description: topic.description };

    // Detached: must never throw back into Express (response already sent).
    setImmediate(() => {
      (async () => {
        try {
          const postData = await generateBlogPost(
            target.title,
            target.category,
            target.keywords,
            target.description || undefined
          );
          const post = await persistGeneratedPost(target.id, postData);
          console.log(`[SCHEDULE] Manual generation complete: ${post.title}`);
        } catch (genError) {
          console.error(`[SCHEDULE] Manual generation failed for: ${target.title}`, genError);
          await markTopicFailed(target.id, genError);
        } finally {
          generationInFlight = false;
        }
      })();
    });

    sendSuccess(
      res,
      {
        accepted: true,
        message: `Generation started for "${target.title}" — it runs in the background (1-3 min). Watch the topic queue for completion.`,
        topic: { id: target.id, title: target.title, status: "GENERATING" },
      },
      202
    );
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Schedule Stats ──────────────────────────────────────

export async function getScheduleStats(req: Request, res: Response) {
  try {
    // Sequential reads (no $transaction — see db.ts: a batch pins one
    // server connection on the Supabase transaction-mode pooler).
    // Slight staleness between aggregates is fine for a stats endpoint.
    const statusGroups = await prisma.topic.groupBy({ by: ["status"], _count: { status: true } });
    const totalPosts = await prisma.post.count();
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

    const countByStatus = Object.fromEntries(statusGroups.map((g) => [g.status, g._count.status]));
    const pending = countByStatus.PENDING ?? 0;
    const generating = countByStatus.GENERATING ?? 0;
    const completed = countByStatus.COMPLETED ?? 0;
    const failed = countByStatus.FAILED ?? 0;
    const published = countByStatus.PUBLISHED ?? 0;

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

// ─── Autopilot Maintenance (no human needed) ─────────────
// Runs every 15 min via cron AND before each daily generation:
//  1. sweep stuck GENERATING (crashed restarts, killed requests) → PENDING
//  2. revive FAILED with backoff (transient AI/DB errors recover alone)
//  3. refill the PENDING buffer so the queue never runs dry

const MAX_AUTO_ATTEMPTS = 10;
// A real generation takes 1-5 min (longer with 429 waits). Anything still
// GENERATING after 25 min is dead (restart/timeout) — safe to reclaim.
const STUCK_GENERATING_MINUTES = 25;
// FAILED cooldown grows per attempt (15min, 30min, 45min…) capped at 6h,
// so a rate-limited key recovers instead of being re-pounded.
const reviveCooldownMs = (attempts: number) =>
  Math.min(15 * 60 * 1000 * Math.max(1, attempts), 6 * 60 * 60 * 1000);
// Keep ~5 days of daily posts queued.
const TOPIC_BUFFER_TARGET = 5;

export async function runMaintenance(): Promise<void> {
  // 1. Sweep stuck GENERATING
  try {
    const stuckBefore = new Date(Date.now() - STUCK_GENERATING_MINUTES * 60 * 1000);
    const stuck = await prisma.topic.findMany({
      where: { status: "GENERATING", updatedAt: { lt: stuckBefore } },
      select: { id: true, title: true, attempts: true },
    });
    for (const t of stuck) {
      if (t.attempts >= MAX_AUTO_ATTEMPTS) {
        await prisma.topic.update({
          where: { id: t.id },
          data: { status: "FAILED", error: "Stuck in GENERATING repeatedly — attempts exhausted, needs a look" },
        });
        console.error(`[CRON] Topic parked as FAILED after ${t.attempts} attempts (was stuck): ${t.title}`);
      } else {
        await prisma.topic.update({
          where: { id: t.id },
          data: { status: "PENDING", error: "Auto-recovered from stuck GENERATING" },
        });
        console.log(`[CRON] Reclaimed stuck topic → PENDING: ${t.title}`);
      }
    }
  } catch (err) {
    console.error("[CRON] Stuck-sweep failed:", err);
  }

  // 2. Revive FAILED with per-topic backoff (updateMany can't do per-row
  // cooldowns, so select candidates then filter in code — small table).
  try {
    const failed = await prisma.topic.findMany({
      where: { status: "FAILED", attempts: { lt: MAX_AUTO_ATTEMPTS } },
      select: { id: true, title: true, attempts: true, updatedAt: true },
    });
    const now = Date.now();
    let revived = 0;
    for (const t of failed) {
      if (now - new Date(t.updatedAt).getTime() < reviveCooldownMs(t.attempts)) continue;
      await prisma.topic.update({
        where: { id: t.id },
        data: { status: "PENDING", error: null },
      });
      revived++;
    }
    if (revived > 0) console.log(`[CRON] Re-queued ${revived} failed topic(s)`);
  } catch (err) {
    console.error("[CRON] Failed-revive failed:", err);
  }

  // 3. Refill topic buffer (skip while a generation holds the AI/DB busy)
  try {
    if (generationInFlight) return;
    const pending = await prisma.topic.count({ where: { status: "PENDING" } });
    if (pending < TOPIC_BUFFER_TARGET) {
      console.log(`[CRON] Topic buffer low (${pending}/${TOPIC_BUFFER_TARGET}) — generating ideas...`);
      const topics = await generateTopics(TOPIC_BUFFER_TARGET);
      const saved = await saveTopics(topics);
      console.log(`[CRON] Buffer refilled: ${saved} new topic(s)`);
    }
  } catch (err) {
    console.error("[CRON] Buffer refill failed (will retry next cycle):", err);
  }
}

// ─── Cron Job Trigger (Internal) ─────────────────────────

export async function runScheduledGeneration() {
  if (generationInFlight) {
    console.log("[CRON] A generation is already running, skipping...");
    return;
  }
  generationInFlight = true;
  console.log("[CRON] Running scheduled blog generation...");

  try {
    await runMaintenance();

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
  } finally {
    generationInFlight = false;
  }
}

async function uniquePostSlug(base: string): Promise<string> {
  let slug = slugify(base);
  let existing = await prisma.post.findUnique({ where: { slug } });
  if (!existing) return slug;

  let i = 2;
  while (existing) {
    slug = `${slugify(base)}-${i}`;
    existing = await prisma.post.findUnique({ where: { slug } });
    i++;
  }
  return slug;
}

// ─── Resilient persistence ────────────────────────────────────
// The AI call takes 1-2 min during which pooled DB connections sit idle,
// and Supabase pooler may close them (10054 ConnectionReset). safeQuery
// retries transient connection errors, and the slug check makes post
// creation idempotent (no duplicate if the first try committed before
// the connection dropped).

async function persistGeneratedPost(topicId: string, postData: BlogPostData) {
  // Resolve the final slug once, so retries reuse it (idempotent)
  const slug = await safeQuery(() => uniquePostSlug(postData.slug));

  const post = await safeQuery(async () => {
    const existing = await prisma.post.findUnique({
      where: { slug },
      include: { tags: true },
    });
    if (existing) return existing;
    return prisma.post.create({
      data: {
        slug,
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
  });

  await safeQuery(() =>
    prisma.topic.update({
      where: { id: topicId },
      data: {
        status: "PUBLISHED",
        postId: post.id,
        generatedAt: new Date(),
        publishedAt: new Date(),
      },
    })
  );

  return post;
}

async function markTopicFailed(topicId: string, genError: unknown): Promise<void> {
  const message = genError instanceof Error ? genError.message : "Unknown error";
  try {
    await safeQuery(() =>
      prisma.topic.update({
        where: { id: topicId },
        data: { status: "FAILED", error: message },
      })
    );
  } catch (dbError) {
    // Status update itself failed (e.g. DB still unreachable) — log it,
    // the original generation error is what matters to the caller.
    console.error("[SCHEDULE] Failed to mark topic as failed:", dbError);
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

    const post = await persistGeneratedPost(topic.id, postData);

    console.log(`[CRON] Successfully generated post: ${post.title}`);
    return post;
  } catch (error) {
    console.error(`[CRON] Failed to generate post for topic: ${topic.title}`, error);
    await markTopicFailed(topic.id, error);
    return null;
  }
}

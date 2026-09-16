import { Request, Response } from "express";
import prisma, { safeQuery } from "../config/db";
import { ApiError, sendSuccess, sendError, slugify, parsePagination } from "../utils/helpers";
import { generateServiceTopics, saveServiceTopics } from "../services/aiServiceTopicGenerator";
import { getServiceDemandWithGsc } from "../services/demandSignals";
import { generateService, ServiceData } from "../services/aiServiceGenerator";
import { TopicStatus } from "@prisma/client";

// ─── Service Autopilot (daily cadence, trending-first) ──
// Queue model is ServiceTopic; generation turns one PENDING topic into
// a full Service row. Same guards: single global generation, detached
// HTTP (202 + background work), stuck-sweep + backoff + refill.
//
// NOTE on cadence: the cron publishes DAILY (see serviceScheduler.ts)
// with a 1-topic buffer — trending analysis first, then generate a
// service that clients actually search for.

// ─── Generation concurrency guard ─────────────────────────
let generationInFlight = false;

// ─── Live generation progress (polled by admin progress bar) ──
export type ServiceGenerationStage = "trending" | "writing" | "meta" | "thumbnail" | "publishing";

interface ServiceGenerationProgressState {
  active: boolean;
  topicId: string | null;
  topicTitle: string | null;
  stage: ServiceGenerationStage | null;
  startedAt: number | null;
  lastStatus: "published" | "failed" | null;
  lastTopicTitle: string | null;
  lastError: string | null;
  finishedAt: number | null;
  // Thumbnail live info (visible in admin while autopilot runs)
  thumbnailStage: "idle" | "generating" | "done" | "fallback" | null;
  thumbnailUrl: string | null;
  thumbnailSource: string | null;
}

const generationProgress: ServiceGenerationProgressState = {
  active: false,
  topicId: null,
  topicTitle: null,
  stage: null,
  startedAt: null,
  lastStatus: null,
  lastTopicTitle: null,
  lastError: null,
  finishedAt: null,
  thumbnailStage: null,
  thumbnailUrl: null,
  thumbnailSource: null,
};

const STAGE_LABELS: Record<ServiceGenerationStage, string> = {
  trending: "Analyzing trending topics",
  writing: "AI writing client-focused content",
  meta: "SEO meta + FAQ",
  thumbnail: "Generating AI cover image",
  publishing: "Publishing service",
};

function setProgress(patch: Partial<ServiceGenerationProgressState>): void {
  Object.assign(generationProgress, patch);
}

export function getServiceGenerationStatus() {
  const elapsedSec =
    generationProgress.active && generationProgress.startedAt
      ? Math.floor((Date.now() - generationProgress.startedAt) / 1000)
      : null;
  return {
    ...generationProgress,
    stageLabel: generationProgress.stage ? STAGE_LABELS[generationProgress.stage] : null,
    elapsedSec,
  };
}

// ─── Topic CRUD ──────────────────────────────────────────

export async function getServiceTopics(req: Request, res: Response) {
  try {
    const status = req.query.status as string | undefined;
    const VALID_STATUSES = ["PENDING", "GENERATING", "COMPLETED", "FAILED", "PUBLISHED"];
    if (status && !VALID_STATUSES.includes(status)) {
      throw new ApiError(400, `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`);
    }
    const { page, limit, skip } = parsePagination(req.query);

    const where: any = {};
    if (status && typeof status === "string") where.status = status;

    // Sequential reads (no $transaction — see db.ts: a batch pins one
    // server connection on the Supabase transaction-mode pooler).
    const topics = await prisma.serviceTopic.findMany({
      where,
      include: { service: { select: { id: true, slug: true, title: true, active: true } } },
      orderBy: [
        { priority: "desc" },
        { scheduledFor: "asc" },
        { createdAt: "desc" },
      ],
      skip,
      take: limit,
    });
    const total = await prisma.serviceTopic.count({ where });

    sendSuccess(res, {
      topics,
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    sendError(res, error as Error);
  }
}

export async function createServiceTopic(req: Request, res: Response) {
  try {
    const { title, category, keywords, description, priority, scheduledFor } = req.body;

    if (!title || !category) {
      throw new ApiError(400, "Title and category are required");
    }

    const topic = await prisma.serviceTopic.create({
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

export async function updateServiceTopic(req: Request, res: Response) {
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

    const existing = await prisma.serviceTopic.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Service topic not found");
    if (status !== undefined && !["PENDING", "GENERATING", "COMPLETED", "FAILED", "PUBLISHED"].includes(status)) {
      throw new ApiError(400, "Invalid status");
    }

    const topic = await prisma.serviceTopic.update({
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

export async function deleteServiceTopic(req: Request, res: Response) {
  try {
    const id = req.params.id as string;

    const existing = await prisma.serviceTopic.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Service topic not found");

    // Only allow deleting PENDING or FAILED topics
    if (existing.status === "GENERATING") {
      throw new ApiError(400, "Cannot delete a topic that is currently being generated");
    }

    // Race-safe: topic may vanish between findUnique and delete
    try {
      await prisma.serviceTopic.delete({ where: { id } });
    } catch (delErr: any) {
      if (delErr?.code === "P2025") {
        return sendSuccess(res, { message: "Service topic already deleted" });
      }
      throw delErr;
    }

    sendSuccess(res, { message: "Service topic deleted" });
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── AI Topic Generation ─────────────────────────────────

export async function generateServiceTopicSuggestions(req: Request, res: Response) {
  try {
    const count = parseInt((req.query.count as string) || "3", 10) || 3;
    const limitedCount = Math.min(Math.max(count, 1), 10);

    // Real Google demand first (GSC → Trends → Autocomplete); the generator
    // falls back to pure AI when collectors return nothing.
    const demand = await getServiceDemandWithGsc();
    const topics = await generateServiceTopics(limitedCount, {
      queries: demand.queries,
      priorityCategories: demand.categories,
    });
    const saved = await saveServiceTopics(topics);

    sendSuccess(res, {
      generated: topics.length,
      saved,
      topics,
    });
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Manual Service Generation ───────────────────────────

export async function generateServiceFromTopic(req: Request, res: Response) {
  // Same detached pattern as blog generatePost: validate + enqueue,
  // respond 202 at once, heavy work runs in background (gateway ~100s).
  // Flag claimed synchronously (no await between check and set) — see blog.
  if (generationInFlight) {
    return sendError(res, new ApiError(409, "A service generation is already in progress — try again in a minute"));
  }
  generationInFlight = true;
  try {
    const { topicId } = req.body;

    let topic;
    if (topicId) {
      topic = await prisma.serviceTopic.findUnique({ where: { id: topicId } });
      if (!topic) throw new ApiError(404, "Service topic not found");
      if (topic.status === "GENERATING") {
        throw new ApiError(400, "Topic is already being generated");
      }
    } else {
      // Find the next pending topic
      topic = await prisma.serviceTopic.findFirst({
        where: { status: "PENDING" },
        orderBy: [{ priority: "desc" }, { scheduledFor: "asc" }, { createdAt: "asc" }],
      });
      if (!topic) throw new ApiError(404, "No pending service topics found");
    }

    // Mark as generating BEFORE responding, so polls/retries see it
    await prisma.serviceTopic.update({
      where: { id: topic.id },
      data: { status: "GENERATING", attempts: { increment: 1 } },
    });

    const target = { id: topic.id, title: topic.title, category: topic.category, keywords: topic.keywords, description: topic.description };
    setProgress({
      active: true, topicId: target.id, topicTitle: target.title,
      stage: "trending", startedAt: Date.now(),
      lastStatus: null, lastTopicTitle: null, lastError: null, finishedAt: null,
      thumbnailStage: "idle", thumbnailUrl: null, thumbnailSource: null,
    });

    // Detached: must never throw back into Express (response already sent).
    setImmediate(() => {
      (async () => {
        try {
          const serviceData = await generateService(
            target.title,
            target.category,
            target.keywords,
            target.description || undefined,
            (stage) => setProgress({ stage }),
            (info) => setProgress({ thumbnailStage: info.stage, thumbnailUrl: info.url ?? null, thumbnailSource: info.source ?? null })
          );
          setProgress({ stage: "publishing" });
          const service = await persistGeneratedService(target.id, serviceData);
          console.log(`[SERVICE SCHEDULE] Manual generation complete: ${service.title}`);
          setProgress({ active: false, stage: null, lastStatus: "published", lastTopicTitle: service.title, finishedAt: Date.now() });
        } catch (genError) {
          console.error(`[SERVICE SCHEDULE] Manual generation failed for: ${target.title}`, genError);
          await markServiceTopicFailed(target.id, genError);
          const msg = genError instanceof Error ? genError.message : "Unknown error";
          setProgress({ active: false, stage: null, lastStatus: "failed", lastTopicTitle: target.title, lastError: msg, finishedAt: Date.now() });
        } finally {
          generationInFlight = false;
        }
      })();
    });

    sendSuccess(
      res,
      {
        accepted: true,
        message: `Generation started for "${target.title}" — it runs in the background (1-3 min). Watch the service topic queue for completion.`,
        topic: { id: target.id, title: target.title, status: "GENERATING" },
      },
      202
    );
  } catch (error) {
    // Validation failed before the background job started — release the flag
    generationInFlight = false;
    sendError(res, error as Error);
  }
}

// ─── Schedule Stats ──────────────────────────────────────

export async function getServiceScheduleStats(req: Request, res: Response) {
  try {
    // Sequential reads (no $transaction — see db.ts).
    const statusGroups = await prisma.serviceTopic.groupBy({ by: ["status"], _count: { status: true } });
    const totalServices = await prisma.service.count();
    const nextTopic = await prisma.serviceTopic.findFirst({
      where: { status: "PENDING" },
      orderBy: [{ priority: "desc" }, { scheduledFor: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true, category: true, scheduledFor: true },
    });
    const lastPublished = await prisma.serviceTopic.findFirst({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      select: { title: true, publishedAt: true, service: { select: { slug: true } } },
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
        totalServices,
      },
      nextTopic,
      lastPublished,
    });
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Autopilot Maintenance (no human needed) ─────────────
// Same 3 steps as blog runMaintenance: sweep stuck, revive failed
// with backoff, refill buffer. Buffer target is 1 — daily cadence,
// one trending service per day.
const MAX_AUTO_ATTEMPTS = 10;
const STUCK_GENERATING_MINUTES = 25;
const reviveCooldownMs = (attempts: number) =>
  Math.min(15 * 60 * 1000 * Math.max(1, attempts), 6 * 60 * 60 * 1000);
// Daily cadence — 1 topic buffered ahead.
const SERVICE_TOPIC_BUFFER_TARGET = 1;

export async function runServiceMaintenance(): Promise<void> {
  // 1. Sweep stuck GENERATING
  try {
    const stuckBefore = new Date(Date.now() - STUCK_GENERATING_MINUTES * 60 * 1000);
    const stuck = await prisma.serviceTopic.findMany({
      where: { status: "GENERATING", updatedAt: { lt: stuckBefore } },
      select: { id: true, title: true, attempts: true },
    });
    for (const t of stuck) {
      if (t.attempts >= MAX_AUTO_ATTEMPTS) {
        await prisma.serviceTopic.update({
          where: { id: t.id },
          data: { status: "FAILED", error: "Stuck in GENERATING repeatedly — attempts exhausted, needs a look" },
        });
        console.error(`[SERVICE CRON] Topic parked as FAILED after ${t.attempts} attempts (was stuck): ${t.title}`);
      } else {
        await prisma.serviceTopic.update({
          where: { id: t.id },
          data: { status: "PENDING", error: "Auto-recovered from stuck GENERATING" },
        });
        console.log(`[SERVICE CRON] Reclaimed stuck topic → PENDING: ${t.title}`);
      }
    }
  } catch (err) {
    console.error("[SERVICE CRON] Stuck-sweep failed:", err);
  }

  // 2. Revive FAILED with per-topic backoff
  try {
    const failed = await prisma.serviceTopic.findMany({
      where: { status: "FAILED", attempts: { lt: MAX_AUTO_ATTEMPTS } },
      select: { id: true, title: true, attempts: true, updatedAt: true },
    });
    const now = Date.now();
    let revived = 0;
    for (const t of failed) {
      if (now - new Date(t.updatedAt).getTime() < reviveCooldownMs(t.attempts)) continue;
      await prisma.serviceTopic.update({
        where: { id: t.id },
        data: { status: "PENDING", error: null },
      });
      revived++;
    }
    if (revived > 0) console.log(`[SERVICE CRON] Re-queued ${revived} failed service topic(s)`);
  } catch (err) {
    console.error("[SERVICE CRON] Failed-revive failed:", err);
  }

  // 3. Refill topic buffer (skip while a generation holds the AI/DB busy)
  try {
    if (generationInFlight) return;
    const pending = await prisma.serviceTopic.count({ where: { status: "PENDING" } });
    if (pending < SERVICE_TOPIC_BUFFER_TARGET) {
      console.log(`[SERVICE CRON] Topic buffer low (${pending}/${SERVICE_TOPIC_BUFFER_TARGET}) — generating ideas...`);
      const demand = await getServiceDemandWithGsc();
      const topics = await generateServiceTopics(SERVICE_TOPIC_BUFFER_TARGET, {
        queries: demand.queries,
        priorityCategories: demand.categories,
      });
      const saved = await saveServiceTopics(topics);
      console.log(`[SERVICE CRON] Buffer refilled: ${saved} new service topic(s)`);
    }
  } catch (err) {
    console.error("[SERVICE CRON] Buffer refill failed (will retry next cycle):", err);
  }
}

// ─── Live Generation Status (admin progress bar polling) ──

export async function getServiceGenerationProgress(_req: Request, res: Response) {
  try {
    sendSuccess(res, getServiceGenerationStatus());
  } catch (error) {
    sendError(res, error as Error);
  }
}

export async function getServiceDemandData(req: Request, res: Response) {
  try {
    const force = req.query.refresh === "1";
    const demand = await getServiceDemandWithGsc(force);
    sendSuccess(res, demand);
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Cron Job Trigger (Internal) ─────────────────────────

export async function runScheduledServiceGeneration() {
  if (generationInFlight) {
    console.log("[SERVICE CRON] A generation is already running, skipping...");
    return;
  }
  generationInFlight = true;
  console.log("[SERVICE CRON] Running scheduled service generation...");

  try {
    await runServiceMaintenance();

    // Find next pending topic
    const topic = await prisma.serviceTopic.findFirst({
      where: { status: "PENDING" },
      orderBy: [{ priority: "desc" }, { scheduledFor: "asc" }, { createdAt: "asc" }],
    });

    if (!topic) {
      console.log("[SERVICE CRON] No pending service topics found. Generating suggestions...");

      // Auto-generate topics if none exist
      const demand = await getServiceDemandWithGsc();
      const topics = await generateServiceTopics(2, {
        queries: demand.queries,
        priorityCategories: demand.categories,
      });
      await saveServiceTopics(topics);
      console.log(`[SERVICE CRON] Generated ${topics.length} new service topics`);

      // Try again to find a topic
      const newTopic = await prisma.serviceTopic.findFirst({
        where: { status: "PENDING" },
        orderBy: [{ priority: "desc" }, { scheduledFor: "asc" }, { createdAt: "asc" }],
      });

      if (!newTopic) {
        console.log("[SERVICE CRON] Still no topics available. Skipping.");
        return;
      }

      return await processServiceTopic(newTopic.id);
    }

    return await processServiceTopic(topic.id);
  } catch (error) {
    console.error("[SERVICE CRON] Error in scheduled generation:", error);
  } finally {
    generationInFlight = false;
  }
}

async function uniqueServiceSlug(base: string): Promise<string> {
  let slug = slugify(base);
  let existing = await prisma.service.findUnique({ where: { slug } });
  if (!existing) return slug;

  let i = 2;
  while (existing) {
    slug = `${slugify(base)}-${i}`;
    existing = await prisma.service.findUnique({ where: { slug } });
    i++;
  }
  return slug;
}

// ─── Resilient persistence (same idempotent pattern as blog) ──

async function persistGeneratedService(topicId: string, serviceData: ServiceData) {
  // Resolve the final slug once, so retries reuse it (idempotent)
  const slug = await safeQuery(() => uniqueServiceSlug(serviceData.slug));

  const service = await safeQuery(async () => {
    const existing = await prisma.service.findUnique({ where: { slug } });
    if (existing) return existing;
    return prisma.service.create({
      data: {
        slug,
        icon: serviceData.icon,
        title: serviceData.title,
        category: serviceData.category,
        description: serviceData.description,
        overview: serviceData.overview,
        image: serviceData.image,
        order: serviceData.order,
        featured: serviceData.featured,
        active: serviceData.active,
        deliverables: serviceData.deliverables,
        stack: serviceData.stack,
        bestFor: serviceData.bestFor,
        features: serviceData.features,
        metaTitle: serviceData.metaTitle,
        metaDescription: serviceData.metaDescription,
        ogImage: serviceData.ogImage,
        keywords: serviceData.keywords,
        canonical: serviceData.canonical,
        geoRegion: serviceData.geoRegion,
        geoPlaceName: serviceData.geoPlaceName,
        geoPosition: serviceData.geoPosition,
        geoCountry: serviceData.geoCountry,
        areaServed: serviceData.areaServed,
        availableLanguages: serviceData.availableLanguages,
        faqJson: serviceData.faqJson,
        howToSteps: serviceData.howToSteps,
        speakableText: serviceData.speakableText,
      },
    });
  });

  await safeQuery(() =>
    prisma.serviceTopic.update({
      where: { id: topicId },
      data: {
        status: "PUBLISHED",
        serviceId: service.id,
        generatedAt: new Date(),
        publishedAt: new Date(),
      },
    })
  );

  return service;
}

async function markServiceTopicFailed(topicId: string, genError: unknown): Promise<void> {
  const message = genError instanceof Error ? genError.message : "Unknown error";
  try {
    await safeQuery(() =>
      prisma.serviceTopic.update({
        where: { id: topicId },
        data: { status: "FAILED", error: message },
      })
    );
  } catch (dbError) {
    console.error("[SERVICE SCHEDULE] Failed to mark topic as failed:", dbError);
  }
}

async function processServiceTopic(topicId: string) {
  const topic = await prisma.serviceTopic.findUnique({ where: { id: topicId } });
  if (!topic) return null;

  // Mark as generating
  await prisma.serviceTopic.update({
    where: { id: topic.id },
    data: { status: "GENERATING", attempts: { increment: 1 } },
  });

  setProgress({
    active: true, topicId: topic.id, topicTitle: topic.title,
    stage: "trending", startedAt: Date.now(),
    lastStatus: null, lastTopicTitle: null, lastError: null, finishedAt: null,
    thumbnailStage: "idle", thumbnailUrl: null, thumbnailSource: null,
  });

  try {
    const serviceData = await generateService(
      topic.title,
      topic.category,
      topic.keywords,
      topic.description || undefined,
      (stage) => setProgress({ stage }),
      (info) => setProgress({ thumbnailStage: info.stage, thumbnailUrl: info.url ?? null, thumbnailSource: info.source ?? null })
    );

    setProgress({ stage: "publishing" });
    const service = await persistGeneratedService(topic.id, serviceData);

    console.log(`[SERVICE CRON] Successfully generated service: ${service.title}`);
    setProgress({ active: false, stage: null, lastStatus: "published", lastTopicTitle: service.title, finishedAt: Date.now() });
    return service;
  } catch (error) {
    console.error(`[SERVICE CRON] Failed to generate service for topic: ${topic.title}`, error);
    await markServiceTopicFailed(topic.id, error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    setProgress({ active: false, stage: null, lastStatus: "failed", lastTopicTitle: topic.title, lastError: msg, finishedAt: Date.now() });
    return null;
  }
}

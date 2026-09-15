import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import { cache } from "../middleware/cache";
import {
  getServiceTopics,
  createServiceTopic,
  updateServiceTopic,
  deleteServiceTopic,
  generateServiceTopicSuggestions,
  generateServiceFromTopic,
  getServiceScheduleStats,
  getServiceGenerationProgress,
  getServiceDemandData,
} from "../controllers/serviceScheduleController";

const router = Router();

// All routes require admin authentication (mirrors /api/schedule)
router.use(authenticate);
router.use(authorize(["ADMIN"]));

// ─── Topic CRUD ──────────────────────────────────────────
router.get("/topics", getServiceTopics);
router.post("/topics", createServiceTopic);
router.put("/topics/:id", updateServiceTopic);
router.delete("/topics/:id", deleteServiceTopic);

// ─── AI Generation ───────────────────────────────────────
router.post("/generate-topics", generateServiceTopicSuggestions);
router.post("/generate", generateServiceFromTopic);

// ─── Stats ───────────────────────────────────────────────
// Cached 30s — same pool-stampede protection as schedule stats.
router.get("/stats", cache(30), getServiceScheduleStats);

// ─── Live Google demand pool (ranked queries for next refill) ──
// Server-side 6h cache; ?refresh=1 forces a live re-fetch (~15s).
router.get("/demand", getServiceDemandData);

// ─── Live generation progress (polled by admin bar — NEVER cache) ──
router.get("/generation-status", getServiceGenerationProgress);

export default router;

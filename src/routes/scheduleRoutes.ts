import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import { cache } from "../middleware/cache";
import {
  getTopics,
  createTopic,
  updateTopic,
  deleteTopic,
  generateTopicSuggestions,
  generatePost,
  getScheduleStats,
  getGenerationProgress,
} from "../controllers/scheduleController";

const router = Router();

// All routes require admin authentication
router.use(authenticate);
router.use(authorize(["ADMIN"]));

// ─── Topic CRUD ──────────────────────────────────────────
router.get("/topics", getTopics);
router.post("/topics", createTopic);
router.put("/topics/:id", updateTopic);
router.delete("/topics/:id", deleteTopic);

// ─── AI Generation ───────────────────────────────────────
router.post("/generate-topics", generateTopicSuggestions);
router.post("/generate", generatePost);

// ─── Stats ───────────────────────────────────────────────
// Cached 30s — same pool-stampede protection as dashboard/analytics.
router.get("/stats", cache(30), getScheduleStats);

// ─── Live generation progress (polled by admin bar — NEVER cache) ──
router.get("/generation-status", getGenerationProgress);

export default router;

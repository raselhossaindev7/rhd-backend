import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import {
  getTopics,
  createTopic,
  updateTopic,
  deleteTopic,
  generateTopicSuggestions,
  generatePost,
  getScheduleStats,
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
router.get("/stats", getScheduleStats);

export default router;

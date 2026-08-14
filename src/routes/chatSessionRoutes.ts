import { Router } from "express";
import {
  createChatSession,
  updateChatSession,
  getChatSessions,
  getChatSession,
  updateSessionStatus,
  deleteChatSession,
  getChatStats,
} from "../controllers/chatSessionController";
import { authenticate } from "../middleware/auth";

const router = Router();

// ─── Public Routes ──────────────────────────────────────

// Create new chat session (visitor starts chat)
router.post("/", createChatSession);

// Update messages in session
router.put("/:id/messages", updateChatSession);

// ─── Admin Routes (Protected) ───────────────────────────

// Get all sessions
router.get("/", authenticate, getChatSessions);

// Get stats
router.get("/stats", authenticate, getChatStats);

// Get single session
router.get("/:id", authenticate, getChatSession);

// Update status
router.patch("/:id/status", authenticate, updateSessionStatus);

// Delete session
router.delete("/:id", authenticate, deleteChatSession);

export default router;

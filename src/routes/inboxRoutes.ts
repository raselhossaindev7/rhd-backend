import { Router } from "express";
import {
  getEmails,
  getEmail,
  getMailboxStats,
  markEmailAsRead,
  trashEmail,
  archiveEmail,
  permanentlyDeleteEmail,
  bulkAction,
} from "../controllers/inboxController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

// All routes require admin authentication
router.use(authenticate);
router.use(authorize(["ADMIN"]));

// ─── Inbox Routes ─────────────────────────────────────────

router.get("/", getEmails);
router.get("/stats", getMailboxStats);
router.get("/:id", getEmail);

// ─── Email Actions ────────────────────────────────────────

router.patch("/:id/read", markEmailAsRead);
router.patch("/:id/trash", trashEmail);
router.patch("/:id/archive", archiveEmail);
router.delete("/:id", permanentlyDeleteEmail);

// ─── Bulk Actions ─────────────────────────────────────────

router.post("/bulk", bulkAction);

export default router;

import { Router } from "express";
import { chat } from "../controllers/chatController";

const router = Router();

// Public — no auth needed for chat
router.post("/", chat);

export default router;

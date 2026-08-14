import { Router } from "express";
import { subscribe, unsubscribe, getSubscribers } from "../controllers/subscriberController";
import { authenticate, authorize } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { z } from "zod";

const router = Router();

const emailSchema = z.object({
  email: z.string().email("Invalid email"),
});

// Public
router.post("/subscribe", validate(emailSchema), subscribe);
router.post("/unsubscribe", validate(emailSchema), unsubscribe);

// Protected (admin)
router.get("/", authenticate, authorize(["ADMIN"]), getSubscribers);

export default router;

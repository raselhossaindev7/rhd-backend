import { Router } from "express";
import { trackPageView, getAnalytics } from "../controllers/analyticsController";
import { authenticate, authorize } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { z } from "zod";

const router = Router();

const trackSchema = z.object({
  path: z.string().min(1, "Path is required"),
});

// Public - track page views
router.post("/track", validate(trackSchema), trackPageView);

// Protected (admin) - view analytics
router.get("/", authenticate, authorize(["ADMIN"]), getAnalytics);

export default router;

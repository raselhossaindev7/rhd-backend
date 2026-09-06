import { Router } from "express";
import { trackPageView, getAnalytics } from "../controllers/analyticsController";
import { authenticate, authorize } from "../middleware/auth";
import { cache } from "../middleware/cache";
import { validate } from "../middleware/validate";
import { z } from "zod";

const router = Router();

const trackSchema = z.object({
  path: z.string().min(1, "Path is required"),
});

// Public - track page views
router.post("/track", validate(trackSchema), trackPageView);

// Protected (admin) - view analytics
// 12 heavy aggregates, polled every 30s by admin — cache 30s so polling
// can't stampede the 10-connection pool. Staleness of 30s is fine.
router.get("/", authenticate, authorize(["ADMIN"]), cache(30), getAnalytics);

export default router;

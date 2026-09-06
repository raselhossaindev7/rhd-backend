import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import { cache } from "../middleware/cache";
import { getDashboardStats } from "../controllers/dashboardController";

const router = Router();

// 17 aggregate queries — cache 30s so concurrent admin polling
// (dashboard + analytics + lists on every page load) can't stampede
// the 10-connection pool. Stats staleness of 30s is fine.
router.get("/stats", authenticate, authorize(["ADMIN"]), cache(30), getDashboardStats);

export default router;

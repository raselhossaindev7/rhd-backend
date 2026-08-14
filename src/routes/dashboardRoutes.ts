import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import { getDashboardStats } from "../controllers/dashboardController";

const router = Router();

router.get("/stats", authenticate, authorize(["ADMIN"]), getDashboardStats);

export default router;

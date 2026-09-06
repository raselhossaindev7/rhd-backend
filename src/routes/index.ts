import { Router } from "express";
import authRoutes from "./authRoutes";
import contactRoutes from "./contactRoutes";
import projectRoutes from "./projectRoutes";
import postRoutes from "./postRoutes";
import subscriberRoutes from "./subscriberRoutes";
import analyticsRoutes from "./analyticsRoutes";
import uploadRoutes from "./uploadRoutes";
import emailRoutes from "./emailRoutes";
import serviceRoutes from "./serviceRoutes";
import testimonialRoutes from "./testimonialRoutes";
import chatRoutes from "./chatRoutes";
import chatSessionRoutes from "./chatSessionRoutes";
import dashboardRoutes from "./dashboardRoutes";
import settingsRoutes from "./settingsRoutes";
import scheduleRoutes from "./scheduleRoutes";
import inboxRoutes from "./inboxRoutes";

import prisma from "../config/db";

const router = Router();

router.use("/auth", authRoutes);
router.use("/contacts", contactRoutes);
router.use("/projects", projectRoutes);
router.use("/posts", postRoutes);
router.use("/subscribers", subscriberRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/upload", uploadRoutes);
router.use("/email", emailRoutes);
router.use("/services", serviceRoutes);
router.use("/testimonials", testimonialRoutes);
router.use("/chat", chatRoutes);
router.use("/chat-sessions", chatSessionRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/settings", settingsRoutes);
router.use("/schedule", scheduleRoutes);
router.use("/inbox", inboxRoutes);

// Health check (DB probe has a hard 2.5s timeout — same as /health in
// server.ts. Without it, a saturated pool makes /api/health hang for
// pool_timeout seconds, consuming yet another pool slot and making the
// outage look (and get) worse. Health must fail fast, never hang.)
router.get("/health", async (_req, res) => {
  let dbStatus: "connected" | "degraded" | "disconnected" = "disconnected";
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("db-probe-timeout")), 2500)),
    ]);
    dbStatus = "connected";
  } catch (err: any) {
    dbStatus = err?.message === "db-probe-timeout" ? "degraded" : "disconnected";
  }

  res.json({
    status: "ok",
    database: dbStatus,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

export default router;

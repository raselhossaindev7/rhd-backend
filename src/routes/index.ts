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

// Health check
router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

export default router;

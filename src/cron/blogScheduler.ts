import cron from "node-cron";
import { runScheduledGeneration, runMaintenance } from "../controllers/scheduleController";

// ─── Blog Autopilot (zero human input) ───────────────────
// Daily post:  6:00 PM Asia/Dhaka ("0 18 * * *", evaluated IN the
//              Asia/Dhaka tz below — node-cron evaluates the expression
//              in the given timezone, NOT in UTC).
// Maintenance: every 15 min — reclaims stuck GENERATING, revives FAILED
//              with backoff, refills the topic buffer. Cheap DB queries,
//              AI only fires when the buffer is actually low.

let isRunning = false;
let maintenanceRunning = false;
let scheduledTask: cron.ScheduledTask | null = null;
let maintenanceTask: cron.ScheduledTask | null = null;

export function startBlogScheduler() {
  if (scheduledTask) {
    console.log("[CRON] Blog scheduler already running");
    return;
  }

  // 6:00 PM daily Asia/Dhaka time (expression is evaluated in that tz)
  scheduledTask = cron.schedule("0 18 * * *", async () => {
    if (isRunning) {
      console.log("[CRON] Previous generation still running, skipping...");
      return;
    }

    isRunning = true;
    console.log("[CRON] Starting scheduled blog generation at", new Date().toISOString());

    try {
      await runScheduledGeneration();
    } catch (error) {
      console.error("[CRON] Scheduled generation failed:", error);
    } finally {
      isRunning = false;
    }
  }, {
    timezone: "Asia/Dhaka", // Bangladesh timezone
  });

  maintenanceTask = cron.schedule("*/15 * * * *", async () => {
    if (maintenanceRunning || isRunning) return;
    maintenanceRunning = true;
    try {
      await runMaintenance();
    } catch (error) {
      console.error("[CRON] Maintenance cycle failed:", error);
    } finally {
      maintenanceRunning = false;
    }
  }, {
    timezone: "Asia/Dhaka",
  });

  console.log(`
  ┌─────────────────────────────────────────┐
  │   📅 Blog Autopilot Active              │
  │                                         │
  │   Post: Daily at 6:00 PM (BST)         │
  │   Maintenance: every 15 min             │
  │   Timezone: Asia/Dhaka                  │
  │   Status: Running (no human needed)     │
  └─────────────────────────────────────────┘
  `);
}

export function stopBlogScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
  if (maintenanceTask) {
    maintenanceTask.stop();
    maintenanceTask = null;
  }
  console.log("[CRON] Blog scheduler stopped");
}

export function getSchedulerStatus() {
  return {
    running: scheduledTask !== null,
    maintenance: maintenanceTask !== null,
    isGenerating: isRunning,
    schedule: "0 18 * * *",
    maintenanceSchedule: "*/15 * * * *",
    timezone: "Asia/Dhaka",
    nextRun: scheduledTask ? "Daily at 6:00 PM BST" : "Not scheduled",
  };
}

// Manual trigger for testing
export async function triggerManualGeneration() {
  if (isRunning) {
    throw new Error("Generation already in progress");
  }

  isRunning = true;
  try {
    await runScheduledGeneration();
  } finally {
    isRunning = false;
  }
}

import cron from "node-cron";
import { runScheduledGeneration } from "../controllers/scheduleController";

// ─── Blog Scheduler Cron Job ─────────────────────────────
// Runs daily at 6:00 PM (18:00) - Asia/Dhaka timezone
// Cron expression: "0 18 * * *" (every day at 18:00)

let isRunning = false;
let scheduledTask: cron.ScheduledTask | null = null;

export function startBlogScheduler() {
  if (scheduledTask) {
    console.log("[CRON] Blog scheduler already running");
    return;
  }

  // Schedule for 6:00 PM daily (Asia/Dhaka = UTC+6, so 12:00 UTC)
  // Using UTC time: 12:00 UTC = 18:00 BST (Bangladesh Standard Time)
  scheduledTask = cron.schedule("0 12 * * *", async () => {
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

  console.log(`
  ┌─────────────────────────────────────────┐
  │   📅 Blog Scheduler Active              │
  │                                         │
  │   Schedule: Daily at 6:00 PM (BST)     │
  │   Timezone: Asia/Dhaka                  │
  │   Status: Running                       │
  └─────────────────────────────────────────┘
  `);
}

export function stopBlogScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log("[CRON] Blog scheduler stopped");
  }
}

export function getSchedulerStatus() {
  return {
    running: scheduledTask !== null,
    isGenerating: isRunning,
    schedule: "0 18 * * *",
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

import cron from "node-cron";
import { runScheduledServiceGeneration, runServiceMaintenance } from "../controllers/serviceScheduleController";

// ─── Service Autopilot (daily cadence, trending-first) ──
// AUTO mode: publish every day at 6:00 PM Asia/Dhaka, zero human input.
// Each cycle: trending analysis → topic generation → full service page + AI cover.
// Maintenance: hourly at :07 — staggered off blog's :00/:15/:30/:45
// sweeps so the two autopilots never stampede the Supabase pooler.
//
// Set SERVICE_AUTO_PUBLISH=false for CLIENT mode (ideas queue up, a human
// publishes winners manually from the admin).

let isRunning = false;
let maintenanceRunning = false;
let scheduledTask: cron.ScheduledTask | null = null;
let maintenanceTask: cron.ScheduledTask | null = null;

export function startServiceScheduler() {
  if (scheduledTask) {
    console.log("[CRON] Service scheduler already running");
    return;
  }

  const autoPublish = process.env.SERVICE_AUTO_PUBLISH !== "false";

  // Daily 6:00 PM BST (12:00 UTC) — every day, no parity gate.
  if (autoPublish) {
    scheduledTask = cron.schedule("0 12 * * *", async () => {
      if (isRunning) {
        console.log("[SERVICE CRON] Previous generation still running, skipping...");
        return;
      }

      isRunning = true;
      console.log("[SERVICE CRON] Starting DAILY service generation at", new Date().toISOString());

      try {
        await runScheduledServiceGeneration();
      } catch (error) {
        console.error("[SERVICE CRON] Scheduled generation failed:", error);
      } finally {
        isRunning = false;
      }
    }, {
      timezone: "Asia/Dhaka",
    });
  }

  maintenanceTask = cron.schedule("7 * * * *", async () => {
    if (maintenanceRunning || isRunning) return;
    maintenanceRunning = true;
    try {
      await runServiceMaintenance();
    } catch (error) {
      console.error("[SERVICE CRON] Maintenance cycle failed:", error);
    } finally {
      maintenanceRunning = false;
    }
  }, {
    timezone: "Asia/Dhaka",
  });

  console.log(`
  ┌─────────────────────────────────────────┐
  │   Service Autopilot Active              │
  │                                         │
  │   Mode: ${autoPublish ? "Daily 6PM (trending → generate)" : "CLIENT (manual publish)"}│
  │   Maintenance: hourly at :07            │
  │   Timezone: Asia/Dhaka                  │
  │   Status: Running (no human needed)     │
  └─────────────────────────────────────────┘
  `);
}

export function stopServiceScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
  if (maintenanceTask) {
    maintenanceTask.stop();
    maintenanceTask = null;
  }
  console.log("[SERVICE CRON] Service scheduler stopped");
}

export function getServiceSchedulerStatus() {
  const autoPublish = process.env.SERVICE_AUTO_PUBLISH !== "false";
  return {
    running: scheduledTask !== null || maintenanceTask !== null,
    autoPublish,
    maintenance: maintenanceTask !== null,
    isGenerating: isRunning,
    schedule: autoPublish ? "0 12 * * * (daily 6PM BST)" : "disabled (CLIENT mode — manual publish)",
    maintenanceSchedule: "7 * * * *",
    timezone: "Asia/Dhaka",
    nextRun: scheduledTask ? "Every day at 6:00 PM BST" : "Manual only",
  };
}

// Manual trigger for testing
export async function triggerManualServiceGeneration() {
  if (isRunning) {
    throw new Error("Service generation already in progress");
  }

  isRunning = true;
  try {
    await runScheduledServiceGeneration();
  } finally {
    isRunning = false;
  }
}

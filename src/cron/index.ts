import { startBlogScheduler } from "./blogScheduler";

export function initializeCronJobs() {
  console.log("[CRON] Initializing cron jobs...");

  // Start the blog scheduler
  startBlogScheduler();

  console.log("[CRON] All cron jobs initialized");
}

export { startBlogScheduler, stopBlogScheduler, getSchedulerStatus, triggerManualGeneration } from "./blogScheduler";

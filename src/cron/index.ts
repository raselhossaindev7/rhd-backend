import { startBlogScheduler } from "./blogScheduler";
import { startServiceScheduler } from "./serviceScheduler";

export function initializeCronJobs() {
  console.log("[CRON] Initializing cron jobs...");

  // Start the blog scheduler
  startBlogScheduler();

  // Start the service autopilot (weekly — see serviceScheduler.ts)
  startServiceScheduler();

  console.log("[CRON] All cron jobs initialized");
}

export { startBlogScheduler, stopBlogScheduler, getSchedulerStatus, triggerManualGeneration } from "./blogScheduler";
export {
  startServiceScheduler,
  stopServiceScheduler,
  getServiceSchedulerStatus,
  triggerManualServiceGeneration,
} from "./serviceScheduler";

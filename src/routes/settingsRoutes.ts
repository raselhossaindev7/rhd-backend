import { Router } from "express";
import {
  getProfile,
  updateProfile,
  changePassword,
  getSystemInfo,
  getAiSettings,
  updateAiSettings,
  listAiModels,
  testAiSettings,
} from "../controllers/settingsController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

// All routes require admin authentication (exposes API keys + system info)
router.use(authenticate);
router.use(authorize(["ADMIN"]));

// Profile
router.get("/profile", getProfile);
router.put("/profile", updateProfile);

// Password
router.put("/password", changePassword);

// System info
router.get("/system", getSystemInfo);

// AI provider config (Ollama / Gemini / OpenRouter / Groq / Cerebras)
router.get("/ai", getAiSettings);
router.put("/ai", updateAiSettings);
router.post("/ai/models", listAiModels);
router.post("/ai/test", testAiSettings);

export default router;

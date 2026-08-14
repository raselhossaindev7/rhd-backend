import { Router } from "express";
import {
  getProfile,
  updateProfile,
  changePassword,
  getSystemInfo,
} from "../controllers/settingsController";
import { authenticate } from "../middleware/auth";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Profile
router.get("/profile", getProfile);
router.put("/profile", updateProfile);

// Password
router.put("/password", changePassword);

// System info
router.get("/system", getSystemInfo);

export default router;

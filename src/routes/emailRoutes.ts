import { Router } from "express";
import { sendCustomEmail, sendBulkEmail, testEmail } from "../controllers/emailController";
import { authenticate, authorize } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { z } from "zod";

const router = Router();

const emailSchema = z.object({
  to: z.string().email("Invalid email"),
  subject: z.string().min(1, "Subject is required"),
  html: z.string().min(1, "HTML content is required"),
});

const bulkSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  html: z.string().min(1, "HTML content is required"),
});

const testSchema = z.object({
  to: z.string().email("Invalid email"),
});

// All routes are admin-only
router.post("/send", authenticate, authorize(["ADMIN"]), validate(emailSchema), sendCustomEmail);
router.post("/bulk", authenticate, authorize(["ADMIN"]), validate(bulkSchema), sendBulkEmail);
router.post("/test", authenticate, authorize(["ADMIN"]), validate(testSchema), testEmail);

export default router;

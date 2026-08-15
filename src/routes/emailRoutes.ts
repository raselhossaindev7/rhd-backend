import { Router } from "express";
import {
  getTemplates,
  previewTemplate,
  sendTemplateEmail,
  sendCustomEmail,
  sendBulkEmail,
  sendBulkTemplateEmail,
  testEmail,
  generateAIEmail,
  generateAISubjectLines,
} from "../controllers/emailController";
import { authenticate, authorize } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { z } from "zod";

const router = Router();

// ─── Validation Schemas ───────────────────────────────────

const templateSendSchema = z.object({
  to: z.string().email("Invalid email"),
  templateId: z.string().min(1, "Template ID is required"),
  variables: z.record(z.any()).optional(),
  subject: z.string().optional(),
});

const previewSchema = z.object({
  templateId: z.string().min(1, "Template ID is required"),
  variables: z.record(z.any()).optional(),
});

const customEmailSchema = z.object({
  to: z.string().email("Invalid email"),
  subject: z.string().min(1, "Subject is required"),
  html: z.string().min(1, "HTML content is required"),
});

const bulkSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  html: z.string().min(1, "HTML content is required"),
});

const bulkTemplateSchema = z.object({
  templateId: z.string().min(1, "Template ID is required"),
  variables: z.record(z.any()).optional(),
  subject: z.string().optional(),
});

const testSchema = z.object({
  to: z.string().email("Invalid email"),
});

const aiEmailSchema = z.object({
  type: z.enum(["cold-outreach", "follow-up", "proposal", "thank-you", "custom"]),
  recipientName: z.string().optional(),
  recipientCompany: z.string().optional(),
  recipientRole: z.string().optional(),
  purpose: z.string().optional(),
  customPrompt: z.string().optional(),
});

const aiSubjectSchema = z.object({
  recipientName: z.string().min(1, "Recipient name is required"),
  recipientCompany: z.string().min(1, "Company name is required"),
  purpose: z.string().optional(),
});

// ─── AI Generation Routes (Admin) ─────────────────────────

router.post("/ai/generate", authenticate, authorize(["ADMIN"]), validate(aiEmailSchema), generateAIEmail);
router.post("/ai/subjects", authenticate, authorize(["ADMIN"]), validate(aiSubjectSchema), generateAISubjectLines);

// ─── Template Routes (Admin) ──────────────────────────────

router.get("/templates", authenticate, authorize(["ADMIN"]), getTemplates);
router.post("/templates/preview", authenticate, authorize(["ADMIN"]), validate(previewSchema), previewTemplate);
router.post("/templates/send", authenticate, authorize(["ADMIN"]), validate(templateSendSchema), sendTemplateEmail);
router.post("/templates/bulk", authenticate, authorize(["ADMIN"]), validate(bulkTemplateSchema), sendBulkTemplateEmail);

// ─── Custom Email Routes (Admin) ──────────────────────────

router.post("/send", authenticate, authorize(["ADMIN"]), validate(customEmailSchema), sendCustomEmail);
router.post("/bulk", authenticate, authorize(["ADMIN"]), validate(bulkSchema), sendBulkEmail);
router.post("/test", authenticate, authorize(["ADMIN"]), validate(testSchema), testEmail);

export default router;

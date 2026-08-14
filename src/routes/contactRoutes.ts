import { Router } from "express";
import {
  submitContact,
  getContacts,
  getContact,
  updateContactStatus,
  deleteContact,
} from "../controllers/contactController";
import { authenticate, authorize } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { z } from "zod";

const router = Router();

const contactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  type: z.string().optional(),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

const statusSchema = z.object({
  status: z.enum(["NEW", "READ", "ARCHIVED"]),
});

// Public
router.post("/", validate(contactSchema), submitContact);

// Protected (admin)
router.get("/", authenticate, authorize(["ADMIN"]), getContacts);
router.get("/:id", authenticate, authorize(["ADMIN"]), getContact);
router.patch("/:id/status", authenticate, authorize(["ADMIN"]), validate(statusSchema), updateContactStatus);
router.delete("/:id", authenticate, authorize(["ADMIN"]), deleteContact);

export default router;

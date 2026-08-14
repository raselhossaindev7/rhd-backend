import { Router } from "express";
import {
  getTestimonials,
  getTestimonial,
  createTestimonial,
  updateTestimonial,
  deleteTestimonial,
} from "../controllers/testimonialController";
import { authenticate, authorize } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { z } from "zod";

const router = Router();

const testimonialSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  quote: z.string().min(1),
  rating: z.coerce.number().min(1).max(5).default(5),
  image: z.string().optional().nullable(),
  order: z.coerce.number().default(0),
  active: z.coerce.boolean().default(true),
});

// Public
router.get("/", getTestimonials);

// Protected (admin)
router.get("/:id", authenticate, authorize(["ADMIN"]), getTestimonial);
router.post("/", authenticate, authorize(["ADMIN"]), validate(testimonialSchema), createTestimonial);
router.put("/:id", authenticate, authorize(["ADMIN"]), validate(testimonialSchema), updateTestimonial);
router.delete("/:id", authenticate, authorize(["ADMIN"]), deleteTestimonial);

export default router;

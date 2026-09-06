import { Router } from "express";
import {
  getServices,
  getService,
  getServiceBySlug,
  createService,
  updateService,
  deleteService,
} from "../controllers/serviceController";
import { authenticate, authorize } from "../middleware/auth";
import { cache } from "../middleware/cache";
import { validate } from "../middleware/validate";
import { z } from "zod";

const router = Router();

const jsonArrOrEmpty = z.preprocess(
  (val) => {
    if (typeof val === "string") {
      try { return JSON.parse(val); } catch { return []; }
    }
    return val;
  },
  z.array(z.string()).optional().default([])
);

const faqSchema = z.preprocess(
  (val) => {
    if (typeof val === "string") {
      try { return JSON.parse(val); } catch { return []; }
    }
    return val;
  },
  z.array(z.object({ question: z.string(), answer: z.string() })).optional()
);

const howToSchema = z.preprocess(
  (val) => {
    if (typeof val === "string") {
      try { return JSON.parse(val); } catch { return []; }
    }
    return val;
  },
  z.array(z.object({ name: z.string(), text: z.string() })).optional()
);

const serviceSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  icon: z.string().optional().default("code"),
  title: z.string().min(1, "Title is required"),
  category: z.string().min(1, "Category is required"),
  description: z.string().min(1, "Description is required"),
  overview: z.string().min(1, "Overview is required"),
  order: z.coerce.number().optional().default(0),
  featured: z.coerce.boolean().optional().default(false),
  active: z.coerce.boolean().optional().default(true),
  deliverables: jsonArrOrEmpty,
  stack: jsonArrOrEmpty,
  bestFor: jsonArrOrEmpty,
  features: jsonArrOrEmpty,
  metaTitle: z.string().optional().nullable(),
  metaDescription: z.string().optional().nullable(),
  ogImage: z.string().optional().nullable(),
  keywords: jsonArrOrEmpty,
  canonical: z.string().optional().nullable(),
  geoRegion: z.string().optional().nullable(),
  geoPlaceName: z.string().optional().nullable(),
  geoPosition: z.string().optional().nullable(),
  geoCountry: z.string().optional().nullable(),
  areaServed: z.string().optional().nullable(),
  availableLanguages: jsonArrOrEmpty,
  faqJson: faqSchema,
  howToSteps: howToSchema,
  speakableText: z.string().optional().nullable(),
});

// Public (cached 60s — invalidated on create/update/delete)
router.get("/", cache(60), getServices);
router.get("/slug/:slug", cache(60), getServiceBySlug);

// Protected (admin)
router.get("/:id", authenticate, authorize(["ADMIN"]), getService);
router.post("/", authenticate, authorize(["ADMIN"]), validate(serviceSchema), createService);
router.put("/:id", authenticate, authorize(["ADMIN"]), validate(serviceSchema), updateService);
router.delete("/:id", authenticate, authorize(["ADMIN"]), deleteService);

export default router;

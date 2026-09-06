import { Router } from "express";
import {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
} from "../controllers/projectController";
import { authenticate, authorize } from "../middleware/auth";
import { cache } from "../middleware/cache";

const router = Router();

const jsonArrOrEmpty = {
  coerce: true,
  transform: (val: any) => {
    if (typeof val === "string") {
      try { return JSON.parse(val); } catch { return []; }
    }
    return val || [];
  },
};

// Public (cached 60s — invalidated on create/update/delete)
router.get("/", cache(60), getProjects);
router.get("/slug/:slug", cache(60), getProject);

// Protected (admin)
router.get("/:id", authenticate, authorize(["ADMIN"]), getProject);
router.post("/", authenticate, authorize(["ADMIN"]), createProject);
router.put("/:id", authenticate, authorize(["ADMIN"]), updateProject);
router.delete("/:id", authenticate, authorize(["ADMIN"]), deleteProject);

export default router;

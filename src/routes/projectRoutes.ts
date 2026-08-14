import { Router } from "express";
import {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
} from "../controllers/projectController";
import { authenticate, authorize } from "../middleware/auth";

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

// Public
router.get("/", getProjects);
router.get("/slug/:slug", getProject);

// Protected (admin)
router.get("/:id", authenticate, authorize(["ADMIN"]), getProject);
router.post("/", authenticate, authorize(["ADMIN"]), createProject);
router.put("/:id", authenticate, authorize(["ADMIN"]), updateProject);
router.delete("/:id", authenticate, authorize(["ADMIN"]), deleteProject);

export default router;

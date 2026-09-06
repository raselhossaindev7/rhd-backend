import { Router } from "express";
import {
  getPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
} from "../controllers/postController";
import { authenticate, authorize } from "../middleware/auth";
import { cache } from "../middleware/cache";

const router = Router();

// Public (cached 60s — invalidated on create/update/delete)
router.get("/", cache(60), getPosts);
router.get("/slug/:slug", cache(60), getPost);

// Protected (admin)
router.get("/:id", authenticate, authorize(["ADMIN"]), getPost);
router.post("/", authenticate, authorize(["ADMIN"]), createPost);
router.put("/:id", authenticate, authorize(["ADMIN"]), updatePost);
router.delete("/:id", authenticate, authorize(["ADMIN"]), deletePost);

export default router;

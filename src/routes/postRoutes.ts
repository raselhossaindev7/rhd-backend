import { Router } from "express";
import {
  getPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
} from "../controllers/postController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

// Public
router.get("/", getPosts);
router.get("/slug/:slug", getPost);

// Protected (admin)
router.get("/:id", authenticate, authorize(["ADMIN"]), getPost);
router.post("/", authenticate, authorize(["ADMIN"]), createPost);
router.put("/:id", authenticate, authorize(["ADMIN"]), updatePost);
router.delete("/:id", authenticate, authorize(["ADMIN"]), deletePost);

export default router;

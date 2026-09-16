import { Router } from "express";
import {
  upload,
  uploadImage,
  uploadDocument,
  uploadMultipleImages,
  listFiles,
  deleteFile,
  bulkDeleteFiles,
  getUploadUrl,
  proxyImage,
  debugR2Key,
} from "../controllers/uploadController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

// ─── Upload Routes ──────────────────────────────────────────

// Proxy image (for CORS - public, portfolio needs it)
router.get("/proxy", proxyImage);

// Debug R2 key lookup (ADMIN only — discloses bucket keys)
router.get("/debug-key", authenticate, authorize(["ADMIN"]), debugR2Key);

// Mutations + listing (ADMIN only — R2 write/delete + presigned URLs)
router.use(authenticate);
router.use(authorize(["ADMIN"]));

// List all files in R2
router.get("/", authenticate, listFiles);

// Single image upload (processed to WebP)
router.post(
  "/image",
  authenticate,
  upload.single("file"),
  uploadImage
);

// Multiple images upload
router.post(
  "/images",
  authenticate,
  upload.array("files", 10),
  uploadMultipleImages
);

// Document upload (PDF, MD)
router.post(
  "/document",
  authenticate,
  upload.single("file"),
  uploadDocument
);

// Get presigned URL for client-side upload
router.post(
  "/presigned-url",
  authenticate,
  getUploadUrl
);

// Delete single file
router.delete(
  "/",
  authenticate,
  deleteFile
);

// Bulk delete files
router.post(
  "/bulk-delete",
  authenticate,
  bulkDeleteFiles
);

export default router;

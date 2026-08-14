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
import { authenticate } from "../middleware/auth";

const router = Router();

// ─── Upload Routes (All Protected) ────────────────────────

// Proxy image (for CORS - no auth needed)
router.get("/proxy", proxyImage);

// Debug R2 key lookup (no auth needed)
router.get("/debug-key", debugR2Key);

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

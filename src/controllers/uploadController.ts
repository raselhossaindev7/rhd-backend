import { Response } from "express";
import multer from "multer";
import sharp from "sharp";
import { ListObjectsV2Command, GetObjectCommand, HeadObjectCommand, _Object } from "@aws-sdk/client-s3";
import { r2Client, uploadToR2, deleteFromR2, generateKey } from "../config/r2";
import { sendSuccess, sendError, ApiError } from "../utils/helpers";
import { AuthRequest } from "../types";
import { config } from "../config/env";

// ─── Multer Config ────────────────────────────────────────

const ALLOWED_TYPES = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"],
  document: ["application/pdf", "text/markdown"],
};

const MAX_SIZES = {
  image: 5 * 1024 * 1024, // 5MB
  document: 10 * 1024 * 1024, // 10MB
};

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allTypes = [...ALLOWED_TYPES.image, ...ALLOWED_TYPES.document];
    if (allTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ApiError(400, `File type ${file.mimetype} not allowed`));
    }
  },
});

// ─── Image Processing ─────────────────────────────────────

async function processImage(buffer: Buffer, options?: { width?: number; quality?: number }) {
  return sharp(buffer)
    .resize(options?.width || 1200, undefined, {
      withoutEnlargement: true,
      fit: "inside",
    })
    .webp({ quality: options?.quality || 80 })
    .toBuffer();
}

// ─── Upload Image ─────────────────────────────────────────

export async function uploadImage(req: AuthRequest, res: Response) {
  try {
    const file = req.file;
    if (!file) {
      throw new ApiError(400, "No file provided");
    }

    if (!ALLOWED_TYPES.image.includes(file.mimetype)) {
      throw new ApiError(400, "Only image files are allowed");
    }

    if (file.size > MAX_SIZES.image) {
      throw new ApiError(400, "Image must be less than 5MB");
    }

    // Process image
    const processed = await processImage(file.buffer, {
      width: parseInt(req.query.width as string) || 1200,
      quality: parseInt(req.query.quality as string) || 80,
    });

    // Generate key
    const folder = (req.query.folder as string) || "uploads";
    const key = generateKey(folder, file.originalname);

    // Upload to R2
    const url = await uploadToR2(processed, key, "image/webp");

    sendSuccess(res, {
      url,
      key,
      width: parseInt(req.query.width as string) || 1200,
      size: processed.length,
    }, 201);
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Upload Document ──────────────────────────────────────

export async function uploadDocument(req: AuthRequest, res: Response) {
  try {
    const file = req.file;
    if (!file) {
      throw new ApiError(400, "No file provided");
    }

    if (!ALLOWED_TYPES.document.includes(file.mimetype)) {
      throw new ApiError(400, "Only PDF and Markdown files are allowed");
    }

    if (file.size > MAX_SIZES.document) {
      throw new ApiError(400, "Document must be less than 10MB");
    }

    const folder = (req.query.folder as string) || "documents";
    const key = generateKey(folder, file.originalname);

    const url = await uploadToR2(file.buffer, key, file.mimetype);

    sendSuccess(res, {
      url,
      key,
      size: file.size,
      type: file.mimetype,
    }, 201);
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Upload Multiple Images ───────────────────────────────

export async function uploadMultipleImages(req: AuthRequest, res: Response) {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      throw new ApiError(400, "No files provided");
    }

    const folder = (req.query.folder as string) || "uploads";
    const results = await Promise.all(
      files.map(async (file) => {
        const processed = await processImage(file.buffer, {
          width: parseInt(req.query.width as string) || 1200,
          quality: parseInt(req.query.quality as string) || 80,
        });
        const key = generateKey(folder, file.originalname);
        const url = await uploadToR2(processed, key, "image/webp");
        return { url, key, size: processed.length };
      })
    );

    sendSuccess(res, { files: results, count: results.length }, 201);
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Delete File ──────────────────────────────────────────

export async function deleteFile(req: AuthRequest, res: Response) {
  try {
    const { key } = req.body;
    if (!key) {
      throw new ApiError(400, "Key is required");
    }

    await deleteFromR2(key);
    sendSuccess(res, { message: "File deleted", key });
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Get Upload URL (Client-Side Upload) ──────────────────

export async function getUploadUrl(req: AuthRequest, res: Response) {
  try {
    const { filename, folder, contentType } = req.body;

    if (!filename || !contentType) {
      throw new ApiError(400, "Filename and contentType are required");
    }

    const key = generateKey(folder || "uploads", filename);
    const url = await import("../config/r2").then((m) =>
      m.getPresignedUploadUrl(key, contentType)
    );

    sendSuccess(res, {
      uploadUrl: url,
      key,
      publicUrl: `${config.r2.publicUrl}/${key}`,
    });
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── List Files from R2 ───────────────────────────────────

export async function listFiles(req: AuthRequest, res: Response) {
  try {
    const { prefix = "", limit = "100", cursor } = req.query;

    const command = new ListObjectsV2Command({
      Bucket: config.r2.bucketName,
      Prefix: prefix as string,
      MaxKeys: parseInt(limit as string),
      ContinuationToken: cursor as string | undefined,
    });

    const response = await r2Client.send(command);

    const files = (response.Contents || []).map((item: _Object) => {
      const key = item.Key || "";
      const parts = key.split("/");
      const filename = parts.pop() || key;
      const folder = parts.join("/");
      const ext = filename.split(".").pop()?.toLowerCase() || "";
      const isImage = ["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(ext);

      return {
        key,
        filename,
        folder,
        size: item.Size || 0,
        lastModified: item.LastModified?.toISOString() || null,
        url: `${config.r2.publicUrl}/${key}`,
        isImage,
        type: isImage ? "image" : ext === "pdf" ? "pdf" : ext === "md" ? "markdown" : "other",
      };
    });

    sendSuccess(res, {
      files,
      count: files.length,
      total: response.KeyCount || 0,
      hasMore: response.IsTruncated || false,
      cursor: response.NextContinuationToken || null,
    });
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Bulk Delete Files ────────────────────────────────────

export async function bulkDeleteFiles(req: AuthRequest, res: Response) {
  try {
    const { keys } = req.body;
    if (!keys || !Array.isArray(keys) || keys.length === 0) {
      throw new ApiError(400, "keys array is required");
    }

    const results = await Promise.allSettled(
      keys.map((key: string) => deleteFromR2(key))
    );

    const deleted = keys.filter((_: string, i: number) => results[i].status === "fulfilled");
    const failed = keys.filter((_: string, i: number) => results[i].status === "rejected");

    sendSuccess(res, { deleted, failed, deletedCount: deleted.length, failedCount: failed.length });
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Image Proxy (for CORS) ──────────────────────────────

function extractR2Key(url: string): string {
  let key: string;
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    key = parsed.pathname.replace(/^\/+/, "");
  } catch {
    key = url.replace(/^\/+/, "");
  }
  key = decodeURIComponent(key);
  key = key.replace(/\/+/g, "/").replace(/^\/+/, "");

  if (config.r2.publicUrl) {
    try {
      const publicUrlPath = new URL(config.r2.publicUrl).pathname.replace(/^\/+/, "").replace(/\/+$/, "");
      if (publicUrlPath && key.startsWith(publicUrlPath + "/")) {
        key = key.substring(publicUrlPath.length + 1);
      } else if (publicUrlPath && key === publicUrlPath) {
        key = "";
      }
    } catch {}
  }

  return key;
}

// ─── R2 Debug (check key mismatch) ─────────────────────

export async function debugR2Key(req: AuthRequest, res: Response) {
  const { url } = req.query;
  if (!url || typeof url !== "string") {
    return sendError(res, new ApiError(400, "url query parameter is required"));
  }

  const extractedKey = extractR2Key(url);

  let sampleKeys: string[] = [];
  try {
    const command = new ListObjectsV2Command({
      Bucket: config.r2.bucketName,
      MaxKeys: 20,
    });
    const response = await r2Client.send(command);
    sampleKeys = (response.Contents || []).map((item) => item.Key || "");
  } catch {}

  let keyExists = false;
  try {
    const head = new HeadObjectCommand({ Bucket: config.r2.bucketName, Key: extractedKey });
    await r2Client.send(head);
    keyExists = true;
  } catch {}

  sendSuccess(res, {
    inputUrl: url,
    extractedKey,
    keyExists,
    bucket: config.r2.bucketName,
    publicUrl: config.r2.publicUrl,
    sampleKeys,
  });
}

export async function proxyImage(req: AuthRequest, res: Response) {
  const { url } = req.query;
  if (!url || typeof url !== "string") {
    return sendError(res, new ApiError(400, "url query parameter is required"));
  }

  const key = extractR2Key(url);

  console.log("Proxy image:", { url, key, bucket: config.r2.bucketName });

  try {
    const command = new GetObjectCommand({
      Bucket: config.r2.bucketName,
      Key: key,
    });

    const response = await r2Client.send(command);

    if (!response.Body) {
      return sendError(res, new ApiError(404, "Image not found"));
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Cache-Control", "public, max-age=86400");

    if (response.ContentType) {
      res.setHeader("Content-Type", response.ContentType);
    }

    const stream = response.Body as any;
    stream.pipe(res);
  } catch (error: any) {
    const statusCode = error?.$metadata?.httpStatusCode;

    if (statusCode === 404 || error.Code === "NoSuchKey" || error.name === "NoSuchKey") {
      console.warn("Proxy 404 — key not in R2, redirecting to original URL:", { key, url });
      return res.redirect(302, url);
    }

    console.error("Proxy image error:", {
      message: error.message,
      code: error.Code || error.name,
      statusCode,
      key,
      url,
    });
    sendError(res, error as Error);
  }
}

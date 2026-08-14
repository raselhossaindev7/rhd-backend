import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "5000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  isDev: process.env.NODE_ENV !== "production",

  // ─── JWT ───────────────────────────────────────────────
  jwtSecret: process.env.JWT_SECRET || "fallback-secret-change-this",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",

  // ─── CORS ──────────────────────────────────────────────
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:3000")
    .split(",")
    .map((s) => s.trim()),

  // ─── Rate Limiting ─────────────────────────────────────
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || "300", 10),

  // ─── Cloudflare R2 ─────────────────────────────────────
  r2: {
    accountId: process.env.R2_ACCOUNT_ID || "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    bucketName: process.env.R2_BUCKET_NAME || "",
    bucketUrl: process.env.R2_BUCKET_URL || "",
    publicUrl: process.env.R2_PUBLIC_URL || "",
  },

  // ─── Nodemailer ────────────────────────────────────────
  email: {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.EMAIL_FROM || "Rasel Hossain <raselhossaindev7@gmail.com>",
  },

  // ─── AI / Ollama ────────────────────────────────────────
  ollamaApiKey: process.env.OLLAMA_API_KEY || "",
};

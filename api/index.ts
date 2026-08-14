import { VercelRequest, VercelResponse } from "@vercel/node";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import path from "path";
import { config } from "../src/config/env";
import routes from "../src/routes";
import { errorHandler, notFoundHandler } from "../src/middleware/errorHandler";

const app = express();

// Trust the first proxy (Vercel) so express-rate-limit can
// correctly read X-Forwarded-For.
app.set("trust proxy", 1);

// ─── Security ─────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const normalize = (url: string) =>
        url.replace(/\/$/, "").replace(/^https?:\/\/(www\.)?/i, "https://");

      const normalizedOrigin = normalize(origin);
      const allowed = config.corsOrigins.some(
        (o) => o === "*" || normalize(o) === normalizedOrigin
      );

      if (allowed) return callback(null, true);

      return callback(new Error(`CORS policy: ${origin} not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// ─── Body Parsing ─────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Compression ──────────────────────────────────────────
app.use(compression());

// ─── Health Check ─────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

// ─── API Routes ───────────────────────────────────────────
app.use("/api", routes);

// ─── Root ─────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "RHD Backend API",
    docs: "/health",
    api: "/api",
  });
});

// ─── Error Handling ───────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default function handler(req: VercelRequest, res: VercelResponse) {
  app(req, res);
}

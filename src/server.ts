import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "path";
import { config } from "./config/env";
import prisma from "./config/db";
import routes from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

const app = express();

// Trust the first proxy (Render/Vercel load balancer) so
// express-rate-limit can correctly read X-Forwarded-For.
app.set("trust proxy", 1);

// ─── Security ─────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
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

// ─── Rate Limiting ────────────────────────────────────────
const isLocalhost = (ip: string | undefined) =>
  !ip || ip === "::1" || ip === "127.0.0.1" || ip.startsWith("::ffff:127.") || ip.startsWith("::ffff:192.168.");

const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  message: { success: false, message: "Too many requests, try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => config.isDev && isLocalhost(req.ip),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts
  message: { success: false, message: "Too many auth attempts, try again in 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/", limiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);

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

// ─── Public landing page ──────────────────────────────────
app.use(express.static(path.join(__dirname, "../public")));
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// ─── Error Handling ───────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────
const server = app.listen(config.port, () => {
  console.log(`
  ┌─────────────────────────────────────────┐
  │                                         │
  │   🚀 RHD Backend Server                │
  │                                         │
  │   Port:       ${config.port}                      │
  │   Environment: ${config.nodeEnv.padEnd(24)}│
  │   CORS:       ${config.corsOrigins[0].padEnd(24)}│
  │                                         │
  │   API:        http://localhost:${config.port}/api │
  │   Health:     http://localhost:${config.port}/health│
  │                                         │
  └─────────────────────────────────────────┘
  `);
});

// ─── Graceful Shutdown ────────────────────────────────────
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received. Closing DB connections...`);
  server.close(() => {
    prisma.$disconnect().then(() => {
      console.log("DB disconnected. Exiting.");
      process.exit(0);
    });
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export default app;

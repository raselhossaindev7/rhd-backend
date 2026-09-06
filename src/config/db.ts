import { PrismaClient } from "@prisma/client";

// ─── Error classification ───────────────────────────────
// Two DISTINCT failure modes need OPPOSITE retry behavior:
//
// 1. Dead connection (10054 / "server closed the connection"): a stale
//    pooled connection. Retry FAST — a fresh connection fixes it.
// 2. Pool exhaustion ("Timed out fetching a new connection from the
//    connection pool"): too many concurrent checkouts. Retrying fast
//    makes it WORSE (retry storm). Fail FAST so the caller returns 503
//    immediately instead of hanging and holding a slot while sleeping.
// The old code retried pool exhaustion 3x with 2s/4s sleeps → every
// overloaded request held its slot ~90s+ and tripled pool pressure,
// which cascaded into P1001 "can't reach database server" for everyone.
export function isPoolTimeoutError(error: any): boolean {
  const msg = String(error?.message || "");
  return /timed out fetching a new connection from the connection pool/i.test(msg);
}

export function isConnectionError(error: any): boolean {
  return (
    error?.code === "P1001" || // unreachable
    error?.code === "P1008" || // timed out
    error?.code === "P1017" || // server closed connection
    error?.kind === "Io" ||
    (typeof error?.message === "string" &&
      (/connection/i.test(error.message) ||
        /forcibly closed/i.test(error.message) ||
        /ECONNRESET/i.test(error.message) ||
        /timed out/i.test(error.message)))
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Small jitter so N concurrent failed requests don't all retry
// on the exact same millisecond (thundering herd on the pooler).
function withJitter(ms: number): number {
  return ms + Math.floor(Math.random() * 250);
}

function createClient() {
  return new PrismaClient({
    log: ["error", "warn"],
    datasourceUrl: process.env.DATABASE_URL,
  }).$extends({
    query: {
      // Global retry with pool-aware backoff (see classification above).
      // NOTE: read paths in this codebase intentionally avoid
      // prisma.$transaction([...]) batches. On Supabase's transaction-mode
      // pooler (6543) a batch pins one server connection for the whole
      // batch; the dashboard/analytics batches (12-17 queries incl. raw
      // SQL) pinned it for seconds and, with ~10 concurrent admin
      // requests on a connection_limit=10 pool, starved every other
      // endpoint. Sequential awaits check a connection out briefly and
      // release it between queries — same max-1-concurrency, no pinning,
      // no interactive-transaction fragility ("server closed the
      // connection" / 10054 resets).
      async $allOperations({ args, query }) {
        for (let attempt = 1; ; attempt++) {
          try {
            return await query(args);
          } catch (error: any) {
            if (isPoolTimeoutError(error)) {
              // Overloaded pool: DO NOT sleep-retry while holding pool
              // pressure. One quick retry (a slot may just have freed),
              // then fail fast so the caller returns 503 immediately.
              if (attempt >= 2) throw error;
              console.log(`[DB] Pool exhausted, one quick retry (attempt ${attempt}/2)`);
              await sleep(withJitter(500));
            } else if (isConnectionError(error)) {
              // Dead pooled connection: retry fast on a fresh connection.
              if (attempt >= 3) throw error;
              console.log(`[DB] Connection drop, retrying (attempt ${attempt}/3)`);
              await sleep(withJitter(500 * attempt));
            } else {
              throw error;
            }
          }
        }
      },
    },
  });
}

export type ExtendedPrisma = ReturnType<typeof createClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrisma | undefined;
};

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

process.on("beforeExit", async () => {
  await prisma.$disconnect();
});

// ─── Helpers ────────────────────────────────────────────────
// Show only host from DATABASE_URL, hide password
// (so full secret is not leaked in console)
function getMaskedDbHost(): string {
  const url = process.env.DATABASE_URL || "";
  if (!url) return "NOT SET";
  try {
    // postgresql://user:password@host:5432/dbname -> host:5432/dbname
    const withoutProtocol = url.split("://")[1] || url;
    const atIndex = withoutProtocol.lastIndexOf("@");
    return atIndex !== -1 ? withoutProtocol.slice(atIndex + 1) : withoutProtocol;
  } catch {
    return "unknown";
  }
}

// ─── Connect with console logs ──────────────────────────────
// Call on server start to show in console whether
// DB is connected. Returns true on success, false on failure.
export async function connectDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    console.error("[DB] ERROR: DATABASE_URL is missing in .env file!");
    return false;
  }

  console.log(`[DB] Connecting to PostgreSQL (${getMaskedDbHost()})...`);
  const start = Date.now();

  try {
    await prisma.$connect();
    // Verify with a real query — $connect alone is not enough
    await prisma.$queryRaw`SELECT 1`;
    console.log(`[DB] Database connected successfully (${Date.now() - start}ms)`);
    return true;
  } catch (error: any) {
    console.error("[DB] ERROR: Database connection failed!");
    console.error(`[DB] Host: ${getMaskedDbHost()}`);
    console.error(`[DB] Error: ${error?.message || error}`);
    if (error?.code) console.error(`[DB] Prisma code: ${error.code}`);

    // Common hints
    if (error?.code === "P1000") {
      console.error("[DB] Hint: Invalid username/password — check DATABASE_URL in .env");
    } else if (error?.code === "P1001") {
      console.error("[DB] Hint: Database server unreachable — check if Postgres is running and host/port is correct");
    } else if (error?.code === "P1003") {
      console.error("[DB] Hint: Database does not exist — run `npx prisma db push`");
    }
    return false;
  }
}

// Helper: safe query with retry on connection errors
// (Kept for multi-step operations that want explicit retries on top
// of the global extension, e.g. idempotent schedule persistence.)
// Pool-exhaustion is NOT retried here — the caller already waited pool_timeout
// seconds; sleeping more just extends the outage. Fail fast instead.
export async function safeQuery<T>(
  fn: () => Promise<T>,
  retries = 3
): Promise<T> {
  for (let i = 1; i <= retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      if (i >= retries) throw error;
      if (isPoolTimeoutError(error)) {
        throw error;
      }
      if (isConnectionError(error)) {
        console.log(`[DB] Retry ${i}/${retries} after connection error`);
        await sleep(withJitter(1000 * i));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}

export default prisma;

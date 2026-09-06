import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
    datasourceUrl: process.env.DATABASE_URL,
  });

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
export async function safeQuery<T>(
  fn: () => Promise<T>,
  retries = 3
): Promise<T> {
  for (let i = 1; i <= retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const isConnectionError =
        error?.code === "P1001" ||
        error?.code === "P1008" ||
        error?.kind === "Io" ||
        error?.message?.includes("Connection") ||
        error?.message?.includes("ECONNRESET") ||
        error?.message?.includes("forcibly closed");

      if (isConnectionError && i < retries) {
        console.log(`[DB] Retry ${i}/${retries} after connection error`);
        await new Promise((r) => setTimeout(r, 1000 * i));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}

export default prisma;

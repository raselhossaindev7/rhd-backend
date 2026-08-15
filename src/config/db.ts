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

import { Response } from "express";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public errors?: Record<string, string>[]
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function sendSuccess<T>(res: Response, data: T, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

export function sendError(res: Response, error: ApiError | Error) {
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      errors: error.errors,
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── Safe pagination ───────────────────────────────────────
// Single source of truth so `?page=abc` / `?limit=999999` can never
// produce skip/take NaN (Prisma 500) or dump a whole table.
export function parsePagination(
  query: { page?: unknown; limit?: unknown },
  defaultLimit = 20,
  maxLimit = 50
): { page: number; limit: number; skip: number } {
  const page = Math.max(parseInt(String(query.page ?? "1"), 10) || 1, 1);
  const limit = Math.min(
    Math.max(parseInt(String(query.limit ?? String(defaultLimit)), 10) || defaultLimit, 1),
    maxLimit
  );
  return { page, limit, skip: (page - 1) * limit };
}

import { Request, Response, NextFunction } from "express";
import { ApiError, sendError } from "../utils/helpers";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error("Error:", err);

  if (err instanceof ApiError) {
    return sendError(res, err);
  }

  // Prisma known errors
  if (err.name === "PrismaClientKnownRequestError") {
    const prismaErr = err as any;
    if (prismaErr.code === "P2025") {
      return sendError(res, new ApiError(404, "Record not found"));
    }
    if (prismaErr.code === "P2002") {
      return sendError(res, new ApiError(409, "Record already exists"));
    }
  }

  return sendError(res, new ApiError(500, "Internal server error"));
}

export function notFoundHandler(req: Request, res: Response) {
  sendError(res, new ApiError(404, `Route ${req.originalUrl} not found`));
}

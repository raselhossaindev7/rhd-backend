import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { sendError } from "../utils/helpers";
import { ApiError } from "../utils/helpers";

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error: any) {
      const formattedErrors = error.errors?.map((err: any) => ({
        field: err.path.join("."),
        message: err.message,
      }));
      sendError(_res, new ApiError(400, "Validation failed", formattedErrors));
    }
  };
}

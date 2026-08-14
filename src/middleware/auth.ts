import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/env";
import { AuthRequest, JwtPayload } from "../types";
import { ApiError, sendError } from "../utils/helpers";

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.token || req.headers.authorization?.split(" ")[1];

    if (!token) {
      throw new ApiError(401, "Authentication required");
    }

    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (error) {
    sendError(res, new ApiError(401, "Invalid or expired token"));
  }
}

export function authorize(roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(res, new ApiError(401, "Authentication required"));
    }

    if (!roles.includes(req.user.role)) {
      return sendError(res, new ApiError(403, "Insufficient permissions"));
    }

    next();
  };
}

export function generateToken(payload: { id: string; email: string; role: string }) {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: "7d", // 7 days
  });
}

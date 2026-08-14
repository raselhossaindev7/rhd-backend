import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../config/db";
import { ApiError, sendSuccess, sendError } from "../utils/helpers";
import { generateToken } from "../middleware/auth";

export async function register(req: Request, res: Response) {
  try {
    const { email, name, password } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ApiError(409, "Email already registered");
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { email, name, password: hashedPassword },
      select: { id: true, email: true, name: true, role: true },
    });

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    sendSuccess(res, { user, token }, 201);
  } catch (error) {
    sendError(res, error as Error);
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new ApiError(401, "Invalid credentials");
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new ApiError(401, "Invalid credentials");
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      token,
    });
  } catch (error) {
    sendError(res, error as Error);
  }
}

export async function logout(_req: Request, res: Response) {
  res.clearCookie("token");
  sendSuccess(res, { message: "Logged out successfully" });
}

export async function getMe(req: Request, res: Response) {
  try {
    const authReq = req as any;
    const user = await prisma.user.findUnique({
      where: { id: authReq.user.id },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    sendSuccess(res, user);
  } catch (error) {
    sendError(res, error as Error);
  }
}

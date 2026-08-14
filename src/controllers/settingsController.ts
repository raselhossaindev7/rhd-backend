import { Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../config/db";
import { sendSuccess, sendError, ApiError } from "../utils/helpers";
import { AuthRequest } from "../types";
import { config } from "../config/env";
import { r2Client } from "../config/r2";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";

// ─── Get Profile ──────────────────────────────────────────

export async function getProfile(req: AuthRequest, res: Response) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) throw new ApiError(404, "User not found");
    sendSuccess(res, user);
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Update Profile ───────────────────────────────────────

export async function updateProfile(req: AuthRequest, res: Response) {
  try {
    const { name, email, avatar } = req.body;

    // Check if email is taken by another user
    if (email) {
      const existing = await prisma.user.findFirst({
        where: { email, NOT: { id: req.user!.id } },
      });
      if (existing) throw new ApiError(409, "Email already in use");
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(name && { name }),
        ...(email && { email }),
        ...(avatar !== undefined && { avatar }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    sendSuccess(res, user);
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Change Password ──────────────────────────────────────

export async function changePassword(req: AuthRequest, res: Response) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new ApiError(400, "Current and new password are required");
    }

    if (newPassword.length < 6) {
      throw new ApiError(400, "New password must be at least 6 characters");
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new ApiError(404, "User not found");

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new ApiError(401, "Current password is incorrect");

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { password: hashed },
    });

    sendSuccess(res, { message: "Password changed successfully" });
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── System Info ──────────────────────────────────────────

export async function getSystemInfo(_req: AuthRequest, res: Response) {
  try {
    const [
      projectCount,
      postCount,
      serviceCount,
      contactCount,
      subscriberCount,
      messageCount,
      userCount,
    ] = await Promise.all([
      prisma.project.count(),
      prisma.post.count(),
      prisma.service.count(),
      prisma.contact.count(),
      prisma.subscriber.count(),
      prisma.message.count(),
      prisma.user.count(),
    ]);

    // R2 storage check
    let r2Status = "disconnected";
    let r2Files = 0;
    let r2Size = 0;
    try {
      const command = new ListObjectsV2Command({
        Bucket: config.r2.bucketName,
        MaxKeys: 1000,
      });
      const response = await r2Client.send(command);
      r2Status = "connected";
      r2Files = response.KeyCount || 0;
      r2Size = (response.Contents || []).reduce((acc, obj) => acc + (obj.Size || 0), 0);
    } catch {
      r2Status = "error";
    }

    // Ollama API check
    let ollamaStatus = "disconnected";
    try {
      const res = await fetch("https://ollama.com/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.ollamaApiKey}`,
        },
        body: JSON.stringify({
          model: "minimax-m3:cloud",
          messages: [{ role: "user", content: "hi" }],
          stream: false,
        }),
        signal: AbortSignal.timeout(5000),
      });
      ollamaStatus = res.ok ? "connected" : "error";
    } catch {
      ollamaStatus = "error";
    }

    sendSuccess(res, {
      database: {
        projects: projectCount,
        posts: postCount,
        services: serviceCount,
        contacts: contactCount,
        subscribers: subscriberCount,
        messages: messageCount,
        users: userCount,
      },
      storage: {
        r2: r2Status,
        r2Files,
        r2Size,
        bucket: config.r2.bucketName,
        publicUrl: config.r2.publicUrl,
      },
      ai: {
        ollama: ollamaStatus,
        model: "minimax-m3:cloud",
      },
      server: {
        nodeEnv: config.nodeEnv,
        port: config.port,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      },
    });
  } catch (error) {
    sendError(res, error as Error);
  }
}

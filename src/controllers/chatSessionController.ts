import { Request, Response } from "express";
import { prisma } from "../config/db";
import { sendSuccess, sendError, ApiError } from "../utils/helpers";
import { AuthRequest } from "../types";

// ─── Create Chat Session (Public) ───────────────────────

export async function createChatSession(req: Request, res: Response) {
  try {
    const { name, email, phone, message, messages, ip, userAgent, country, city } = req.body;

    if (!name || !email) {
      throw new ApiError(400, "Name and email are required");
    }

    const session = await prisma.chatSession.create({
      data: {
        name,
        email,
        phone: phone || null,
        message: message || null,
        messages: messages || [],
        ip: ip || null,
        userAgent: userAgent || null,
        country: country || null,
        city: city || null,
      },
    });

    sendSuccess(res, session, 201);
  } catch (error) {
    console.error("Create chat session error:", error);
    sendError(res, error as Error);
  }
}

// ─── Update Chat Session Messages (Public) ──────────────

export async function updateChatSession(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      throw new ApiError(400, "Messages array is required");
    }

    const session = await prisma.chatSession.update({
      where: { id },
      data: { messages },
    });

    sendSuccess(res, session);
  } catch (error) {
    console.error("Update chat session error:", error);
    sendError(res, error as Error);
  }
}

// ─── Get All Chat Sessions (Admin) ──────────────────────

export async function getChatSessions(req: AuthRequest, res: Response) {
  try {
    const { status, search, page = "1", limit = "20" } = req.query;

    const where: any = {};
    if (status && status !== "all") {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: "insensitive" } },
        { email: { contains: search as string, mode: "insensitive" } },
      ];
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [sessions, total] = await Promise.all([
      prisma.chatSession.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limitNum,
      }),
      prisma.chatSession.count({ where }),
    ]);

    sendSuccess(res, {
      sessions,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error("Get chat sessions error:", error);
    sendError(res, error as Error);
  }
}

// ─── Get Single Chat Session (Admin) ────────────────────

export async function getChatSession(req: AuthRequest, res: Response) {
  try {
    const id = req.params.id as string;

    const session = await prisma.chatSession.findUnique({
      where: { id },
    });

    if (!session) {
      throw new ApiError(404, "Chat session not found");
    }

    sendSuccess(res, session);
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Update Session Status (Admin) ──────────────────────

export async function updateSessionStatus(req: AuthRequest, res: Response) {
  try {
    const id = req.params.id as string;
    const { status } = req.body;

    if (!status || !["new", "contacted", "closed"].includes(status)) {
      throw new ApiError(400, "Valid status is required (new, contacted, closed)");
    }

    const session = await prisma.chatSession.update({
      where: { id },
      data: { status },
    });

    sendSuccess(res, session);
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Delete Chat Session (Admin) ────────────────────────

export async function deleteChatSession(req: AuthRequest, res: Response) {
  try {
    const id = req.params.id as string;

    await prisma.chatSession.delete({
      where: { id },
    });

    sendSuccess(res, { message: "Session deleted" });
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Get Chat Stats (Admin) ─────────────────────────────

export async function getChatStats(req: AuthRequest, res: Response) {
  try {
    const [total, newCount, contacted, closed] = await Promise.all([
      prisma.chatSession.count(),
      prisma.chatSession.count({ where: { status: "new" } }),
      prisma.chatSession.count({ where: { status: "contacted" } }),
      prisma.chatSession.count({ where: { status: "closed" } }),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = await prisma.chatSession.count({
      where: { createdAt: { gte: today } },
    });

    sendSuccess(res, {
      total,
      new: newCount,
      contacted,
      closed,
      today: todayCount,
    });
  } catch (error) {
    sendError(res, error as Error);
  }
}

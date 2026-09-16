import { Request, Response } from "express";
import prisma from "../config/db";
import { ApiError, sendSuccess, sendError, parsePagination } from "../utils/helpers";

export async function subscribe(req: Request, res: Response) {
  try {
    const { email } = req.body;

    const existing = await prisma.subscriber.findUnique({ where: { email } });
    if (existing) {
      if (existing.active) {
        throw new ApiError(409, "Already subscribed");
      }
      // Reactivate
      await prisma.subscriber.update({
        where: { email },
        data: { active: true },
      });
      sendSuccess(res, { message: "Re-subscribed successfully" });
      return;
    }

    await prisma.subscriber.create({ data: { email } });
    sendSuccess(res, { message: "Subscribed successfully" }, 201);
  } catch (error) {
    sendError(res, error as Error);
  }
}

export async function unsubscribe(req: Request, res: Response) {
  try {
    const { email } = req.body;

    const subscriber = await prisma.subscriber.findUnique({ where: { email } });
    if (!subscriber) {
      throw new ApiError(404, "Subscriber not found");
    }

    await prisma.subscriber.update({
      where: { email },
      data: { active: false },
    });

    sendSuccess(res, { message: "Unsubscribed successfully" });
  } catch (error) {
    sendError(res, error as Error);
  }
}

export async function getSubscribers(req: Request, res: Response) {
  try {
    // Paginated (previously dumped the whole table in one response)
    const { page, limit, skip } = parsePagination(req.query, 100, 500);
    const where = { active: true };
    const subscribers = await prisma.subscriber.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });
    const total = await prisma.subscriber.count({ where });

    sendSuccess(res, { subscribers, total, pagination: { total, page, pages: Math.ceil(total / limit) } });
  } catch (error) {
    sendError(res, error as Error);
  }
}

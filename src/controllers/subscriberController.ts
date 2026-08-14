import { Request, Response } from "express";
import prisma from "../config/db";
import { ApiError, sendSuccess, sendError } from "../utils/helpers";

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
    const subscribers = await prisma.subscriber.findMany({
      where: { active: true },
      orderBy: { createdAt: "desc" },
    });

    sendSuccess(res, { subscribers, total: subscribers.length });
  } catch (error) {
    sendError(res, error as Error);
  }
}

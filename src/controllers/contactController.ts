import { Request, Response } from "express";
import prisma from "../config/db";
import { ApiError, sendSuccess, sendError } from "../utils/helpers";
import { sendContactEmail } from "./emailController";

export async function submitContact(req: Request, res: Response) {
  try {
    const { name, email, type, message } = req.body;

    const contact = await prisma.contact.create({
      data: { name, email, type, message },
    });

    // Send email notifications
    await sendContactEmail({ name, email, type, message });

    sendSuccess(res, { message: "Message sent successfully", id: contact.id }, 201);
  } catch (error) {
    sendError(res, error as Error);
  }
}

export async function getContacts(req: Request, res: Response) {
  try {
    const status = req.query.status as string | undefined;
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = parseInt((req.query.limit as string) || "20", 10);
    const skip = (page - 1) * limit;

    const where = status ? { status: status as any } : {};

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.contact.count({ where }),
    ]);

    sendSuccess(res, {
      contacts,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    sendError(res, error as Error);
  }
}

export async function getContact(req: Request, res: Response) {
  try {
    const id = req.params.id as string;

    const contact = await prisma.contact.findUnique({ where: { id } });
    if (!contact) {
      throw new ApiError(404, "Contact not found");
    }

    sendSuccess(res, contact);
  } catch (error) {
    sendError(res, error as Error);
  }
}

export async function updateContactStatus(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const { status } = req.body;

    const contact = await prisma.contact.update({
      where: { id },
      data: { status },
    });

    sendSuccess(res, contact);
  } catch (error) {
    sendError(res, error as Error);
  }
}

export async function deleteContact(req: Request, res: Response) {
  try {
    const id = req.params.id as string;

    await prisma.contact.delete({ where: { id } });

    sendSuccess(res, { message: "Contact deleted" });
  } catch (error) {
    sendError(res, error as Error);
  }
}

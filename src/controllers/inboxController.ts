import { Request, Response } from "express";
import {
  getEmailLogs,
  getEmailLogById,
  getEmailStats,
  markAsRead,
  moveToTrash,
  moveToArchive,
  deleteEmailLog,
} from "../services/emailLogService";
import { sendSuccess, sendError, ApiError } from "../utils/helpers";

// ─── Get Emails (with folder/filter support) ──────────────

export async function getEmails(req: Request, res: Response) {
  try {
    const {
      folder,
      type,
      status,
      search,
      page,
      limit,
    } = req.query as {
      folder?: "inbox" | "sent" | "trash" | "archive";
      type?: string;
      status?: string;
      search?: string;
      page?: string;
      limit?: string;
    };

    const result = await getEmailLogs({
      folder,
      type: type as any,
      status: status as any,
      search,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });

    sendSuccess(res, result);
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Get Single Email ─────────────────────────────────────

export async function getEmail(req: Request, res: Response) {
  try {
    const id = req.params.id as string;

    const email = await getEmailLogById(id);
    if (!email) {
      throw new ApiError(404, "Email not found");
    }

    // Auto-mark as read if inbound
    if (email.type === "INBOUND" && email.status === "SENT") {
      await markAsRead(id);
    }

    sendSuccess(res, email);
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Get Email Stats ──────────────────────────────────────

export async function getMailboxStats(req: Request, res: Response) {
  try {
    const stats = await getEmailStats();
    sendSuccess(res, stats);
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Mark as Read ─────────────────────────────────────────

export async function markEmailAsRead(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    await markAsRead(id);
    sendSuccess(res, { message: "Marked as read" });
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Move to Trash ────────────────────────────────────────

export async function trashEmail(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    await moveToTrash(id);
    sendSuccess(res, { message: "Moved to trash" });
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Move to Archive ──────────────────────────────────────

export async function archiveEmail(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    await moveToArchive(id);
    sendSuccess(res, { message: "Archived" });
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Delete Permanently ───────────────────────────────────

export async function permanentlyDeleteEmail(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    await deleteEmailLog(id);
    sendSuccess(res, { message: "Email deleted permanently" });
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Bulk Actions ─────────────────────────────────────────

export async function bulkAction(req: Request, res: Response) {
  try {
    const { ids, action } = req.body as {
      ids: string[];
      action: "read" | "trash" | "archive" | "delete";
    };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new ApiError(400, "Email IDs are required");
    }

    for (const id of ids) {
      switch (action) {
        case "read":
          await markAsRead(id);
          break;
        case "trash":
          await moveToTrash(id);
          break;
        case "archive":
          await moveToArchive(id);
          break;
        case "delete":
          await deleteEmailLog(id);
          break;
      }
    }

    sendSuccess(res, { message: `${ids.length} emails ${action}d` });
  } catch (error) {
    sendError(res, error as Error);
  }
}

import prisma from "../config/db";

type EmailType = "INBOUND" | "OUTBOUND" | "SYSTEM" | "BULK";
type EmailStatus = "PENDING" | "SENT" | "FAILED" | "READ" | "ARCHIVED" | "TRASH";

interface LogEmailParams {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  type: EmailType;
  status?: EmailStatus;
  templateId?: string;
  metadata?: Record<string, any>;
  error?: string;
}

export async function logEmail(params: LogEmailParams): Promise<string> {
  try {
    const log = await prisma.emailLog.create({
      data: {
        from: params.from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
        type: params.type,
        status: params.status || "SENT",
        templateId: params.templateId,
        metadata: params.metadata || {},
        error: params.error,
      },
    });
    return log.id;
  } catch (error) {
    console.error("[EMAIL LOG] Failed to log email:", error);
    return "";
  }
}

export async function updateEmailStatus(
  id: string,
  status: EmailStatus,
  error?: string
): Promise<void> {
  try {
    await prisma.emailLog.update({
      where: { id },
      data: {
        status,
        ...(error && { error }),
      },
    });
  } catch (err) {
    console.error("[EMAIL LOG] Failed to update status:", err);
  }
}

export async function markAsRead(id: string): Promise<void> {
  try {
    await prisma.emailLog.update({
      where: { id },
      data: {
        status: "READ",
        readAt: new Date(),
      },
    });
  } catch (err) {
    console.error("[EMAIL LOG] Failed to mark as read:", err);
  }
}

export async function moveToTrash(id: string): Promise<void> {
  try {
    await prisma.emailLog.update({
      where: { id },
      data: { status: "TRASH" },
    });
  } catch (err) {
    console.error("[EMAIL LOG] Failed to move to trash:", err);
  }
}

export async function moveToArchive(id: string): Promise<void> {
  try {
    await prisma.emailLog.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });
  } catch (err) {
    console.error("[EMAIL LOG] Failed to archive:", err);
  }
}

export async function deleteEmailLog(id: string): Promise<void> {
  try {
    await prisma.emailLog.delete({
      where: { id },
    });
  } catch (err) {
    console.error("[EMAIL LOG] Failed to delete:", err);
  }
}

export async function getEmailLogs(params: {
  type?: EmailType;
  status?: EmailStatus;
  folder?: "inbox" | "sent" | "trash" | "archive";
  search?: string;
  page?: number;
  limit?: number;
}) {
  const {
    type,
    status,
    folder,
    search,
    page = 1,
    limit = 20,
  } = params;

  const skip = (page - 1) * limit;
  const where: any = {};

  // Folder filtering
  if (folder === "inbox") {
    where.type = "INBOUND";
    where.status = { notIn: ["TRASH", "ARCHIVED"] };
  } else if (folder === "sent") {
    where.type = { in: ["OUTBOUND", "SYSTEM", "BULK"] };
    where.status = { notIn: ["TRASH", "ARCHIVED"] };
  } else if (folder === "trash") {
    where.status = "TRASH";
  } else if (folder === "archive") {
    where.status = "ARCHIVED";
  } else {
    where.status = { notIn: ["TRASH"] };
  }

  // Type filter
  if (type) {
    where.type = type;
  }

  // Status filter
  if (status) {
    where.status = status;
  }

  // Search filter
  if (search) {
    where.OR = [
      { to: { contains: search, mode: "insensitive" } },
      { from: { contains: search, mode: "insensitive" } },
      { subject: { contains: search, mode: "insensitive" } },
    ];
  }

  const [logs, total] = await Promise.all([
    prisma.emailLog.findMany({
      where,
      orderBy: { sentAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        from: true,
        to: true,
        subject: true,
        type: true,
        status: true,
        templateId: true,
        sentAt: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.emailLog.count({ where }),
  ]);

  return {
    emails: logs,
    pagination: {
      total,
      page,
      pages: Math.ceil(total / limit),
    },
  };
}

export async function getEmailLogById(id: string) {
  return prisma.emailLog.findUnique({
    where: { id },
  });
}

export async function getEmailStats() {
  const [inbox, sent, unread, trash, archive, total] = await Promise.all([
    prisma.emailLog.count({
      where: { type: "INBOUND", status: { notIn: ["TRASH", "ARCHIVED"] } },
    }),
    prisma.emailLog.count({
      where: {
        type: { in: ["OUTBOUND", "SYSTEM", "BULK"] },
        status: { notIn: ["TRASH", "ARCHIVED"] },
      },
    }),
    prisma.emailLog.count({
      where: { type: "INBOUND", status: "SENT" },
    }),
    prisma.emailLog.count({ where: { status: "TRASH" } }),
    prisma.emailLog.count({ where: { status: "ARCHIVED" } }),
    prisma.emailLog.count(),
  ]);

  return { inbox, sent, unread, trash, archive, total };
}

// Log contact form submissions as inbound emails
export async function logContactFormEmail(data: {
  name: string;
  email: string;
  type: string;
  message: string;
}): Promise<string> {
  return logEmail({
    from: data.email,
    to: "raselhossaindev7@gmail.com",
    subject: `New Contact: ${data.name} — ${data.type}`,
    html: `
      <div style="font-family:Arial,sans-serif;padding:20px;">
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${data.name}</p>
        <p><strong>Email:</strong> ${data.email}</p>
        <p><strong>Type:</strong> ${data.type}</p>
        <p><strong>Message:</strong></p>
        <div style="background:#f5f5f5;padding:15px;border-radius:8px;">
          ${data.message}
        </div>
      </div>
    `,
    type: "INBOUND",
    status: "SENT",
    metadata: {
      name: data.name,
      contactType: data.type,
      source: "contact-form",
    },
  });
}

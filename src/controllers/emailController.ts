import { Request, Response } from "express";
import { sendEmail, contactFormEmail, contactAutoReply, subscriberWelcomeEmail } from "../config/email";
import prisma from "../config/db";
import { sendSuccess, sendError, ApiError } from "../utils/helpers";

// ─── Contact Form Email ───────────────────────────────────

export async function sendContactEmail(data: {
  name: string;
  email: string;
  type: string;
  message: string;
}): Promise<void> {
  // Send to admin
  await sendEmail(contactFormEmail(data));
  // Auto-reply to user
  await sendEmail(contactAutoReply({ name: data.name, email: data.email }));
}

// ─── Subscriber Welcome Email ─────────────────────────────

export async function sendWelcomeEmail(email: string): Promise<void> {
  await sendEmail(subscriberWelcomeEmail({ email }));
}

// ─── Send Custom Email (Admin) ────────────────────────────

export async function sendCustomEmail(req: Request, res: Response) {
  try {
    const { to, subject, html } = req.body;

    if (!to || !subject || !html) {
      throw new ApiError(400, "To, subject, and html are required");
    }

    const sent = await sendEmail({ to, subject, html });

    if (!sent) {
      throw new ApiError(500, "Failed to send email");
    }

    sendSuccess(res, { message: "Email sent successfully" });
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Send Bulk Email (Admin) ──────────────────────────────

export async function sendBulkEmail(req: Request, res: Response) {
  try {
    const { subject, html } = req.body;

    if (!subject || !html) {
      throw new ApiError(400, "Subject and html are required");
    }

    const subscribers = await prisma.subscriber.findMany({
      where: { active: true },
      select: { email: true },
    });

    let sent = 0;
    let failed = 0;

    for (const sub of subscribers) {
      try {
        await sendEmail({ to: sub.email, subject, html });
        sent++;
      } catch {
        failed++;
      }
    }

    sendSuccess(res, {
      message: `Bulk email sent`,
      total: subscribers.length,
      sent,
      failed,
    });
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Test Email (Admin) ───────────────────────────────────

export async function testEmail(req: Request, res: Response) {
  try {
    const { to } = req.body;

    if (!to) {
      throw new ApiError(400, "Email is required");
    }

    const sent = await sendEmail({
      to,
      subject: "Test Email — Rasel Hossain",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background: #1a1730; color: #f5f0eb; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: #252240; border-radius: 12px; padding: 30px; }
            h1 { color: #F0C38E; }
            .badge { background: #F0C38E; color: #1a1730; padding: 5px 15px; border-radius: 20px; display: inline-block; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Email Test Successful</h1>
            <p>Nodemailer is working correctly on raselhossain.dev backend.</p>
            <span class="badge">SMTP Config OK</span>
          </div>
        </body>
        </html>
      `,
    });

    if (!sent) {
      throw new ApiError(500, "Failed to send test email");
    }

    sendSuccess(res, { message: "Test email sent" });
  } catch (error) {
    sendError(res, error as Error);
  }
}

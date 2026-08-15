import { Request, Response } from "express";
import { sendEmail, contactFormEmail, contactAutoReply, subscriberWelcomeEmail } from "../config/email";
import { EMAIL_TEMPLATES, TemplateId } from "../config/emailTemplates";
import { generateEmailWithAI, generateSubjectLines } from "../services/aiEmailGenerator";
import { logEmail } from "../services/emailLogService";
import prisma from "../config/db";
import { sendSuccess, sendError, ApiError } from "../utils/helpers";

// ─── Contact Form Email ───────────────────────────────────

export async function sendContactEmail(data: {
  name: string;
  email: string;
  type: string;
  message: string;
}): Promise<void> {
  await sendEmail(contactFormEmail(data));
  await sendEmail(contactAutoReply({ name: data.name, email: data.email }));
}

// ─── Subscriber Welcome Email ─────────────────────────────

export async function sendWelcomeEmail(email: string): Promise<void> {
  await sendEmail(subscriberWelcomeEmail({ email }));
}

// ─── Get All Templates ────────────────────────────────────

export async function getTemplates(req: Request, res: Response) {
  try {
    const templates = Object.entries(EMAIL_TEMPLATES).map(([id, tpl]) => ({
      id,
      name: tpl.name,
      description: tpl.description,
      category: tpl.category,
      subject: tpl.subject,
      variables: tpl.variables,
    }));

    sendSuccess(res, { templates });
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Preview Template ─────────────────────────────────────

export async function previewTemplate(req: Request, res: Response) {
  try {
    const { templateId, variables } = req.body as {
      templateId: TemplateId;
      variables: Record<string, any>;
    };

    if (!templateId) {
      throw new ApiError(400, "Template ID is required");
    }

    const template = EMAIL_TEMPLATES[templateId];
    if (!template) {
      throw new ApiError(404, "Template not found");
    }

    // Generate preview with provided variables or defaults
    const defaultVars: Record<string, any> = {
      clientName: "John Smith",
      clientCompany: "Acme Inc",
      service: "build a modern web application",
      message: "",
      founderName: "Sarah",
      startupName: "TechStartup",
      pitch: "doing great work in the AI space.",
      name: "John",
      originalSubject: "our collaboration",
      daysSince: 3,
      projectName: "E-Commerce Platform",
      scope: "Full stack development with React and Node.js",
      timeline: "6-8 weeks",
      budget: "$5,000 - $8,000",
      nextSteps: [
        "Schedule kickoff call to discuss requirements",
        "Share brand guidelines and assets",
        "Review and approve project timeline",
        "Initial wireframes and design mockups",
      ],
      title: "Latest Updates from Rasel Hossain",
      content: "<p>Here's what's new this month...</p>",
      ctaText: "Read More",
      ctaUrl: "https://raselhossain.dev/blog",
    };

    const mergedVars = { ...defaultVars, ...variables };
    const html = template.generate(mergedVars as any);

    sendSuccess(res, {
      templateId,
      subject: template.subject,
      html,
      variables: mergedVars,
    });
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Send Template Email ──────────────────────────────────

export async function sendTemplateEmail(req: Request, res: Response) {
  try {
    const { to, templateId, variables, subject: customSubject } = req.body as {
      to: string;
      templateId: TemplateId;
      variables: Record<string, any>;
      subject?: string;
    };

    if (!to || !templateId) {
      throw new ApiError(400, "To and template ID are required");
    }

    const template = EMAIL_TEMPLATES[templateId];
    if (!template) {
      throw new ApiError(404, "Template not found");
    }

    const html = template.generate(variables || {} as any);

    // Replace variables in subject
    let subject = customSubject || template.subject;
    if (variables) {
      Object.entries(variables).forEach(([key, value]) => {
        if (typeof value === "string") {
          subject = subject.replace(new RegExp(`\\$\\{${key}\\}`, "g"), value);
        }
      });
    }

    const sent = await sendEmail({ to, subject, html });

    if (!sent) {
      throw new ApiError(500, "Failed to send email");
    }

    // Log to sent
    await logEmail({
      from: "raselhossaindev7@gmail.com",
      to,
      subject,
      html,
      type: "OUTBOUND",
      status: "SENT",
      templateId,
      metadata: { variables },
    });

    sendSuccess(res, { message: "Email sent successfully", subject });
  } catch (error) {
    sendError(res, error as Error);
  }
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

    // Log to sent
    await logEmail({
      from: "raselhossaindev7@gmail.com",
      to,
      subject,
      html,
      type: "OUTBOUND",
      status: "SENT",
    });

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

// ─── Send Bulk Template Email ─────────────────────────────

export async function sendBulkTemplateEmail(req: Request, res: Response) {
  try {
    const { templateId, variables, subject: customSubject } = req.body as {
      templateId: TemplateId;
      variables: Record<string, any>;
      subject?: string;
    };

    if (!templateId) {
      throw new ApiError(400, "Template ID is required");
    }

    const template = EMAIL_TEMPLATES[templateId];
    if (!template) {
      throw new ApiError(404, "Template not found");
    }

    const subscribers = await prisma.subscriber.findMany({
      where: { active: true },
      select: { email: true },
    });

    let subject = customSubject || template.subject;
    if (variables) {
      Object.entries(variables).forEach(([key, value]) => {
        if (typeof value === "string") {
          subject = subject.replace(new RegExp(`\\$\\{${key}\\}`, "g"), value);
        }
      });
    }

    let sent = 0;
    let failed = 0;

    for (const sub of subscribers) {
      try {
        const html = template.generate(variables || {} as any);
        await sendEmail({ to: sub.email, subject, html });
        sent++;
      } catch {
        failed++;
      }
    }

    sendSuccess(res, {
      message: `Bulk template email sent`,
      template: template.name,
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
            body { font-family: Arial, sans-serif; background: #F8F9FB; color: #1A1725; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; padding: 30px; border: 1px solid #E5E7EB; }
            h1 { color: #7B2CBF; font-size: 24px; }
            .badge { background: #F3F0FF; color: #7B2CBF; padding: 5px 15px; border-radius: 20px; display: inline-block; margin-top: 10px; font-size: 12px; font-weight: 600; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Email Test Successful</h1>
            <p style="color:#4B5563;">Nodemailer is working correctly on raselhossain.dev backend.</p>
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

// ─── AI Email Generation ──────────────────────────────────

export async function generateAIEmail(req: Request, res: Response) {
  try {
    const { type, recipientName, recipientCompany, recipientRole, purpose, customPrompt } = req.body as {
      type: "cold-outreach" | "follow-up" | "proposal" | "thank-you" | "custom";
      recipientName?: string;
      recipientCompany?: string;
      recipientRole?: string;
      purpose?: string;
      customPrompt?: string;
    };

    if (!type) {
      throw new ApiError(400, "Email type is required");
    }

    const result = await generateEmailWithAI({
      type,
      recipientName,
      recipientCompany,
      recipientRole,
      purpose,
      customPrompt,
    });

    sendSuccess(res, result);
  } catch (error) {
    sendError(res, error as Error);
  }
}

export async function generateAISubjectLines(req: Request, res: Response) {
  try {
    const { recipientName, recipientCompany, purpose } = req.body as {
      recipientName: string;
      recipientCompany: string;
      purpose: string;
    };

    if (!recipientName || !recipientCompany) {
      throw new ApiError(400, "Recipient name and company are required");
    }

    const subjects = await generateSubjectLines(
      recipientName,
      recipientCompany,
      purpose || "Business inquiry"
    );

    sendSuccess(res, { subjects });
  } catch (error) {
    sendError(res, error as Error);
  }
}

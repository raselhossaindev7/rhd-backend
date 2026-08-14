import nodemailer from "nodemailer";
import { config } from "./env";

const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: config.email.secure,
  auth: {
    user: config.email.user,
    pass: config.email.pass,
  },
});

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: config.email.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      replyTo: options.replyTo,
    });
    console.log(`📧 Email sent to ${options.to}`);
    return true;
  } catch (error) {
    console.error("❌ Email error:", error);
    return false;
  }
}

// ─── Email Templates ──────────────────────────────────────

export function contactFormEmail(data: {
  name: string;
  email: string;
  type: string;
  message: string;
}): EmailOptions {
  return {
    to: config.email.user,
    subject: `New Contact: ${data.name} — ${data.type}`,
    replyTo: data.email,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background: #1a1730; color: #f5f0eb; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #252240; border-radius: 12px; padding: 30px; }
          h1 { color: #F0C38E; font-size: 24px; margin-bottom: 20px; }
          .field { margin-bottom: 15px; }
          .label { color: #8a8290; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
          .value { color: #f5f0eb; font-size: 16px; margin-top: 5px; }
          .message { background: #1a1730; padding: 15px; border-radius: 8px; margin-top: 10px; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #48426D; color: #8a8290; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>New Contact Form Submission</h1>
          <div class="field">
            <div class="label">Name</div>
            <div class="value">${data.name}</div>
          </div>
          <div class="field">
            <div class="label">Email</div>
            <div class="value">${data.email}</div>
          </div>
          <div class="field">
            <div class="label">Project Type</div>
            <div class="value">${data.type}</div>
          </div>
          <div class="field">
            <div class="label">Message</div>
            <div class="message">${data.message}</div>
          </div>
          <div class="footer">
            Sent from raselhossain.dev contact form
          </div>
        </div>
      </body>
      </html>
    `,
  };
}

export function contactAutoReply(data: {
  name: string;
  email: string;
}): EmailOptions {
  return {
    to: data.email,
    subject: "Thanks for reaching out! — Rasel Hossain",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background: #1a1730; color: #f5f0eb; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #252240; border-radius: 12px; padding: 30px; }
          h1 { color: #F0C38E; font-size: 24px; }
          p { color: #ddd6cc; line-height: 1.6; }
          .highlight { color: #F1AA9B; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Hi ${data.name}!</h1>
          <p>Thank you for reaching out. I've received your message and will get back to you within <span class="highlight">24 hours</span>.</p>
          <p>In the meantime, feel free to check out my work at <a href="https://raselhossain.dev" style="color: #F0C38E;">raselhossain.dev</a></p>
          <p>Best regards,<br><strong>Rasel Hossain</strong><br>Full Stack Developer & AI Automation Engineer</p>
        </div>
      </body>
      </html>
    `,
  };
}

export function subscriberWelcomeEmail(data: {
  email: string;
}): EmailOptions {
  return {
    to: data.email,
    subject: "Welcome! — Rasel Hossain",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background: #1a1730; color: #f5f0eb; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #252240; border-radius: 12px; padding: 30px; }
          h1 { color: #F0C38E; font-size: 24px; }
          p { color: #ddd6cc; line-height: 1.6; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>You're subscribed!</h1>
          <p>Thanks for subscribing. You'll receive updates about new projects, blog posts, and services.</p>
          <p>Best,<br><strong>Rasel Hossain</strong></p>
        </div>
      </body>
      </html>
    `,
  };
}

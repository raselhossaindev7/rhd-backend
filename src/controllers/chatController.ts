import { Request, Response } from "express";
import { sendSuccess, sendError, ApiError } from "../utils/helpers";
import { aiChat } from "../services/aiProvider";

const SYSTEM_PROMPT = `You are Rasel Hossain's AI assistant on his portfolio website (raselhossain.dev). You are friendly, professional, and helpful.

About Rasel Hossain:
- Full Stack Developer, AI Automation Engineer & DevOps Specialist
- 6+ years of experience since 2020
- Top Rated Seller on Fiverr with 168+ completed projects
- Based in Bangladesh, works with international clients worldwide

Skills:
- Frontend: React.js, Next.js, TypeScript, Angular, Vue.js, Tailwind CSS
- Backend: Node.js, NestJS, Express.js, Laravel, PHP
- Database: PostgreSQL, MySQL, MongoDB, Supabase, Firebase
- Mobile: React Native, Expo
- DevOps: Docker, AWS, Nginx, PM2, Cloudflare, CI/CD
- AI: n8n automation, AI API integration, Python automation workers

Services:
- SaaS platforms, dashboards, admin panels, CRM/ERP systems
- E-commerce platforms
- Mobile apps (React Native, Expo)
- AI integration and workflow automation
- DevOps, Docker, VPS deployment, CI/CD

Notable Projects:
- BFS Mart — E-commerce platform (Next.js, Node.js, PostgreSQL, Stripe)
- Medexa One — Healthcare platform (Next.js, NestJS, PostgreSQL)
- Visa Master BD — Visa processing automation
- Wedding Collection — Photography marketplace (React Native)
- Villarreal CF — Professional web platform
- Custom LMS — School management system

Contact:
- Email: raselhossaindev7@gmail.com
- Phone / WhatsApp / Telegram: +8801757220402
- WhatsApp chat: https://wa.me/8801757220402
- Website: raselhossain.dev
- GitHub: github.com/raselhossaindev7
- LinkedIn: linkedin.com/in/rasel-hossen-32b51915b

Rules:
- Be concise and helpful (2-4 sentences max unless asked for detail)
- Only answer questions about Rasel, his skills, services, projects, or pricing
- If asked about something unrelated, politely redirect to Rasel's services
- For pricing, direct to the contact page for a custom quote
- Use natural, conversational English
- Never make up information not provided above`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 2000;
const MAX_TOTAL_CHARS = 12000;

export async function chat(req: Request, res: Response) {
  try {
    const { messages } = req.body as { messages: ChatMessage[] };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return sendError(res, new ApiError(400, "Messages array is required"));
    }

    // Cost-abuse guard: public endpoint, so cap count + size.
    // Only user turns accepted (blocks fake-history prompt injection).
    // Raw sizes are checked BEFORE slicing so oversize input is rejected
    // honestly instead of being silently truncated.
    const rawUser = messages
      .filter((m) => m && m.role === "user" && typeof m.content === "string")
      .slice(-MAX_MESSAGES);

    if (rawUser.length === 0) {
      return sendError(res, new ApiError(400, "At least one user message is required"));
    }

    const rawTotal = rawUser.reduce((n, m) => n + (m.content as string).length, 0);
    if (
      rawTotal > MAX_TOTAL_CHARS ||
      rawUser.some((m) => (m.content as string).length > MAX_MESSAGE_CHARS * 4)
    ) {
      return sendError(res, new ApiError(400, "Conversation too long, please start a new chat"));
    }

    const userMessages = rawUser.map((m) => ({
      role: "user" as const,
      content: (m.content as string).slice(0, MAX_MESSAGE_CHARS),
    }));

    const apiMessages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...userMessages,
    ];

    const reply = await aiChat(apiMessages);

    sendSuccess(res, { reply });
  } catch (error) {
    console.error("[CHAT ERROR]", error);
    sendError(res, error as Error);
  }
}

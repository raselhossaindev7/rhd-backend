import { Request, Response } from "express";
import { sendSuccess, sendError } from "../utils/helpers";

const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;
const OLLAMA_BASE_URL = "https://ollama.com";
const OLLAMA_MODEL = "minimax-m3:cloud";

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
- Phone: 01757220402
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

export async function chat(req: Request, res: Response) {
  try {
    const { messages } = req.body as { messages: ChatMessage[] };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return sendError(res, new Error("Messages array is required"));
    }

    if (!OLLAMA_API_KEY) {
      return sendError(res, new Error("AI service not configured"));
    }

    const apiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages.slice(-20),
    ];

    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OLLAMA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: apiMessages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[CHAT ERROR]", response.status, err);
      return sendError(res, new Error("AI service error"));
    }

    const data: any = await response.json();
    const reply = data.message?.content || "I'm not sure how to respond. Please try again.";

    sendSuccess(res, { reply });
  } catch (error) {
    console.error("[CHAT ERROR]", error);
    sendError(res, error as Error);
  }
}

import prisma from "../config/db";
import { config } from "../config/env";

const OLLAMA_API_KEY = config.ollamaApiKey;
const OLLAMA_BASE_URL = "https://ollama.com";
const OLLAMA_MODEL = "minimax-m3:cloud";

interface GeneratedTopic {
  title: string;
  category: string;
  keywords: string[];
  description: string;
}

const BLOG_CATEGORIES = [
  "Web Development",
  "AI & Automation",
  "DevOps",
  "Full Stack",
  "Mobile Apps",
  "E-commerce",
  "System Design",
  "Career",
  "Tutorial",
  "Case Study",
];

const SYSTEM_PROMPT = `You are an expert tech blog topic generator for Rasel Hossain's portfolio blog (raselhossain.dev).

About Rasel:
- Full Stack Developer, AI Automation Engineer & DevOps Specialist
- 6+ years experience since 2020
- Top Rated Seller on Fiverr with 168+ completed projects
- Based in Bangladesh, works with international clients

Blog Focus Areas:
- Frontend: React.js, Next.js, TypeScript, Angular, Vue.js, Tailwind CSS
- Backend: Node.js, NestJS, Express.js, Laravel, PHP
- Database: PostgreSQL, MySQL, MongoDB, Supabase, Firebase
- Mobile: React Native, Expo
- DevOps: Docker, AWS, Nginx, PM2, Cloudflare, CI/CD
- AI: n8n automation, AI API integration, Python automation

Rules:
1. Generate UNIQUE topics that haven't been covered before
2. Focus on trending tech topics in 2026
3. Include practical, hands-on content ideas
4. Target keywords should have good search volume
5. Categories must be one of: ${BLOG_CATEGORIES.join(", ")}
6. Return ONLY valid JSON array, no markdown or extra text
7. Each topic must have: title, category, keywords (3-5), description (1-2 sentences)`;

export async function generateTopics(count: number = 5): Promise<GeneratedTopic[]> {
  if (!OLLAMA_API_KEY) {
    throw new Error("AI service not configured");
  }

  // Fetch existing topics and post titles to avoid duplicates
  const [existingTopics, recentPosts] = await Promise.all([
    prisma.topic.findMany({
      select: { title: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.post.findMany({
      select: { title: true, category: true },
      orderBy: { date: "desc" },
      take: 30,
    }),
  ]);

  const existingTitles = [
    ...existingTopics.map((t) => t.title),
    ...recentPosts.map((p) => p.title),
  ];

  const prompt = `Generate ${count} unique blog post topics for a tech portfolio blog.

EXISTING TOPICS (DO NOT DUPLICATE):
${existingTitles.map((t) => `- ${t}`).join("\n")}

BLOG CATEGORIES: ${BLOG_CATEGORIES.join(", ")}

Generate ${count} topics that:
1. Are different from existing topics
2. Focus on trending tech in 2026
3. Are practical and educational
4. Have good SEO potential

Return a JSON array with this exact format:
[
  {
    "title": "Topic Title Here",
    "category": "Category Name",
    "keywords": ["keyword1", "keyword2", "keyword3"],
    "description": "Brief 1-2 sentence description"
  }
]

IMPORTANT: Return ONLY the JSON array, no markdown code blocks, no extra text.`;

  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OLLAMA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      stream: false,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("[AI TOPIC GENERATOR ERROR]", response.status, err);
    throw new Error("AI service error");
  }

  const data: any = await response.json();
  const content = data.message?.content || "";

  // Parse JSON from response
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error("[AI TOPIC GENERATOR] No JSON array found in response:", content);
    throw new Error("Invalid AI response format");
  }

  try {
    const topics = JSON.parse(jsonMatch[0]) as GeneratedTopic[];

    // Validate and sanitize
    return topics
      .filter((t) => t.title && t.category && BLOG_CATEGORIES.includes(t.category))
      .map((t) => ({
        title: t.title.trim(),
        category: t.category.trim(),
        keywords: Array.isArray(t.keywords) ? t.keywords.slice(0, 5) : [],
        description: t.description?.trim() || "",
      }));
  } catch (parseError) {
    console.error("[AI TOPIC GENERATOR] JSON parse error:", parseError);
    throw new Error("Failed to parse AI response");
  }
}

export async function saveTopics(topics: GeneratedTopic[]): Promise<number> {
  let saved = 0;

  for (const topic of topics) {
    // Check for duplicate titles
    const existing = await prisma.topic.findFirst({
      where: { title: { equals: topic.title, mode: "insensitive" } },
    });

    if (!existing) {
      await prisma.topic.create({
        data: {
          title: topic.title,
          category: topic.category,
          keywords: topic.keywords,
          description: topic.description,
          status: "PENDING",
          priority: 0,
        },
      });
      saved++;
    }
  }

  return saved;
}

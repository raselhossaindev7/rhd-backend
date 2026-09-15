import prisma from "../config/db";
import { aiChat, extractJsonObject } from "./aiProvider";

interface GeneratedServiceTopic {
  title: string;
  category: string;
  keywords: string[];
  description: string;
}

// Trending service taxonomy — what buyers actually search for.
// Must stay in sync with ServiceForm, demandSignals, imageFinder, thumbnail.
export const SERVICE_CATEGORIES = [
  "Programming",
  "WordPress",
  "Digital Marketing",
  "AI",
  "Web & SaaS",
  "AI & Automation",
  "Mobile",
  "E-commerce",
  "Business Software",
  "Deployment",
];

const SYSTEM_PROMPT = `You are an expert service-offering strategist for Rasel Hossain's portfolio (raselhossain.dev).

About Rasel:
- Full Stack Developer, AI Automation Engineer & DevOps Specialist
- 6+ years experience since 2020
- Top Rated Seller on Fiverr with 168+ completed projects
- Based in Bangladesh, works with international clients

Existing services (DO NOT duplicate — propose NEW trending sellable offerings users actually search for):
- Programming (Next.js, React, SaaS, Full Stack, Mobile App, DevOps, CRM/ERP)
- WordPress (WordPress Development, WooCommerce, E-commerce)
- Digital Marketing (SEO, Marketing Automation, Email Marketing)
- AI (AI Integration, ChatGPT, Automation, Workflow Bots)

Rules:
1. Generate UNIQUE service ideas that haven't been covered before
2. Each idea must be a concrete, sellable client offering for 2026
   (clear outcome, clear buyer — e.g. "Next.js to React Native porting")
3. Target keywords should have buyer intent (3-5 specific phrases a client would Google)
4. Categories must be one of: ${SERVICE_CATEGORIES.join(", ")}
5. NEVER use trademarked brand names in service titles — use generic terms instead
6. NEVER copy competitor service names or phrasing
7. Focus on trending topics that buyers actually search for in 2026
8. Each service must solve a real problem — not just list technologies
9. Return ONLY valid JSON array, no markdown or extra text
10. Each topic must have: title, category, keywords (3-5), description (1-2 sentences)`;

export interface ServiceTopicDemand {
  /** Real Google queries (US) — proven buyer intent, not guesses. */
  queries?: string[];
  /** Under-covered categories — at least one idea each. */
  priorityCategories?: string[];
}

export async function generateServiceTopics(count: number = 3, demand: ServiceTopicDemand = {}): Promise<GeneratedServiceTopic[]> {
  // Fetch existing service topics + live services to avoid duplicates.
  // Sequential reads (no $transaction — see db.ts: a batch pins one
  // server connection on the Supabase transaction-mode pooler).
  const existingTopics = await prisma.serviceTopic.findMany({
    select: { title: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const existingServices = await prisma.service.findMany({
    select: { title: true, category: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const existingTitles = [
    ...existingTopics.map((t) => t.title),
    ...existingServices.map((s) => s.title),
  ];

  // Real-demand grounding: queries buyers actually typed into Google.
  const demandQueries = [...new Set((demand.queries || []).map((q) => q.trim()).filter(Boolean))].slice(0, 20);
  const priorityCats = (demand.priorityCategories || []).filter((c) => SERVICE_CATEGORIES.includes(c));
  const demandBlock = demandQueries.length
    ? `
REAL GOOGLE QUERIES (US — buyers actually searched these recently):
${demandQueries.map((q) => `- ${q}`).join("\n")}
`
    : "";
  const priorityBlock = priorityCats.length
    ? `\nPRIORITY CATEGORIES (under-covered in the catalogue — at least one idea from EACH): ${priorityCats.join(", ")}\n`
    : "";

  const prompt = `Generate ${count} unique service offerings for a freelance developer portfolio.

EXISTING OFFERINGS (DO NOT DUPLICATE):
${existingTitles.map((t) => `- ${t}`).join("\n")}
${demandBlock}${priorityBlock}
SERVICE CATEGORIES: ${SERVICE_CATEGORIES.join(", ")}

Generate ${count} offerings that:
1. Are different from existing offerings (new angles, not rewordings)
2. Solve a painful, well-defined client problem in 2026
3. Are clearly sellable (buyer + outcome obvious from the title)
4. Have good SEO / buyer-intent potential
${demandQueries.length ? `5. Base AT LEAST HALF the ideas on the REAL GOOGLE QUERIES above — mirror the buyer's wording in the title and put the exact query (or closest variant) as keywords[0]. Proven demand beats guesses.` : ""}

Return a JSON array with this exact format:
[
  {
    "title": "Service Title Here",
    "category": "Category Name",
    "keywords": ["keyword1", "keyword2", "keyword3"],
    "description": "Brief 1-2 sentence description of the buyer + outcome"
  }
]

IMPORTANT: Return ONLY the JSON array, no markdown code blocks, no extra text.`;

  const content = await aiChat([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ]);

  // Parse JSON from response — tolerant of ``` fences, prose around
  // the array, and object-wrapped arrays ({"topics": [...]})
  const arrayMatch = content.match(/\[[\s\S]*\]/);
  let raw: unknown = null;
  if (arrayMatch) {
    try {
      raw = JSON.parse(arrayMatch[0]);
    } catch {
      raw = null;
    }
  }
  if (!Array.isArray(raw)) {
    try {
      const obj = JSON.parse(extractJsonObject(content)) as Record<string, unknown>;
      const firstArray = Object.values(obj).find((v) => Array.isArray(v));
      if (Array.isArray(firstArray)) raw = firstArray;
    } catch {
      raw = null;
    }
  }
  if (!Array.isArray(raw)) {
    console.error("[AI SERVICE TOPIC GENERATOR] No JSON array found in response:", content.slice(0, 500));
    throw new Error("Invalid AI response format");
  }

  try {
    const topics = raw as GeneratedServiceTopic[];

    // Validate and sanitize
    return topics
      .filter((t) => t.title && t.category && SERVICE_CATEGORIES.includes(t.category))
      .map((t) => ({
        title: t.title.trim(),
        category: t.category.trim(),
        keywords: Array.isArray(t.keywords) ? t.keywords.slice(0, 5) : [],
        description: t.description?.trim() || "",
      }));
  } catch (parseError) {
    console.error("[AI SERVICE TOPIC GENERATOR] JSON parse error:", parseError);
    throw new Error("Failed to parse AI response");
  }
}

export async function saveServiceTopics(topics: GeneratedServiceTopic[]): Promise<number> {
  let saved = 0;

  for (const topic of topics) {
    // Check for duplicate titles
    const existing = await prisma.serviceTopic.findFirst({
      where: { title: { equals: topic.title, mode: "insensitive" } },
    });

    if (!existing) {
      await prisma.serviceTopic.create({
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

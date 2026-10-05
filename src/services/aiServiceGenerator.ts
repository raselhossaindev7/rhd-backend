import { slugify } from "../utils/helpers";
import prisma from "../config/db";
import { findImages, extractKeywords } from "./imageFinder";
import { generateServiceThumbnail } from "./aiThumbnailGenerator";
import { aiChatFull, extractJsonObject } from "./aiProvider";
import {
  sanitizeStrArray,
  sanitizeFaq,
  sanitizeHowTo,
  sanitizeBlurb,
} from "../utils/seo";

export interface ServiceData {
  title: string;
  slug: string;
  icon: string;
  category: string;
  description: string;
  overview: string;
  image: string | null;
  order: number;
  featured: boolean;
  active: boolean;
  deliverables: string[];
  stack: string[];
  bestFor: string[];
  features: string[];
  metaTitle: string;
  metaDescription: string;
  ogImage: string | null;
  canonical: string | null;
  keywords: string[];
  geoRegion: string;
  geoPlaceName: string;
  geoPosition: string;
  geoCountry: string;
  areaServed: string;
  availableLanguages: string[];
  faqJson: Array<{ question: string; answer: string }>;
  howToSteps: Array<{ name: string; text: string }>;
  speakableText: string;
}

const SYSTEM_PROMPT = `You are an expert service-page copywriter for Rasel Hossain's portfolio (raselhossain.dev).

About Rasel:
- Full Stack Developer, AI Automation Engineer & DevOps Specialist
- 6+ years experience since 2020
- Top Rated Seller on Fiverr with 168+ completed projects
- CMS & e-commerce expert: WordPress/WooCommerce, Shopify, Wix, Webflow, Squarespace, BigCommerce
- SEO & tracking expert: technical/on-page SEO, backlinks, AEO/GEO, GTM, Meta/TikTok pixels
- Based in Bangladesh, works with international clients worldwide

Writing Style (buyer-first, never robotic):
- Write for a non-technical buyer first: outcome, timeline feel, what's included
- Confident practitioner voice ("I build / I ship"), concrete over generic
- Short paragraphs (2-4 sentences); bullet-friendly where scannable
- Original, specific claims — never filler ("high quality", "best service")

Content Must Be:
- 100% original — never copy from any website, blog or competitor
- Practical and actionable — buyers should know exactly what they get
- Outcome-focused — "you'll get X result" not "I use Y technology"
- Specific — real timelines, real deliverables, real process steps
- Helpful — answer questions before buyers ask them
- Always close with a buyer CTA naming the exact contact channels:
  Email raselhossaindev7@gmail.com, phone/WhatsApp/Telegram +8801757220402,
  WhatsApp chat https://wa.me/8801757220402 (Markdown links:
  [Email](mailto:raselhossaindev7@gmail.com),
  [WhatsApp](https://wa.me/8801757220402))

SEO Requirements:
- Keyword-rich but natural headings and copy
- FAQ answers self-contained (must make sense without the page)
- Speakable 40-60 word direct answer describing the service + outcome

Rules:
1. 100% unique and original, genuinely helpful — never copy existing content
2. NEVER copy text from any competitor website, blog or marketing material
3. NEVER use third-party trademarked brand names (Salesforce, HubSpot, etc.) in headings — EXCEPT platform/CMS names Rasel sells (WordPress, WooCommerce, Shopify, Wix, Webflow, Squarespace, BigCommerce), which stay factual in headings and copy
4. NEVER use stock phrases like "best quality", "world-class", "cutting-edge" — use concrete specifics instead
5. Platform names above stay as-is everywhere (titles, stack, keywords); other tech gets generic names where possible (e.g. "CRM software" instead of "Salesforce")
6. Write content that helps buyers make a decision — not just SEO filler
7. Overview: 500-800 words of Markdown (H2/H3, what's included, process, outcomes)
8. Meta title: 45-60 characters, include primary keyword
9. Meta description: 120-160 characters, buyer-facing
10. FAQ: 3-5 buyer questions (pricing feel, timeline, revisions, tech, support)
11. HowTo steps: 3-5 engagement steps (discovery → delivery → support)
12. Keywords: 5-8 buyer-intent SEO keywords (generic terms only — never brand names as keywords)
13. Deliverables: 4-7 concrete items the client receives
14. Stack: 4-8 real technologies used to deliver it (brand names OK here as they're factual descriptors)
15. BestFor: 3-5 buyer segments (e.g. "SaaS founders", "online stores")
16. Features: 4-8 capability bullets shown on the card/hero
17. Return ONLY valid JSON (step 2) or ONLY Markdown (step 1) as instructed`;

/**
 * Remove ``` fences ONLY when they wrap the entire response (same guard
 * as aiBlogGenerator — an overview containing code examples must not be
 * truncated to its first code block).
 */
function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const m = trimmed.match(/^```(?:markdown|md)?\s*[\r\n]+([\s\S]*?)[\r\n]+```\s*$/i);
  return (m ? m[1] : trimmed).trim();
}

export type ServiceGenStage = "writing" | "meta" | "thumbnail";

export async function generateService(
  title: string,
  category: string,
  keywords: string[] = [],
  description?: string,
  onStage?: (stage: ServiceGenStage) => void,
  onThumbnail?: (info: { stage: "generating" | "done" | "fallback"; url?: string | null; source?: string | null }) => void
): Promise<ServiceData> {
  // Collect recently used service photos so this service gets a fresh one.
  const exclude: string[] = [];
  try {
    const recent = await prisma.service.findMany({
      select: { image: true, ogImage: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    });
    for (const s of recent) {
      if (s.image) exclude.push(s.image);
      if (s.ogImage && s.ogImage !== s.image) exclude.push(s.ogImage);
    }
  } catch (err) {
    // Image-history lookup must never block generation.
    console.warn("[AI SERVICE GENERATOR] Could not load recent images:", (err as Error)?.message || err);
  }

  const imageKeywords = extractKeywords(title, category);
  const images = await findImages(imageKeywords, 2, category, { exclude });

  // AI cover starts NOW in the background (30-120s) while the overview +
  // meta AI calls run — awaited at the end, so it adds ~zero latency.
  // Own R2 cover beats stock; failure falls back to stock silently.
  onStage?.("thumbnail");
  onThumbnail?.({ stage: "generating" });
  const thumbPromise = generateServiceThumbnail(title, category, "3d-premium").then((t) => {
    if (t?.url) onThumbnail?.({ stage: "done", url: t.url, source: t.source });
    else onThumbnail?.({ stage: "fallback" });
    return t;
  }).catch(() => {
    onThumbnail?.({ stage: "fallback" });
    return null;
  });

  // ── Two-step generation (same pattern as generateBlogPost) ──
  // Step 1 returns plain Markdown (a truncated prefix is still usable
  // text); step 2 returns a SMALL JSON object that cannot truncate.
  const contentPrompt = `Write a buyer-facing service page overview for: "${title}"

Category: ${category}
Target Keywords: ${keywords.join(", ") || "auto-detect from title"}
${description ? `Buyer + outcome context: ${description}` : ""}

Requirements:
- 500-800 words of Markdown (H2/H3 headings: what you get, process, outcomes)
- First paragraph MUST state the outcome in 40-60 words (who it's for + result)
- Concrete deliverables and process feel — no generic filler
- Primary keyword naturally in first 100 words, one H2, and closing
- Final section MUST be a contact CTA with: [Email](mailto:raselhossaindev7@gmail.com),
  [WhatsApp](https://wa.me/8801757220402), phone/Telegram +8801757220402

Return ONLY the Markdown overview. No JSON, no code fences around it.`;

  const contentMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: contentPrompt },
  ] as { role: "system" | "user" | "assistant"; content: string }[];

  // A usable overview needs real body text; 800 chars ≈ 130+ words minimum.
  const MIN_CONTENT_CHARS = 800;
  let overview = "";
  let lastRaw = "";
  onStage?.("writing");
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await aiChatFull(
      attempt === 1
        ? contentMessages
        : [
            ...contentMessages,
            {
              role: "user",
              content:
                "Your previous reply was cut off. Rewrite the overview completely but keep it UNDER 600 words so it fits. Return ONLY the Markdown.",
            },
          ],
      undefined,
      // 800 words ≈ 1100 tokens; headroom for verbose models.
      { maxTokens: 4000 }
    );
    lastRaw = res.content;
    const cleaned = stripCodeFences(res.content).trim();
    console.log(
      `[AI SERVICE GENERATOR] Content attempt ${attempt}/2: len=${cleaned.length}, finish=${res.finishReason || "unknown"}`
    );
    if (cleaned.length > overview.length) overview = cleaned;
    if (cleaned.length >= MIN_CONTENT_CHARS && res.finishReason !== "length") break;
  }
  if (overview.length < MIN_CONTENT_CHARS) {
    console.error(
      `[AI SERVICE GENERATOR] Content too short after retries (rawLen=${lastRaw.length}, keptLen=${overview.length}). Last response:`,
      lastRaw.slice(0, 500)
    );
    throw new Error("AI returned service overview too short");
  }

  // ── Step 2: small structured JSON (title + overview opening as context) ──
  // NOTE: field examples below are SHAPE-ONLY. Never copy their wording —
  // every value must be written fresh from the service. Echoing example
  // text ("keyword1", "Buyer question 1?", "concrete item 1", "tech 1"…)
  // gets the service rejected by the sanitizer and left thin for Google.
  const metaPrompt = `For the service titled "${title}" (category: ${category}), return ONLY this JSON object (no markdown, no code fences):

{
  "description": "1-2 fresh buyer-facing sentences about THIS service (120-160 chars, never template words)",
  "deliverables": ["4-7 fresh concrete deliverables of THIS service, never concrete item 1/2/example"],
  "stack": ["4-8 fresh real technologies for THIS service, never tech 1/2/example"],
  "bestFor": ["3-5 fresh buyer segments for THIS service, never buyer segment 1/2/example"],
  "features": ["4-8 fresh capabilities of THIS service, never capability 1/2/example"],
  "metaTitle": "Fresh SEO title under 60 chars with the primary keyword (never example/placeholder words)",
  "metaDescription": "Fresh buyer-facing meta description 120-160 chars (never example/placeholder words)",
  "keywords": ["5-8 fresh lowercase buyer-intent phrases, never keyword1/keyword2/example"],
  "faqJson": [
    {"question": "A real buyer question about THIS service (min 10 chars, never Buyer question 1)?", "answer": "A specific answer with details (min 20 chars, never Self-contained/Detailed description)..."}
  ],
  "howToSteps": [
    {"name": "A real engagement step for THIS service (never Step 1 Title)", "text": "Concrete instructions (min 20 chars, never Detailed step description)..."}
  ],
  "speakableText": "A fresh 40-60 word answer describing THIS service + outcome (never Standalone/template words)"
}

RULES: 3-5 FAQ items, 3-5 howTo steps. Every string must be original text about THIS service — copying any example wording above invalidates the whole response.

Overview opening for context:
${overview.slice(0, 800)}`;

  onStage?.("meta");
  let parsed: any = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await aiChatFull(
        [
          { role: "system", content: "You return only valid JSON objects. No prose, no code fences." },
          { role: "user", content: metaPrompt },
        ],
        undefined,
        // Small object — cannot plausibly truncate at 2000.
        { jsonMode: true, maxTokens: 2000 }
      );
      const candidate = JSON.parse(extractJsonObject(res.content));
      if (!candidate || typeof candidate !== "object") throw new Error("Not an object");
      parsed = candidate;
      break;
    } catch (err: any) {
      console.error(
        `[AI SERVICE GENERATOR] Meta attempt ${attempt}/2 ` +
          `(err=${err?.message || "parse failed"})`
      );
      // On second attempt, retry without jsonMode
      if (attempt === 1) {
        try {
          const res = await aiChatFull(
            [
              { role: "system", content: "You return only valid JSON objects. No prose, no code fences." },
              { role: "user", content: metaPrompt },
            ],
            undefined,
            { maxTokens: 2000 }
          );
          const candidate = JSON.parse(extractJsonObject(res.content));
          if (candidate && typeof candidate === "object") {
            parsed = candidate;
            break;
          }
        } catch {
          // Fall through to fallback
        }
      }
    }
  }
  if (!parsed) {
    // Meta is decoration — never fail the whole service for it.
    console.warn("[AI SERVICE GENERATOR] Meta JSON failed — using title-derived fallbacks");
    parsed = {};
  }

  // Build the complete service data
  const slug = slugify(title);
  // AI R2 cover first (topical, permanent, no credit needed), stock fallback.
  let featuredImage = images[0]?.url || null;
  let coverSource = featuredImage ? "stock" : "none";
  try {
    const thumb = await thumbPromise;
    if (thumb?.url) {
      featuredImage = thumb.url;
      coverSource = thumb.source;
    }
  } catch {
    // Thumbnail must never fail generation — stock stands in.
  }
  console.log(`[AI SERVICE GENERATOR] Cover: ${coverSource}`);
  // ── Sanitize AI meta (automation stays ON, garbage never goes live) ──
  // Same guard as the blog generator: lazy models echo prompt examples.
  const plainOverview = overview
    .replace(/[#>*_`[\]()!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const overviewBlurb = plainOverview.slice(0, 155).trim();
  const safeDescription =
    sanitizeBlurb(parsed.description, 40) ||
    (overviewBlurb.length >= 40
      ? overviewBlurb
      : `${title} — done-for-you by Rasel Hossain.`);
  const safeMetaTitle =
    sanitizeBlurb(parsed.metaTitle, 10).slice(0, 60) ||
    `${title} | Rasel Hossain`.slice(0, 60);
  const safeMetaDesc =
    sanitizeBlurb(parsed.metaDescription, 40).slice(0, 160) ||
    safeDescription.slice(0, 160);
  const safeKeywords = sanitizeStrArray(parsed.keywords, 8);
  const safeFaq = sanitizeFaq(parsed.faqJson);
  const safeHowTo = sanitizeHowTo(parsed.howToSteps);
  const safeSpeakable = sanitizeBlurb(parsed.speakableText, 40);
  // Content lists: drop prompt-echo rows ("concrete item 1", "tech 1"…).
  // Empty lists render as nothing — thin schema is worse than none.
  const safeList = (v: unknown, max: number): string[] =>
    sanitizeStrArray(v, max).filter((s) => s.length >= 3);
  if (!safeKeywords.length || !safeFaq.length) {
    console.warn(
      `[AI SERVICE GENERATOR] Meta sanitized to keywords=${safeKeywords.length}, faq=${safeFaq.length}, howto=${safeHowTo.length} for "${title}"`
    );
  }

  return {
    title,
    slug,
    icon: "code",
    category,
    description: safeDescription,
    overview,
    image: featuredImage,
    order: 0,
    featured: false,
    active: true,
    deliverables: safeList(parsed.deliverables, 10),
    stack: safeList(parsed.stack, 10),
    bestFor: safeList(parsed.bestFor, 8),
    features: safeList(parsed.features, 10),
    metaTitle: safeMetaTitle,
    metaDescription: safeMetaDesc,
    ogImage: featuredImage,
    canonical: null,
    keywords: safeKeywords.length ? safeKeywords : keywords.slice(0, 8),
    geoRegion: "BD-DH",
    geoPlaceName: "Dhaka",
    geoPosition: "23.8103;90.4125",
    geoCountry: "Bangladesh",
    areaServed: "Worldwide",
    availableLanguages: ["en"],
    faqJson: safeFaq,
    howToSteps: safeHowTo,
    speakableText: safeSpeakable,
  };
}

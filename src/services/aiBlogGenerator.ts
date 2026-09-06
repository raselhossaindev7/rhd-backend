import { slugify } from "../utils/helpers";
import { findImages, extractKeywords } from "./imageFinder";
import { aiChatFull, extractJsonObject } from "./aiProvider";

export interface BlogPostData {
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  content: string;
  image: string | null;
  readTime: string;
  date: Date;
  published: boolean;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  ogImage: string | null;
  canonical: string | null;
  geoRegion: string;
  geoPlaceName: string;
  geoPosition: string;
  geoCountry: string;
  areaServed: string;
  availableLanguages: string[];
  faqJson: Array<{ question: string; answer: string }>;
  howToSteps: Array<{ name: string; text: string }>;
  speakableText: string;
  tags: string[];
}

const SYSTEM_PROMPT = `You are an expert SEO content writer for Rasel Hossain's tech portfolio blog (raselhossain.dev).

About Rasel:
- Full Stack Developer, AI Automation Engineer & DevOps Specialist
- 6+ years experience since 2020
- Top Rated Seller on Fiverr with 168+ completed projects
- Based in Bangladesh, works with international clients worldwide

Writing Style:
- Professional, educational, and practical
- Use real-world examples and code snippets when relevant
- Write in first person perspective (Rasel's voice)
- Include actionable insights and best practices
- Target audience: developers, tech enthusiasts, potential clients

SEO Requirements:
- Write compelling, keyword-rich content
- Include natural keyword placement (not keyword stuffing)
- Create engaging meta titles and descriptions
- Include FAQ section for featured snippets
- Include HowTo steps for tutorial-style posts
- Speakable text for voice search optimization

AEO (Answer Engine Optimization — featured snippets, voice assistants):
- Open the content with a direct 40-60 word answer to the post's core
  question, so it can be lifted verbatim into a snippet or voice reply
- Phrase H2 headings as questions readers actually ask ("How does X work?")
- Keep FAQ answers self-contained (each must make sense without the article)

GEO/AIO (Generative Engine Optimization — ChatGPT, Perplexity, AI Overviews):
- Include 2-4 quotable facts or statistics with context (numbers, versions,
  benchmarks) phrased as standalone statements AI can cite
- Use precise entity names (product names, versions, years) — never vague
  pronouns — so cited passages stay accurate out of context
- One idea per paragraph; short paragraphs (2-4 sentences)

E-E-A-T (experience signals that rank and get cited):
- Cite Rasel's real experience (6+ years, 168+ Fiverr projects) where relevant
- Prefer concrete outcomes ("reduced build time from 9min to 90s") over
  generic claims ("much faster")

Content Structure:
- Direct-answer opening paragraph (40-60 words, no hook preamble)
- Well-structured question-style headings (H2, H3)
- Code examples where relevant
- Practical tips and best practices
- Conclusion with call-to-action

Rules:
1. Content must be 100% unique and original
2. 1200-1600 words (hard limit — longer outputs get truncated and rejected)
3. Include practical code examples when relevant
4. Meta title: 45-60 characters, include primary keyword
5. Meta description: 120-160 characters, compelling summary
6. FAQ: 3-5 common questions with detailed answers
7. HowTo steps: 3-5 actionable steps
8. Keywords: 5-8 relevant SEO keywords
9. Tags: 3-5 relevant tags for categorization
10. Return ONLY valid JSON, no markdown or extra text`;

/** Remove ```markdown fences if the model wrapped the article in them. */
function stripCodeFences(raw: string): string {
  const m = raw.match(/```(?:markdown|md)?\s*([\s\S]*?)```/i);
  return (m ? m[1] : raw).trim();
}

export async function generateBlogPost(
  title: string,
  category: string,
  keywords: string[] = [],
  description?: string
): Promise<BlogPostData> {
  const imageKeywords = extractKeywords(title, category);
  const images = await findImages(imageKeywords, 3);

  // ── Two-step generation ──────────────────────────────────
  // The old single-call design stuffed 1200+ words of Markdown PLUS all
  // meta fields into ONE JSON response: any verbose model blew past the
  // token cap mid-string, JSON.parse failed 3/3, and the topic FAILED.
  // Step 1 returns plain Markdown (a truncated article prefix is still
  // usable text); step 2 returns a SMALL JSON object that cannot truncate.
  const contentPrompt = `Write a complete, SEO-optimized blog post about: "${title}"

Category: ${category}
Target Keywords: ${keywords.join(", ") || "auto-detect from title"}
${description ? `Context: ${description}` : ""}

Requirements:
- 1200-1600 words of Markdown (H2/H3 headings, code examples, practical tips)
- First paragraph MUST directly answer the core question in 40-60 words
- H2 headings phrased as questions where natural
- Educational, practical, engaging — write in Rasel's professional voice

Return ONLY the Markdown article. No JSON, no code fences around it.`;

  const contentMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: contentPrompt },
  ] as { role: "system" | "user" | "assistant"; content: string }[];

  // A usable article needs real body text; 1500 chars ≈ 250+ words minimum.
  const MIN_CONTENT_CHARS = 1500;
  let article = "";
  let lastRaw = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await aiChatFull(
      attempt === 1
        ? contentMessages
        : [
            ...contentMessages,
            {
              role: "user",
              content:
                "Your previous reply was cut off. Rewrite the article completely but keep it UNDER 1000 words so it fits. Return ONLY the Markdown.",
            },
          ],
      undefined,
      // 1600 words ≈ 2200 tokens; 6000 leaves headroom for verbose models
      // while prompt (~900) + output stays under Groq's 8000 TPM limit.
      { maxTokens: 6000 }
    );
    lastRaw = res.content;
    const cleaned = stripCodeFences(res.content).trim();
    console.log(
      `[AI BLOG GENERATOR] Content attempt ${attempt}/2: len=${cleaned.length}, finish=${res.finishReason || "unknown"}`
    );
    if (cleaned.length > article.length) article = cleaned;
    // Complete response with enough body → done. Truncated ("length") but
    // long output → retry once for a complete article.
    if (cleaned.length >= MIN_CONTENT_CHARS && res.finishReason !== "length") break;
  }
  if (article.length < MIN_CONTENT_CHARS) {
    console.error("[AI BLOG GENERATOR] Content too short after retries. Last response:", lastRaw.slice(0, 500));
    throw new Error("AI returned article content too short");
  }
  if (article.length < 4000) {
    console.warn(`[AI BLOG GENERATOR] Article shorter than ideal (${article.length} chars) — publishing anyway`);
  }

  // ── Step 2: small meta JSON (title + article opening as context) ──
  const metaPrompt = `For the blog post titled "${title}" (category: ${category}), return ONLY this JSON object (no markdown, no code fences):

{
  "excerpt": "Compelling 120-160 character summary for the post card",
  "metaTitle": "SEO-optimized title (45-60 chars, include primary keyword + brand)",
  "metaDescription": "Compelling meta description (120-160 chars)",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "tags": ["tag1", "tag2", "tag3"],
  "faqJson": [
    {"question": "Common question 1?", "answer": "Self-contained detailed answer..."},
    {"question": "Common question 2?", "answer": "Self-contained detailed answer..."},
    {"question": "Common question 3?", "answer": "Self-contained detailed answer..."}
  ],
  "howToSteps": [
    {"name": "Step 1 Title", "text": "Detailed step description..."},
    {"name": "Step 2 Title", "text": "Detailed step description..."},
    {"name": "Step 3 Title", "text": "Detailed step description..."}
  ],
  "speakableText": "Standalone 40-60 word direct answer to the post's core question (voice search)"
}

Article opening for context:
${article.slice(0, 800)}`;

  let parsed: any = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await aiChatFull(
      [
        { role: "system", content: "You return only valid JSON objects. No prose, no code fences." },
        { role: "user", content: metaPrompt },
      ],
      undefined,
      // Small object (~800 tokens) — cannot plausibly truncate at 2000.
      { jsonMode: true, maxTokens: 2000 }
    );
    try {
      const candidate = JSON.parse(extractJsonObject(res.content));
      if (!candidate || typeof candidate !== "object") throw new Error("Not an object");
      parsed = candidate;
      break;
    } catch (err: any) {
      console.error(
        `[AI BLOG GENERATOR] Meta attempt ${attempt}/2 bad JSON ` +
          `(len=${res.content.length}, err=${err?.message || "parse failed"})`
      );
    }
  }
  if (!parsed) {
    // Meta is decoration — never fail the whole post for it. Title-derived
    // fallbacks keep SEO fields populated; FAQ/HowTo simply stay empty.
    console.warn("[AI BLOG GENERATOR] Meta JSON failed — using title-derived fallbacks");
    parsed = {};
  }
  parsed.content = article;

  // Build the complete blog post data
  const now = new Date();
  const slug = slugify(title);

  // Calculate read time from content length
  const wordCount = (parsed.content || "").split(/\s+/).length;
  const readTime = parsed.readTime || `${Math.max(1, Math.ceil(wordCount / 200))} min read`;

  // Ensure images are available
  const featuredImage = images[0]?.url || null;

  // Add inline images to content if not present
  let processedContent = parsed.content || "";
  if (images.length > 1 && !processedContent.includes("![")) {
    const paragraphs = processedContent.split("\n\n");
    const mdImage = (img: { url?: string; alt?: string; credit?: string }) =>
      img.credit
        ? `![${img.alt || "Illustration"}](${img.url || ""} "${img.credit.replace(/"/g, "'")}")`
        : `![${img.alt || "Illustration"}](${img.url || ""})`;
    const image1 = mdImage({ ...images[1], alt: images[1]?.alt || "Illustration" });
    if (paragraphs.length > 3) {
      paragraphs.splice(3, 0, image1);
    }
    if (images.length > 2) {
      const image2 = mdImage({ ...images[2], alt: images[2]?.alt || "Example" });
      if (paragraphs.length > 6) {
        paragraphs.splice(6, 0, image2);
      }
    }
    processedContent = paragraphs.join("\n\n");
  }

  return {
    title,
    slug,
    category,
    excerpt: parsed.excerpt || `${title} - A comprehensive guide by Rasel Hossain`,
    content: processedContent,
    image: featuredImage,
    readTime,
    date: now,
    published: true,
    metaTitle: parsed.metaTitle || `${title} | Rasel Hossain`,
    metaDescription: parsed.metaDescription || parsed.excerpt || "",
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords : keywords,
    ogImage: featuredImage,
    canonical: null,
    geoRegion: "BD-DH",
    geoPlaceName: "Dhaka",
    geoPosition: "23.8103;90.4125",
    geoCountry: "Bangladesh",
    areaServed: "Worldwide",
    availableLanguages: ["en"],
    faqJson: Array.isArray(parsed.faqJson) ? parsed.faqJson : [],
    howToSteps: Array.isArray(parsed.howToSteps) ? parsed.howToSteps : [],
    speakableText: parsed.speakableText || "",
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
  };
}

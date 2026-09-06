import { slugify } from "../utils/helpers";
import { findImages, extractKeywords } from "./imageFinder";
import { aiChat, extractJsonObject } from "./aiProvider";

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

/**
 * Extract usable Markdown from a truncated JSON response like
 * `{"content":"# Title\n\nLong post...` (cut off mid-string by max_tokens).
 * Returns the unescaped content prefix, or "" if nothing salvageable.
 */
function salvageTruncatedContent(raw: string): string {
  // Strip code fences if the model wrapped the JSON
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced ? fenced[1] : raw).trim();
  const marker = '"content"';
  const idx = text.indexOf(marker);
  if (idx === -1) {
    // No JSON structure at all — treat the whole response as raw Markdown
    // (can happen when jsonMode fell back to text mode on some providers).
    return text.length > 500 ? text : "";
  }
  let start = text.indexOf('"', idx + marker.length);
  if (start === -1) return "";
  // Skip the opening quote, then walk the string honouring escapes until
  // the closing unescaped quote — or end-of-input if truncated.
  let out = "";
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\" && i + 1 < text.length) {
      const next = text[i + 1];
      if (next === "n") out += "\n";
      else if (next === "t") out += "\t";
      else if (next === "r") out += "\r";
      else out += next; // \" \\ \/ etc.
      i++;
    } else if (ch === '"') {
      break; // proper closing quote
    } else {
      out += ch;
    }
  }
  return out.trim();
}

export async function generateBlogPost(
  title: string,
  category: string,
  keywords: string[] = [],
  description?: string
): Promise<BlogPostData> {
  const imageKeywords = extractKeywords(title, category);
  const images = await findImages(imageKeywords, 3);

  const prompt = `Write a complete, SEO-optimized blog post about: "${title}"

Category: ${category}
Target Keywords: ${keywords.join(", ") || "auto-detect from title"}
${description ? `Context: ${description}` : ""}

Generate a complete blog post with ALL of the following in JSON format:

{
  "content": "Full blog post content in Markdown format (1200-1600 words, with H2/H3 headings, code examples, practical tips)",
  "excerpt": "Compelling 120-160 character summary for the post card",
  "readTime": "X min read (estimate based on content length)",
  "metaTitle": "SEO-optimized title (45-60 chars, include primary keyword + brand)",
  "metaDescription": "Compelling meta description (120-160 chars)",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "tags": ["tag1", "tag2", "tag3"],
  "faqJson": [
    {"question": "Common question 1?", "answer": "Detailed answer..."},
    {"question": "Common question 2?", "answer": "Detailed answer..."},
    {"question": "Common question 3?", "answer": "Detailed answer..."}
  ],
  "howToSteps": [
    {"name": "Step 1 Title", "text": "Detailed step description..."},
    {"name": "Step 2 Title", "text": "Detailed step description..."},
    {"name": "Step 3 Title", "text": "Detailed step description..."}
  ],
  "speakableText": "Summary paragraph optimized for voice search (1-2 sentences)"
}

IMPORTANT:
- Content must be educational, practical, and engaging
- First paragraph MUST directly answer the core question in 40-60 words
- H2 headings phrased as questions where natural
- Include real code examples where relevant
- speakableText MUST be a standalone 40-60 word direct answer (voice/AEO)
- Write in Rasel's professional voice
- Ensure all JSON fields are properly formatted
- Return ONLY the JSON object, no markdown code blocks`;

  // Generate with retries. With response_format=json_object the model
  // returns a strict object, so bad-JSON repairs are now rare. Repair
  // attempts regenerate from scratch WITHOUT echoing the previous broken
  // output back (the old code re-sent 4000 chars each retry, burning
  // ~1000 extra TPM-limited tokens per attempt and causing 429 loops).
  // NOTE: the most common "bad JSON" is TRUNCATION — the model was asked
  // for 2000+ words but maxTokens cut it off mid-string. Repairs therefore
  // explicitly demand SHORTER content so the retry fits the token budget.
  const REPAIR_PROMPT = `Your previous response was not valid JSON (likely truncated by length). Return ONLY the JSON object with the exact fields requested (content, excerpt, readTime, metaTitle, metaDescription, keywords, tags, faqJson, howToSteps, speakableText). Keep content UNDER 1200 words so the response fits. No markdown, no explanation, no code fences.`;

  const baseMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ] as { role: "system" | "user" | "assistant"; content: string }[];

  let parsed: any = null;
  let lastContent = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const content = await aiChat(
      attempt === 1
        ? baseMessages
        : [...baseMessages, { role: "user", content: REPAIR_PROMPT }],
      undefined,
      // 1200-1600 words ≈ 1600-2200 tokens + ~800 for meta/FAQ/HowTo.
      // 6000 cap leaves headroom for verbose models while prompt (~900)
      // + output stays under Groq's 8000 TPM limit.
      { jsonMode: true, maxTokens: 6000 }
    );
    lastContent = content;
    try {
      const candidate = JSON.parse(extractJsonObject(content));
      if (!candidate || typeof candidate.content !== "string" || !candidate.content.trim()) {
        throw new Error("Missing content field");
      }
      parsed = candidate;
      break;
    } catch (err: any) {
      console.error(
        `[AI BLOG GENERATOR] Attempt ${attempt}/3 returned bad JSON ` +
          `(len=${content.length}, err=${err?.message || "parse failed"})` +
          `${attempt < 3 ? ", retrying with repair prompt" : ""}`
      );
    }
  }
  if (!parsed) {
    // Last resort: salvage truncated output into a usable post instead of
    // failing the whole cron run. A truncated {"content":"...} still holds
    // hundreds of words of good Markdown — extract the raw string prefix.
    const salvaged = salvageTruncatedContent(lastContent);
    if (salvaged && salvaged.length > 500) {
      console.warn(
        `[AI BLOG GENERATOR] Salvaging truncated response (${lastContent.length} chars) as post content`
      );
      parsed = { content: salvaged };
    } else {
      console.error("[AI BLOG GENERATOR] No valid JSON after 3 attempts. Last response:", lastContent.slice(0, 500));
      throw new Error("Invalid AI response format");
    }
  }

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

import { config } from "../config/env";
import { slugify } from "../utils/helpers";
import { findImages, extractKeywords } from "./imageFinder";

const OLLAMA_API_KEY = config.ollamaApiKey;
const OLLAMA_BASE_URL = "https://ollama.com";
const OLLAMA_MODEL = "minimax-m3:cloud";

interface BlogPostData {
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

Content Structure:
- Engaging introduction with hook
- Well-structured headings (H2, H3)
- Code examples where relevant
- Practical tips and best practices
- Conclusion with call-to-action

Rules:
1. Content must be 100% unique and original
2. Minimum 1500 words, ideally 2000-2500 words
3. Include practical code examples when relevant
4. Meta title: 45-60 characters, include primary keyword
5. Meta description: 120-160 characters, compelling summary
6. FAQ: 3-5 common questions with detailed answers
7. HowTo steps: 3-5 actionable steps
8. Keywords: 5-8 relevant SEO keywords
9. Tags: 3-5 relevant tags for categorization
10. Return ONLY valid JSON, no markdown or extra text`;

export async function generateBlogPost(
  title: string,
  category: string,
  keywords: string[] = [],
  description?: string
): Promise<BlogPostData> {
  if (!OLLAMA_API_KEY) {
    throw new Error("AI service not configured");
  }

  const imageKeywords = extractKeywords(title, category);
  const images = await findImages(imageKeywords, 3);

  const prompt = `Write a complete, SEO-optimized blog post about: "${title}"

Category: ${category}
Target Keywords: ${keywords.join(", ") || "auto-detect from title"}
${description ? `Context: ${description}` : ""}

Generate a complete blog post with ALL of the following in JSON format:

{
  "content": "Full blog post content in Markdown format (1500-2500 words, with H2/H3 headings, code examples, practical tips)",
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
- Include real code examples where relevant
- Write in Rasel's professional voice
- Ensure all JSON fields are properly formatted
- Return ONLY the JSON object, no markdown code blocks`;

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
    console.error("[AI BLOG GENERATOR ERROR]", response.status, err);
    throw new Error("AI service error");
  }

  const data: any = await response.json();
  const content = data.message?.content || "";

  // Parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("[AI BLOG GENERATOR] No JSON found in response:", content);
    throw new Error("Invalid AI response format");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (parseError) {
    console.error("[AI BLOG GENERATOR] JSON parse error:", parseError);
    throw new Error("Failed to parse AI response");
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
    const image1 = `![${images[1]?.alt || "Illustration"}](${images[1]?.url || ""})`;
    if (paragraphs.length > 3) {
      paragraphs.splice(3, 0, image1);
    }
    if (images.length > 2) {
      const image2 = `![${images[2]?.alt || "Example"}](${images[2]?.url || ""})`;
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

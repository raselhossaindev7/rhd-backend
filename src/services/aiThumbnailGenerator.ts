import sharp from "sharp";
import { slugify } from "../utils/helpers";
import { uploadToR2 } from "../config/r2";

// ─── AI service thumbnails (cover → own R2 CDN) ──────────
// Concept: instead of a generic stock photo, every auto-generated service
// gets a topical AI cover: Hugging Face (FLUX.1-schnell via the nscale
// provider route — the legacy hf-inference serverless route is deprecated)
// primary, keyed Pollinations fallback. Bytes are normalized to
// 1200×630 WebP and uploaded to R2, so the service image/ogImage is a
// permanent first-party URL (assets.raselhossain.dev) — no hotlink rot,
// no photographer credit needed. Any failure returns null and the caller
// falls back to stock photos; thumbnails never block generation.

const HF_MODEL = "black-forest-labs/FLUX.1-schnell";
const HF_URL = "https://router.huggingface.co/nscale/v1/images/generations";
const WIDTH = 1200;
const HEIGHT = 630;

// ─── Premium 3D style presets (best visual = glossy 3D icons) ───
// Every preset is a premium 3D render — floating glossy icons, glassmorphism,
// octane/unreal studio lighting. Category icons are injected separately.
export const THUMBNAIL_STYLES = {
  "3d-premium": {
    label: "3D Premium ★",
    hint: "Best • glossy 3D icons • glass + gradient",
    suffix:
      "premium 3D render, glossy floating 3D icons, glassmorphism, soft studio lighting, " +
      "octane render, unreal engine, C4D, vibrant purple indigo gradient background, " +
      "floating shadows, ultra polished, clean composition with copy space on the left",
  },
  "3d-isometric": {
    label: "3D Isometric",
    hint: "Isometric grid • 3D icons",
    suffix:
      "isometric 3D render, floating 3D icons on isometric grid, soft shadows, " +
      "vibrant purple and indigo palette, glossy plastic material, octane render, " +
      "clean composition with copy space on the left",
  },
  "pro-saas": {
    label: "Pro SaaS",
    hint: "Dashboard hero • 3D icons",
    suffix:
      "premium 3D SaaS hero, glossy 3D dashboard icons floating, glassmorphism UI cards, " +
      "deep purple and dark navy gradient, premium studio lighting, octane render, " +
      "clean composition with copy space on the left",
  },
  "dark-premium": {
    label: "Dark Premium",
    hint: "Cinematic dark • glowing 3D",
    suffix:
      "cinematic dark premium 3D render, glowing glossy 3D icons, dramatic rim lighting, " +
      "deep blacks with violet and teal glow, neon accents, octane render, " +
      "clean composition with copy space on the left",
  },
  "minimal-light": {
    label: "Minimal Light 3D",
    hint: "Light • soft 3D icons",
    suffix:
      "clean minimal light 3D render, glossy pastel 3D icons floating, soft gradient lavender to white, " +
      "glassmorphism, airy studio lighting, octane render, " +
      "clean composition with copy space on the left",
  },
  "gradient-abstract": {
    label: "Abstract 3D",
    hint: "Abstract • flowing 3D shapes",
    suffix:
      "abstract premium 3D background, flowing glossy 3D shapes and orbs, " +
      "purple violet gradient with luminous highlights, glassmorphism, octane render, " +
      "clean composition with copy space on the left",
  },
  "blog-modern": {
    label: "Blog Modern",
    hint: "Blog cover • tech illustration",
    suffix:
      "modern tech blog header illustration, glossy 3D elements floating, " +
      "vibrant purple indigo gradient, glassmorphism, soft studio lighting, " +
      "editorial illustration style, clean composition with copy space on the left",
  },
} as const;

export type ThumbnailStyleId = keyof typeof THUMBNAIL_STYLES;

// Category → premium 3D brand icons (generic, no trademarked names in prompt)
function categoryVisual(category: string): string {
  const c = (category || "").toLowerCase();
  if (c.includes("programming") || c.includes("web") || c.includes("saas") || c.includes("full stack"))
    return "glossy 3D code brackets icon, 3D browser window, 3D database icon, 3D server rack, 3D cloud upload";
  if (c.includes("mobile"))
    return "glossy 3D smartphone icon, 3D mobile app UI cards, 3D app store badge, 3D phone mockup, 3D touch gesture";
  if (c.includes("wordpress") || c.includes("ecommerce") || c.includes("e-commerce"))
    return "glossy 3D CMS dashboard icon, 3D blog editor, 3D shopping cart, 3D theme palette, 3D plugin block";
  if (c.includes("digital marketing") || c.includes("marketing") || c.includes("seo"))
    return "glossy 3D bar chart trending up icon, 3D megaphone, 3D email envelope, 3D social media share, 3D magnifying glass";
  if (c.includes("ai") || c.includes("automation"))
    return "glossy 3D brain neural network icon, 3D robot head, 3D sparkles, 3D data pipeline, 3D chip processor";
  if (c.includes("business") || c.includes("crm") || c.includes("erp"))
    return "glossy 3D dashboard chart icon, 3D analytics graph, 3D CRM cards, 3D growth arrow, 3D pie chart";
  if (c.includes("deployment") || c.includes("devops"))
    return "glossy 3D server icon, 3D cloud upload, 3D container box, 3D pipeline gear, 3D shield check";
  return "glossy 3D tech icons floating, 3D code, 3D cloud, 3D dashboard elements";
}

export function buildThumbnailPrompt(
  title: string,
  category: string,
  style: string = "3d-premium",
  customPrompt?: string
): string {
  if (customPrompt?.trim()) return customPrompt.trim().slice(0, 1000);
  const preset =
    THUMBNAIL_STYLES[style as ThumbnailStyleId] ?? THUMBNAIL_STYLES["3d-premium"];
  return (
    `${title}, ${category} service theme, ${categoryVisual(category)}, ` +
    `${preset.suffix}, ultra detailed, 8K, sharp focus, highly detailed, vibrant, ` +
    // AI-rendered text always comes out garbled — the real title is overlaid
    // later with sharp (crisp vector text), so the background must stay
    // text-free with a dark empty lower third for the overlay.
    `generic tech icons, absolutely no text, no words, no letters, no typography anywhere, ` +
    `no watermark, no trademarked brand names, no people faces, no person, ` +
    `lower third dark and empty for title overlay`
  );
}

function thumbnailPrompt(title: string, category: string): string {
  return buildThumbnailPrompt(title, category, "3d-premium");
}

async function generateViaHuggingFace(prompt: string): Promise<Buffer | null> {
  const token = process.env.HF_TOKEN || "";
  if (!token) return null;
  try {
    // OpenAI-compatible images route (nscale provider). b64_json avoids a
    // second fetch; model name rides in the body, not the URL.
    const res = await fetch(HF_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: HF_MODEL, prompt, response_format: "b64_json" }),
      signal: AbortSignal.timeout(180000),
    });
    if (!res.ok) {
      console.warn("[THUMBNAIL] HF failed:", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const data: any = await res.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      console.warn("[THUMBNAIL] HF empty image payload");
      return null;
    }
    return Buffer.from(b64, "base64");
  } catch (err) {
    console.warn("[THUMBNAIL] HF error:", (err as Error)?.message || err);
    return null;
  }
}

async function generateViaPollinations(prompt: string): Promise<Buffer | null> {
  const key = process.env.POLLINATIONS_KEY || "";
  if (!key) return null;
  try {
    const seed = Math.floor(Math.random() * 1000000);
    const url =
      `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
      `?width=${WIDTH}&height=${HEIGHT}&nologo=true&model=flux&seed=${seed}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) {
      console.warn("[THUMBNAIL] Pollinations failed:", res.status);
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.warn("[THUMBNAIL] Pollinations error:", (err as Error)?.message || err);
    return null;
  }
}

async function toCoverWebp(input: Buffer): Promise<Buffer> {
  try {
    return await sharp(input)
      .resize(WIDTH, HEIGHT, { fit: "cover", position: "centre" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return input;
  }
}

// ─── Crisp title overlay (the actual fix for garbled AI text) ──
// Image models can't spell — any letters they "write" come out broken.
// So the background stays text-free (see prompt) and the real title is
// composited here as vector text: always sharp, always readable.
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function wrapTitle(title: string, perLine = 26, maxLines = 2): string[] {
  const words = String(title || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (next.length > perLine && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) break;
    } else {
      cur = next;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines.map((l) => (l.length > 44 ? l.slice(0, 41) + "..." : l));
}

export async function overlayTitle(input: Buffer, title: string): Promise<Buffer> {
  const lines = wrapTitle(title);
  if (!lines.length) return input;
  const lineHeight = 56;
  const padTop = 52;
  const bannerH = lines.length * lineHeight + padTop + 28;
  const y0 = HEIGHT - bannerH;
  const texts = lines
    .map(
      (l, i) =>
        `<text x="60" y="${y0 + padTop + i * lineHeight}" font-family="sans-serif" font-size="46" font-weight="bold" fill="#ffffff">${escapeXml(l)}</text>`
    )
    .join("");
  const svg =
    `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><linearGradient id="tb" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="black" stop-opacity="0"/>` +
    `<stop offset="1" stop-color="black" stop-opacity="0.72"/>` +
    `</linearGradient></defs>` +
    `<rect x="0" y="${y0}" width="${WIDTH}" height="${bannerH}" fill="url(#tb)"/>` +
    texts +
    `</svg>`;
  return sharp(input)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .webp({ quality: 82 })
    .toBuffer();
}

export interface GeneratedThumbnail {
  url: string;
  source: "hf-flux" | "pollinations";
  prompt: string;
  style: string;
}

/**
 * Generate a service cover and host it on R2. Returns null when no keys
 * are configured or both providers fail — caller uses stock photos then.
 */
export async function generateServiceThumbnail(
  title: string,
  category: string,
  style: string = "3d-premium",
  customPrompt?: string
): Promise<GeneratedThumbnail | null> {
  // Add unique variation to prompt so same title always gets a different image
  const variation = Math.floor(Math.random() * 1000000);
  const basePrompt = buildThumbnailPrompt(title, category, style, customPrompt);
  const prompt = customPrompt?.trim() ? basePrompt : `${basePrompt}, unique variation ${variation}`;

  let bytes = await generateViaHuggingFace(prompt);
  let source: GeneratedThumbnail["source"] = "hf-flux";
  if (!bytes) {
    bytes = await generateViaPollinations(prompt);
    source = "pollinations";
  }
  if (!bytes || bytes.length < 10_000) {
    if (bytes) console.warn(`[THUMBNAIL] Suspiciously small image (${bytes.length}b) — discarding`);
    return null;
  }

  try {
    const webp = await toCoverWebp(bytes);
    // Crisp readable title — overlay must never fail the pipeline.
    let final = webp;
    try {
      final = await overlayTitle(webp, title);
    } catch (err) {
      console.warn("[THUMBNAIL] Title overlay failed, using plain cover:", (err as Error)?.message || err);
    }
    const key = `services/thumbnails/${slugify(title).slice(0, 60) || "service"}-${Date.now()}.webp`;
    const url = await uploadToR2(final, key, "image/webp");
    console.log(`[THUMBNAIL] Cover ready via ${source}: ${url} (${Math.round(final.length / 1024)}KB)`);
    return { url, source, prompt, style };
  } catch (err) {
    console.warn("[THUMBNAIL] R2 upload failed:", (err as Error)?.message || err);
    return null;
  }
}

/**
 * Generate a blog post cover and host it on R2. Same pipeline as service
 * thumbnails but with blog-specific style presets.
 */
export async function generateBlogThumbnail(
  title: string,
  category: string,
  style: string = "blog-modern",
  customPrompt?: string
): Promise<GeneratedThumbnail | null> {
  const variation = Math.floor(Math.random() * 1000000);
  const basePrompt = buildThumbnailPrompt(title, category, style, customPrompt);
  const prompt = customPrompt?.trim() ? basePrompt : `${basePrompt}, unique variation ${variation}`;

  let bytes = await generateViaHuggingFace(prompt);
  let source: GeneratedThumbnail["source"] = "hf-flux";
  if (!bytes) {
    bytes = await generateViaPollinations(prompt);
    source = "pollinations";
  }
  if (!bytes || bytes.length < 10_000) {
    if (bytes) console.warn(`[BLOG THUMB] Suspiciously small image (${bytes.length}b) — discarding`);
    return null;
  }

  try {
    const webp = await toCoverWebp(bytes);
    let final = webp;
    try {
      final = await overlayTitle(webp, title);
    } catch (err) {
      console.warn("[BLOG THUMB] Title overlay failed, using plain cover:", (err as Error)?.message || err);
    }
    const key = `blog/thumbnails/${slugify(title).slice(0, 60) || "blog"}-${Date.now()}.webp`;
    const url = await uploadToR2(final, key, "image/webp");
    console.log(`[BLOG THUMB] Cover ready via ${source}: ${url} (${Math.round(final.length / 1024)}KB)`);
    return { url, source, prompt, style };
  } catch (err) {
    console.warn("[BLOG THUMB] R2 upload failed:", (err as Error)?.message || err);
    return null;
  }
}

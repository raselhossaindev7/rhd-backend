/**
 * SEO safety net — guarantees no post / service / project is ever saved
 * with empty meta tags, no matter which path created it (AI scheduler,
 * admin single-shot AI, or manual admin form).
 *
 * Rules mirror the frontend metadata limits (rhd/app/layout.tsx):
 * - metaTitle: 60 chars max (Google rewrites longer ones)
 * - metaDescription: 160 chars max
 * - readTime: derived from word count when missing
 *
 * Only fills EMPTY values — never overwrites editor-provided content.
 */

const BRAND = "Rasel Hossain";

/**
 * Placeholder / prompt-echo detection.
 * The AI meta prompt shows example values ("keyword1", "Common question 1?",
 * "Compelling meta description (120-160 chars)" …). Lazy models sometimes
 * echo those examples verbatim. Such values must NEVER reach the DB —
 * Google reads them as thin/duplicate spam and refuses to index the page
 * (the exact "pending indexing" symptom on this site).
 * Treat placeholders as EMPTY so title-derived fallbacks kick in.
 */
const PLACEHOLDER_RE =
  /keyword\s*\d|step\s*\d+\s*title|detailed\s*step\s*description|common\s*question\s*\d|self-contained\s*detailed\s*answer|compelling\s*(meta|summary|120-160)|seo-optimized\s*title|seo\s*title\s*\(|buyer-facing\s*(meta|card)?\s*(description)?|45-60\s*chars?|120-160\s*chars?|standalone\s*40-60\s*word|direct\s*answer\s*to\s*the\s*post's\s*core\s*question|brief\s*1-2\s*sentence\s*description|topic\s*title\s*here|category\s*name|concrete\s*item\s*\d|tech\s*\d|buyer\s*segment\s*\d|capability\s*\d|buyer\s*question\s*\d/i;

export function isPlaceholderText(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const t = v.trim();
  if (!t) return false;
  return PLACEHOLDER_RE.test(t);
}

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Empty OR placeholder counts as missing. */
function usable(v: unknown): string {
  const t = clean(v);
  if (!t || isPlaceholderText(t)) return "";
  return t;
}

function cap(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3).trimEnd() + "...";
}

export function fallbackMetaTitle(title: string, metaTitle?: unknown): string {
  const given = usable(metaTitle);
  if (given) return cap(given, 60);
  const t = clean(title);
  if (!t) return BRAND;
  return cap(`${t} | ${BRAND}`, 60);
}

export function fallbackMetaDescription(
  metaDescription: unknown,
  excerpt: unknown,
  description: unknown
): string {
  const given = usable(metaDescription);
  if (given) return cap(given, 160);
  return cap(usable(excerpt) || clean(description), 160);
}

export function computeReadTime(content: unknown, current?: unknown): string {
  const given = clean(current);
  if (given) return given;
  const text = clean(content);
  if (!text) return "5 min read";
  const words = text.split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / 200))} min read`;
}

export interface SeoInput {
  title?: unknown;
  description?: unknown;
  excerpt?: unknown;
  content?: unknown;
  metaTitle?: unknown;
  metaDescription?: unknown;
  readTime?: unknown;
}

/** Fill empty SEO fields; returns the three fields ready for Prisma. */
export function applySeoFallbacks(d: SeoInput): {
  metaTitle: string;
  metaDescription: string;
  readTime: string;
} {
  const title = clean(d.title);
  return {
    metaTitle: fallbackMetaTitle(title, d.metaTitle),
    metaDescription: fallbackMetaDescription(
      d.metaDescription,
      d.excerpt,
      d.description
    ),
    readTime: computeReadTime(d.content, d.readTime),
  };
}

/** Drop placeholder keywords/tags, keep real ones (max 8). */
export function sanitizeStrArray(v: unknown, max = 8): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    const s = clean(x);
    if (!s || s.length > 80 || isPlaceholderText(s)) continue;
    if (out.some((o) => o.toLowerCase() === s.toLowerCase())) continue;
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/** Drop placeholder FAQ rows; each Q+A must be real text. */
export function sanitizeFaq(
  v: unknown
): Array<{ question: string; answer: string }> {
  if (!Array.isArray(v)) return [];
  const out: Array<{ question: string; answer: string }> = [];
  for (const row of v) {
    if (!row || typeof row !== "object") continue;
    const q = clean((row as { question?: unknown }).question);
    const a = clean((row as { answer?: unknown }).answer);
    if (!q || !a || q.length < 10 || a.length < 20) continue;
    if (isPlaceholderText(q) || isPlaceholderText(a)) continue;
    out.push({ question: q.slice(0, 300), answer: a.slice(0, 1500) });
    if (out.length >= 5) break;
  }
  return out;
}

/** Drop placeholder HowTo rows. */
export function sanitizeHowTo(
  v: unknown
): Array<{ name: string; text: string }> {
  if (!Array.isArray(v)) return [];
  const out: Array<{ name: string; text: string }> = [];
  for (const row of v) {
    if (!row || typeof row !== "object") continue;
    const name = clean((row as { name?: unknown }).name);
    const text = clean((row as { text?: unknown }).text);
    if (!name || !text || name.length < 5 || text.length < 20) continue;
    if (isPlaceholderText(name) || isPlaceholderText(text)) continue;
    out.push({ name: name.slice(0, 200), text: text.slice(0, 1000) });
    if (out.length >= 6) break;
  }
  return out;
}

/** Usable excerpt/speakable, or "" so the caller builds one from content. */
export function sanitizeBlurb(v: unknown, min = 40): string {
  const t = usable(v);
  if (!t || t.length < min) return "";
  return t.slice(0, 400);
}

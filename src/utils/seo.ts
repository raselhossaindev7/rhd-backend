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

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function cap(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3).trimEnd() + "...";
}

export function fallbackMetaTitle(title: string, metaTitle?: unknown): string {
  const given = clean(metaTitle);
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
  const given = clean(metaDescription);
  if (given) return cap(given, 160);
  return cap(clean(excerpt) || clean(description), 160);
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

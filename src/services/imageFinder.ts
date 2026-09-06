// ─── Relevant free images for AI-generated blog posts ─────
// Priority cascade (all free):
//   1. Pexels      — best relevance + reliable CDN (needs free key)
//   2. Openverse   — CC images, keyword search, NO key needed
//   3. Pollinations— AI-generated from the post topic, always related, NO key
//   4. Picsum      — last-resort filler (random content)

interface ImageResult {
  url: string;
  alt: string;
  source: string;
  credit?: string;
}

const PEXELS_API_KEY = process.env.PEXELS_API_KEY || "";
const FETCH_TIMEOUT_MS = 15000;

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Prefer permissive licenses for blog use
function licenseRank(license: string | undefined): number {
  const l = (license || "").toLowerCase();
  if (l === "cc0" || l === "pdm") return 0;
  if (l === "by") return 1;
  if (l === "by-sa") return 2;
  return 3;
}

function stableSeed(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) >>> 0;
  }
  return h % 100000;
}

async function searchPexels(query: string, count: number): Promise<ImageResult[]> {
  const data = await fetchJson(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`,
    { Authorization: PEXELS_API_KEY }
  );
  return (data.photos || []).map((p: any) => ({
    url: p.src?.large2x || p.src?.large || p.src?.original || "",
    alt: p.alt || query,
    source: "pexels",
    credit: p.photographer ? `Photo by ${p.photographer} on Pexels` : undefined,
  }));
}

async function searchOpenverse(query: string, count: number): Promise<ImageResult[]> {
  const data = await fetchJson(
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=${count * 2}&filter_dead=false&page=1`
  );
  const results: any[] = [...(data.results || [])].sort(
    (a, b) => licenseRank(a.license) - licenseRank(b.license)
  );
  return results.map((r: any) => ({
    url: r.url || "",
    alt: r.title || query,
    source: "openverse",
    credit: r.creator
      ? `${r.title || "Image"} by ${r.creator}${r.license ? ` (${String(r.license).toUpperCase()})` : ""}`
      : undefined,
  }));
}

function aiGeneratedImages(query: string, count: number, offset: number): ImageResult[] {
  // Prompt-engineered from the post topic so the visual is always related
  const prompt = `${query} themed professional digital illustration, modern tech blog header style, vibrant, no text`;
  const images: ImageResult[] = [];
  for (let i = 0; i < count; i++) {
    images.push({
      url: `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1200&height=630&nologo=true&seed=${stableSeed(query) + offset + i}`,
      alt: query,
      source: "pollinations",
    });
  }
  return images;
}

function placeholderImages(query: string, count: number, offset: number): ImageResult[] {
  const seed = query.replace(/\s+/g, "-").toLowerCase();
  const images: ImageResult[] = [];
  for (let i = 0; i < count; i++) {
    images.push({
      url: `https://picsum.photos/seed/${seed}-${offset + i}/1200/630`,
      alt: `${query} - Image ${offset + i + 1}`,
      source: "picsum",
    });
  }
  return images;
}

export async function findImages(
  query: string,
  count: number = 3
): Promise<ImageResult[]> {
  const found: ImageResult[] = [];
  const seen = new Set<string>();
  const push = (img: ImageResult) => {
    if (found.length >= count || !img.url || seen.has(img.url)) return;
    seen.add(img.url);
    found.push(img);
  };

  // Pexels + Openverse in parallel (Pexels first for relevance).
  // Openverse gets relaxed query variants too (full → 2 words → 1 word),
  // because its index often misses long 3-word queries.
  const words = query.split(/\s+/).filter(Boolean);
  const variants = [
    query,
    words.slice(0, 2).join(" "),
    words[0] || "",
  ].filter((v, i, arr) => v && arr.indexOf(v) === i);

  const tasks: Promise<ImageResult[]>[] = [];
  if (PEXELS_API_KEY) tasks.push(searchPexels(query, count));
  for (const v of variants) tasks.push(searchOpenverse(v, count));
  const settled = await Promise.allSettled(tasks);

  // Pexels results first (if key configured, it's tasks[0])
  let openverseResults: ImageResult[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") {
      // Identify source by first item (pexels only runs when key exists)
      if (PEXELS_API_KEY && s.value.length && s.value[0].source === "pexels") {
        s.value.forEach(push);
      } else {
        openverseResults = openverseResults.concat(s.value);
      }
    }
  }
  if (settled.some((s) => s.status === "rejected")) {
    console.error("[IMAGE FINDER] A stock source failed, using next source");
  }
  openverseResults.forEach(push);

  // AI-generated topical images fill remaining slots (always related)
  if (found.length < count) {
    aiGeneratedImages(query, count - found.length, found.length).forEach(push);
  }

  // Absolute last resort
  if (found.length < count) {
    placeholderImages(query, count - found.length, found.length).forEach(push);
  }

  return found.slice(0, count);
}

export function extractKeywords(title: string, category: string): string {
  // Extract meaningful keywords from title for image search
  const stopWords = [
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "above", "below",
    "between", "out", "off", "over", "under", "again", "further", "then",
    "once", "here", "there", "when", "where", "why", "how", "all", "both",
    "each", "few", "more", "most", "other", "some", "such", "no", "nor",
    "not", "only", "own", "same", "so", "than", "too", "very", "just",
    "and", "but", "or", "if", "while", "that", "this", "these", "those",
    "what", "which", "who", "whom", "it", "its", "i", "me", "my", "we",
    "our", "you", "your", "he", "him", "his", "she", "her", "they", "them",
    "their",
  ];

  const words = title
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.includes(word))
    .slice(0, 3)
    .join(" ");

  return words || category.toLowerCase();
}

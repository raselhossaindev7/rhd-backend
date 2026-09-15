// ─── Relevant free images for AI-generated blog posts ─────
// Priority cascade (all free, all tech-related — coding / programming /
// computer / AI; NEVER random filler):
//   1. Pexels      — best relevance + reliable CDN (needs free key)
//   2. Pixabay     — keyed stock photos, high relevance (needs free key)
//   3. Unsplash    — keyed stock photos, high relevance (needs Access Key)
//   4. Openverse   — CC images, tech-anchored queries, NO key needed
//   5. Wikimedia   — Commons API, fully open-licensed, NO key needed
//   6. LoremFlickr — keyword-based photos, NO key needed
//   7. Pollinations— AI-generated from the post topic, always related, NO key
// Picsum was deliberately removed: random photos (landscapes, objects)
// break the tech look of the blog.

interface ImageResult {
  url: string;
  alt: string;
  source: string;
  credit?: string;
}

const PEXELS_API_KEY = process.env.PEXELS_API_KEY || "";
const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY || "";
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || "";
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

// Random result page per call so back-to-back posts with the same query
// (e.g. the same category tech query) don't all get page-1's top photos.
function randomPage(max: number = 5): number {
  return 1 + Math.floor(Math.random() * max);
}

/** Normalize a URL for reuse comparison (ignore volatile query params). */
export function normalizeImageUrl(url: string): string {
  try {
    const u = new URL(String(url || ""));
    // Pollinations embeds the seed in params — same seed = same picture,
    // different cache-busters must still count as reuse.
    if (u.hostname.includes("pollinations.ai")) {
      return `${u.origin}${u.pathname}?seed=${u.searchParams.get("seed") || ""}`;
    }
    u.search = "";
    u.hash = "";
    return u.toString().replace(/\/+$/, "");
  } catch {
    return String(url || "").split("?")[0].replace(/\/+$/, "");
  }
}

async function searchPexels(query: string, count: number): Promise<ImageResult[]> {
  const data = await fetchJson(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&page=${randomPage()}&orientation=landscape`,
    { Authorization: PEXELS_API_KEY }
  );
  return (data.photos || []).map((p: any) => ({
    url: p.src?.large2x || p.src?.large || p.src?.original || "",
    alt: p.alt || query,
    source: "pexels",
    credit: p.photographer ? `Photo by ${p.photographer} on Pexels` : undefined,
  }));
}

async function searchPixabay(query: string, count: number): Promise<ImageResult[]> {
  // Docs: https://pixabay.com/api/docs/ — key passed as `key` query param.
  // per_page accepts 3-200; safesearch keeps blog images safe.
  const perPage = Math.min(200, Math.max(3, count));
  const data = await fetchJson(
    `https://pixabay.com/api/?key=${encodeURIComponent(PIXABAY_API_KEY)}` +
      `&q=${encodeURIComponent(query)}&image_type=photo&orientation=horizontal` +
      `&safesearch=true&per_page=${perPage}&page=${randomPage()}`
  );
  return ((data.hits || []) as any[])
    .filter((h) => h?.largeImageURL || h?.webformatURL || h?.previewURL)
    .map((h: any) => ({
      url: h.largeImageURL || h.webformatURL || h.previewURL || "",
      alt: h.tags || query,
      source: "pixabay",
      credit: h.user ? `Image by ${h.user} on Pixabay` : undefined,
    }));
}

async function searchUnsplash(query: string, count: number): Promise<ImageResult[]> {
  // Docs: https://unsplash.com/documentation#search-photos — public search
  // uses the Access Key via `Authorization: Client-ID <key>`.
  // Unsplash demo apps are rate-limited to 50 req/hour, so one call per post.
  const perPage = Math.min(30, Math.max(3, count));
  const data = await fetchJson(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}` +
      `&page=${randomPage()}&per_page=${perPage}&orientation=landscape&content_filter=high`,
    { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` }
  );
  return ((data.results || []) as any[])
    .filter((r) => r?.urls?.regular || r?.urls?.small || r?.urls?.raw)
    .map((r: any) => ({
      url: r.urls?.regular || r.urls?.small || r.urls?.raw || "",
      alt: r.alt_description || r.description || query,
      source: "unsplash",
      credit: r.user?.name ? `Photo by ${r.user.name} on Unsplash` : "via Unsplash",
    }));
}

// Every scheduled post is about tech — map its category to a stock-photo
// query that can ONLY return coding/computer/AI imagery. Used as the
// fallback query so a generic title word (e.g. "building") can never
// resolve to buildings/architecture photos.
const CATEGORY_TECH_QUERY: Record<string, string> = {
  Programming: "programming code computer",
  WordPress: "website cms blog development",
  "Digital Marketing": "seo marketing analytics dashboard",
  AI: "artificial intelligence robot technology",
  "Web & SaaS": "website development programming",
  "AI & Automation": "artificial intelligence robot technology",
  Mobile: "mobile app development smartphone",
  "E-commerce": "laptop online shopping technology",
  "Business Software": "business software dashboard",
  Deployment: "server deployment technology",
  Website: "website development programming code",
  "Mobile App": "smartphone app development",
  DevOps: "server code deployment technology",
  "SEO & Marketing": "seo marketing digital analytics",
};
const DEFAULT_TECH_QUERY = "programming code computer";

export function techQueryFor(category: string): string {
  return CATEGORY_TECH_QUERY[category] || DEFAULT_TECH_QUERY;
}

async function searchOpenverse(query: string, count: number): Promise<ImageResult[]> {
  const data = await fetchJson(
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=${count * 2}&filter_dead=true&page=${randomPage()}&license_type=all`
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

function stripHtml(html: string): string {
  return String(html || "").replace(/<[^>]*>/g, "").trim().slice(0, 80);
}

// Wikimedia Commons: fully open-licensed, no key, hotlinkable thumbnails.
async function searchWikimedia(query: string, count: number): Promise<ImageResult[]> {
  const data = await fetchJson(
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search` +
    `&gsrsearch=${encodeURIComponent("filetype:bitmap " + query)}&gsrnamespace=6&gsrlimit=${count * 2}` +
    `&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=1200`
  );
  const pages: any[] = Object.values((data as any)?.query?.pages || {});
  return pages
    .filter((p) => p?.imageinfo?.[0]?.thumburl || p?.imageinfo?.[0]?.url)
    .map((p) => {
      const info = p.imageinfo[0];
      const meta = info.extmetadata || {};
      const artist = meta.Artist?.value ? stripHtml(meta.Artist.value) : "";
      return {
        url: info.thumburl || info.url || "",
        alt: String(p.title || query).replace(/^File:/, "").replace(/\.[a-z]+$/i, "").replace(/_/g, " "),
        source: "wikimedia",
        credit: artist ? `${artist} via Wikimedia Commons` : "via Wikimedia Commons",
      };
    });
}

// LoremFlickr: keyword-based photos, no key. `lock=` pins one deterministic
// photo per URL, so every post gets its own unique (but stable) picture.
function loremFlickrImages(
  query: string,
  count: number,
  excludeNormalized?: Set<string>
): ImageResult[] {
  const keywords = query.split(/\s+/).filter(Boolean).slice(0, 3).join(",") || "technology";
  const images: ImageResult[] = [];
  let guard = 0;
  while (images.length < count && guard < count * 10 + 10) {
    guard++;
    const lock = Math.floor(Math.random() * 1000000);
    const url = `https://loremflickr.com/1200/630/${encodeURIComponent(keywords)}?lock=${lock}`;
    if (excludeNormalized?.has(normalizeImageUrl(url))) continue;
    images.push({ url, alt: query, source: "loremflickr" });
  }
  return images;
}

function aiGeneratedImages(
  query: string,
  count: number,
  offset: number,
  excludeNormalized?: Set<string>
): ImageResult[] {
  // Prompt-engineered from the post topic + hard tech anchoring, so the
  // visual always shows coding / computers / AI — never generic subjects.
  const prompt = `${query}, software programming theme, developer workspace with computer code on screen, professional digital illustration, modern tech blog header style, vibrant, no text, no watermark`;
  const images: ImageResult[] = [];
  // Random base per call: the same topic re-generated later must not
  // reproduce the identical picture (stableSeed alone would repeat it).
  let seed = stableSeed(query + "|" + Date.now() + "|" + Math.floor(Math.random() * 100000)) + offset;
  let guard = 0;
  while (images.length < count && guard < count * 10 + 10) {
    guard++;
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1200&height=630&nologo=true&seed=${seed}`;
    seed++;
    if (excludeNormalized?.has(normalizeImageUrl(url))) continue;
    images.push({ url, alt: query, source: "pollinations" });
  }
  return images;
}

export interface FindImagesOptions {
  /** Recently used image URLs — these are skipped, never returned. */
  exclude?: string[];
}

export async function findImages(
  query: string,
  count: number = 3,
  category: string = "",
  options: FindImagesOptions = {}
): Promise<ImageResult[]> {
  const found: ImageResult[] = [];
  const seen = new Set<string>();
  const excluded = new Set((options.exclude || []).map(normalizeImageUrl));
  const push = (img: ImageResult) => {
    if (found.length >= count || !img.url || seen.has(img.url)) return;
    // Skip non-image URLs (Openverse sometimes returns page links)
    if (!/^https:\/\//.test(img.url)) return;
    // Skip photos already used on recent posts
    if (excluded.has(normalizeImageUrl(img.url))) return;
    seen.add(img.url);
    found.push(img);
  };

  // Pexels + Pixabay + Unsplash + Openverse in parallel (keyed sources first).
  // Query variants relax full → 2 words → CATEGORY tech query, because
  // Openverse often misses long queries. The bare first-word fallback is
  // deliberately GONE: "building progressive web" → "building" returned
  // architecture photos. The category tech query guarantees
  // coding/computer/AI imagery instead.
  const words = query.split(/\s+/).filter(Boolean);
  const variants = [
    query,
    words.slice(0, 2).join(" "),
    techQueryFor(category),
  ].filter((v, i, arr) => v && arr.indexOf(v) === i);

  const tasks: Promise<ImageResult[]>[] = [];
  // Over-fetch stock candidates: recently used photos are filtered out
  // below, so the pool needs headroom to still fill `count` slots.
  if (PEXELS_API_KEY) tasks.push(searchPexels(`${query} programming`, count * 2));
  if (PIXABAY_API_KEY) tasks.push(searchPixabay(`${query} programming`, count * 2));
  if (UNSPLASH_ACCESS_KEY) tasks.push(searchUnsplash(`${query} programming`, count * 2));
  for (const v of variants) tasks.push(searchOpenverse(v, count));
  // Wikimedia Commons: 2 tech-anchored searches (full query would miss).
  tasks.push(searchWikimedia(`${query} computer`, count));
  tasks.push(searchWikimedia(techQueryFor(category), count));
  const settled = await Promise.allSettled(tasks);

  // Keyed stock results first (Pexels / Pixabay / Unsplash, only run when keys exist)
  let stockResults: ImageResult[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") {
      // Identify keyed source by first item (they only run when keys exist)
      const src = s.value.length ? s.value[0].source : "";
      if (src === "pexels" || src === "pixabay" || src === "unsplash") {
        s.value.forEach(push);
      } else {
        stockResults = stockResults.concat(s.value);
      }
    }
  }
  if (settled.some((s) => s.status === "rejected")) {
    console.error("[IMAGE FINDER] A stock source failed, using next source");
  }
  stockResults.forEach(push);

  // Keyword photos (no key) before AI generation — real photography first.
  if (found.length < count) {
    loremFlickrImages(`${query} ${techQueryFor(category)}`, count - found.length, excluded).forEach(push);
  }

  // AI-generated topical images fill ALL remaining slots (always related,
  // free, no key). This is also the last resort — never random filler.
  if (found.length < count) {
    aiGeneratedImages(query, count - found.length, found.length, excluded).forEach(push);
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

import prisma from "../config/db";
import { getGscOpportunities, GscOpportunity } from "./gscSignals";
import { getYoutubeTrendingTech } from "./youtubeSignals";

// ─── Real Google demand signals (100% free, keyless) ─────
// The autopilot used to invent topics from the model's parametric memory
// ("trending in 2026" from training data). This module grounds every refill
// in what people ACTUALLY typed into Google recently:
//
//   1. Google Trends dailyTrends (US) — what spiked in the last 24h
//   2. Google Trends relatedQueries — rising queries around each category
//   3. Google Autocomplete (suggestqueries) — real user phrasings
//      ("how to…", "best … 2026", "… vs …") for each category seed
//
// Everything is best-effort: any failure returns [] and the generators fall
// back to pure-AI topics. Results are cached 6h in memory so cron + manual
// clicks never hammer Google (unofficial endpoints 429 fast).

// eslint-disable-next-line @typescript-eslint/no-require-imports
const googleTrends = require("google-trends-api");

const FETCH_TIMEOUT_MS = 12000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// One seed per category keeps the per-refill HTTP budget tiny
// (~8 calls). Seeds are buyer/dev-intent angled, US wording.
export const BLOG_DEMAND_SEEDS: Record<string, string[]> = {
  "Web Development": ["Next.js", "React Server Components"],
  "AI & Automation": ["AI agents", "n8n automation"],
  DevOps: ["Docker", "CI/CD pipeline"],
  "Full Stack": ["Node.js API", "PostgreSQL"],
  "Mobile Apps": ["React Native", "Expo"],
  "E-commerce": ["headless commerce", "Stripe checkout"],
  "System Design": ["system design interview", "microservices"],
  Career: ["freelance developer", "get clients programming"],
  Tutorial: ["TypeScript tutorial", "Tailwind CSS"],
  "Case Study": ["SaaS case study", "startup tech stack"],
};

export const SERVICE_DEMAND_SEEDS: Record<string, string[]> = {
  Website: ["website development", "Next.js development service"],
  "Mobile App": ["mobile app development", "React Native app development"],
  WordPress: ["WordPress development", "WordPress website service"],
  Deployment: ["website deployment", "VPS deployment service"],
  "SEO & Marketing": ["SEO services", "SEO marketing agency"],
  "E-commerce": ["ecommerce website development", "Shopify headless"],
  "Business Software": ["CRM development", "ERP software"],
  "AI & Automation": ["AI chatbot development", "workflow automation service"],
};

// Daily-trends firehose is mostly news/sports — keep only tech intent so a
// football final can never become a blog topic.
const TECH_INTENT =
  /ai\b|artificial|code|coding|program|software|app\b|apps\b|web\b|site|cloud|server|data\b|cyber|hack|robot|tech\b|gadget|phone|iphone|android|google|microsoft|openai|github|startup|saas|devops|docker|python|javascript|typescript/i;

// ─── Ranker: every signal becomes a 0-100 score, then merged ──
// Weights mirror intent strength: your own GSC impressions (proven,
// site-specific) > Google related/rising (search intent) > Autocomplete
// rank (type intent) > YouTube views × 0.8 (watch intent, not search).
// A query seen in N sources gets +10 per extra source (cap +20) —
// cross-source agreement is the strongest "best rank" signal of all.

export interface RankedQuery {
  query: string;
  score: number;
  sources: string[];
}

function cleanQuery(v: unknown): string {
  return String(v || "").trim().replace(/\s+/g, " ");
}

class Ranker {
  private map = new Map<string, RankedQuery>();

  add(query: string, score: number, source: string): void {
    const q = cleanQuery(query);
    if (q.length < 4 || q.length > 120) return;
    // Single-token suggestions ("expo", "export") are navigational noise,
    // not article intents — but never drop your own GSC data.
    if (source !== "gsc" && !/\s/.test(q)) return;
    // Dictionary/entertainment intents never convert on a dev portfolio.
    if (
      source !== "gsc" &&
      /meaning in|translate to|lyrics|movie download|free download|crack(ed)?\b|whatsapp status|tiktok/i.test(q)
    )
      return;
    const key = q.toLowerCase();
    const cur = this.map.get(key);
    if (!cur) {
      this.map.set(key, { query: q, score: Math.min(100, score), sources: [source] });
      return;
    }
    if (!cur.sources.includes(source)) {
      cur.sources.push(source);
      // cross-source bonus: capped so one viral hit can't lap the field
      cur.score = Math.min(100, cur.score + score * 0.5 + 10);
    } else {
      cur.score = Math.min(100, Math.max(cur.score, score));
    }
  }

  top(n: number): RankedQuery[] {
    return [...this.map.values()].sort((a, b) => b.score - a.score).slice(0, n);
  }
}

// GSC: log-scaled impressions + striking-distance position bonus.
function gscScore(o: GscOpportunity): number {
  let s = Math.min(60, 20 * Math.log10(o.impressions + 1));
  if (o.position >= 5 && o.position <= 10) s += 25;
  else if (o.position > 10 && o.position <= 20) s += 15;
  else if (o.position > 20 && o.position <= 30) s += 8;
  if (o.impressions >= 50 && o.ctr < 0.03) s += 10; // intent mismatch = new-angle opening
  return Math.min(100, s);
}

// YouTube: log-scaled views, discounted hard (watch intent ≠ search intent,
// and viral gadget-hype must never outrank buyer queries).
function youtubeScore(views: number): number {
  return Math.min(100, Math.min(45, 8 * Math.log10(views + 1)) * 0.7);
}

// Trends related: rising (breakout) beats top (established).
function relatedScore(rising: boolean): number {
  return rising ? 45 : 30;
}

// Autocomplete: earlier suggestion = more typed = stronger.
function autocompleteScore(rank: number): number {
  return Math.max(10, 40 - rank * 3);
}

// Breaking daily trend with tech intent: flat spike score.
const TREND_SPIKE_SCORE = 35;

async function fetchDailyTrendsUS(cap: number): Promise<string[]> {
  try {
    const raw = await googleTrends.dailyTrends({ geo: "US", hl: "en-US" });
    const rawStr = typeof raw === "string" ? raw : JSON.stringify(raw);
    // Google sometimes returns HTML (CAPTCHA / block page) instead of JSON
    if (rawStr.trimStart().startsWith("<")) {
      console.warn("[DEMAND] dailyTrends returned HTML (CAPTCHA blocked) — skipping");
      return [];
    }
    const data = JSON.parse(rawStr);
    const days: any[] = data?.default?.trendingSearchesDays || [];
    const out: string[] = [];
    for (const d of days) {
      for (const t of d?.trendingSearches || []) {
        const q = t?.title?.query;
        if (q && TECH_INTENT.test(q)) out.push(q);
        // related queries attached to the trend are pre-filtered by Google
        for (const r of t?.relatedQueries || []) {
          if (r?.query && TECH_INTENT.test(r.query)) out.push(r.query);
        }
      }
    }
    return [...new Set(out)].slice(0, cap);
  } catch (err) {
    console.warn("[DEMAND] dailyTrends failed:", (err as Error)?.message || err);
    return [];
  }
}

async function fetchRelatedQueries(seed: string, cap: number): Promise<Array<{ query: string; rising: boolean }>> {
  try {
    const raw = await googleTrends.relatedQueries({
      keyword: seed,
      hl: "en-US",
      geo: "US",
    });
    const rawStr = typeof raw === "string" ? raw : JSON.stringify(raw);
    if (rawStr.trimStart().startsWith("<")) {
      console.warn(`[DEMAND] relatedQueries returned HTML for "${seed}" — skipping`);
      return [];
    }
    const data = JSON.parse(rawStr);
    // rankedList[0] = TOP, rankedList[1] = RISING (Google's fixed order).
    const lists: any[] = data?.default?.rankedList || [];
    const out: Array<{ query: string; rising: boolean }> = [];
    lists.slice(0, 2).forEach((l, idx) => {
      for (const k of l?.rankedKeyword || []) {
        if (k?.query) out.push({ query: k.query, rising: idx === 1 });
      }
    });
    const seen = new Set<string>();
    return out.filter((r) => {
      const key = r.query.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, cap);
  } catch (err) {
    console.warn(`[DEMAND] relatedQueries failed for "${seed}":`, (err as Error)?.message || err);
    return [];
  }
}

async function fetchAutocomplete(seed: string, cap: number): Promise<Array<{ query: string; rank: number }>> {
  try {
    const res = await fetch(
      `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(seed)}&hl=en&gl=us`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();
    const suggestions: string[] = Array.isArray(data?.[1]) ? data[1] : [];
    const seen = new Set<string>();
    const out: Array<{ query: string; rank: number }> = [];
    suggestions.forEach((s, rank) => {
      const q = cleanQuery(s);
      if (!q || seen.has(q.toLowerCase())) return;
      seen.add(q.toLowerCase());
      out.push({ query: q, rank });
    });
    return out.slice(0, cap);
  } catch (err) {
    console.warn(`[DEMAND] autocomplete failed for "${seed}":`, (err as Error)?.message || err);
    return [];
  }
}

export interface DemandResult {
  /** Top-ranked real user queries (best rank first). Empty = collectors failed. */
  queries: string[];
  /** Full ranking with per-source scores — for logs/debugging. */
  ranked: RankedQuery[];
  /** Categories these queries were pulled for (least-covered first). */
  categories: string[];
  /** Where each chunk came from — logged, never sent to AI. */
  debug: { trends: number; related: number; autocomplete: number; gsc: number; youtube: number };
}

/**
 * Categories with the fewest live assets get priority, so every category
 * earns posts over time instead of the AI camping on "AI & Automation".
 * Coverage = PENDING topics + posts from the last 90 days.
 */
export async function leastCoveredBlogCategories(n: number): Promise<string[]> {
  const all = Object.keys(BLOG_DEMAND_SEEDS);
  try {
    const [pending, recent] = await Promise.all([
      prisma.topic.groupBy({ by: ["category"], where: { status: "PENDING" }, _count: { category: true } }),
      prisma.post.groupBy({
        by: ["category"],
        where: { date: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
        _count: { category: true },
      }),
    ]);
    const score = new Map<string, number>();
    for (const c of all) score.set(c, 0);
    for (const g of pending) score.set(g.category, (score.get(g.category) || 0) + g._count.category * 2);
    for (const g of recent) score.set(g.category, (score.get(g.category) || 0) + g._count.category);
    return [...all].sort((a, b) => (score.get(a) || 0) - (score.get(b) || 0)).slice(0, n);
  } catch {
    return all.slice(0, n);
  }
}

export async function leastCoveredServiceCategories(n: number): Promise<string[]> {
  const all = Object.keys(SERVICE_DEMAND_SEEDS);
  try {
    const [pending, live] = await Promise.all([
      prisma.serviceTopic.groupBy({ by: ["category"], where: { status: "PENDING" }, _count: { category: true } }),
      prisma.service.groupBy({ by: ["category"], _count: { category: true } }),
    ]);
    const score = new Map<string, number>();
    for (const c of all) score.set(c, 0);
    for (const g of pending) score.set(g.category, (score.get(g.category) || 0) + g._count.category * 2);
    for (const g of live) score.set(g.category, (score.get(g.category) || 0) + g._count.category * 3);
    return [...all].sort((a, b) => (score.get(a) || 0) - (score.get(b) || 0)).slice(0, n);
  } catch {
    return all.slice(0, n);
  }
}

let blogCache: { at: number; value: DemandResult } | null = null;
let serviceCache: { at: number; value: DemandResult } | null = null;

async function collect(
  seeds: Record<string, string[]>,
  categories: string[],
  gscOpps: GscOpportunity[],
  perSeedRelated: number,
  perSeedComplete: number
): Promise<DemandResult> {
  const ranker = new Ranker();
  const debug = { trends: 0, related: 0, autocomplete: 0, gsc: gscOpps.length, youtube: 0 };

  for (const o of gscOpps) ranker.add(o.query, gscScore(o), "gsc");

  const [trends, yt] = await Promise.all([fetchDailyTrendsUS(8), getYoutubeTrendingTech(12)]);
  debug.trends = trends.length;
  debug.youtube = yt.length;
  for (const t of trends) ranker.add(t, TREND_SPIKE_SCORE, "trends");
  for (const v of yt) ranker.add(v.title, youtubeScore(v.views), "youtube");

  for (const cat of categories) {
    const catSeeds = seeds[cat] || [];
    for (const seed of catSeeds.slice(0, 1)) {
      const rel = await fetchRelatedQueries(seed, perSeedRelated);
      debug.related += rel.length;
      for (const r of rel) ranker.add(r.query, relatedScore(r.rising), r.rising ? "rising" : "related");
    }
    for (const seed of catSeeds.slice(0, 2)) {
      const ac = await fetchAutocomplete(seed, perSeedComplete);
      debug.autocomplete += ac.length;
      for (const a of ac) ranker.add(a.query, autocompleteScore(a.rank), "autocomplete");
    }
  }

  const ranked = ranker.top(30);
  const queries = ranked.map((r) => r.query);
  return { queries, ranked, categories, debug };
}

function logDemand(kind: string, value: DemandResult): void {
  const top = value.ranked
    .slice(0, 5)
    .map((r) => `"${r.query}" (${Math.round(r.score)}:${r.sources.join("+")})`)
    .join(", ");
  console.log(
    `[DEMAND] ${kind}: ${value.queries.length} ranked queries for [${value.categories.join(", ")}] ` +
      `(trends:${value.debug.trends} related:${value.debug.related} ac:${value.debug.autocomplete} gsc:${value.debug.gsc} yt:${value.debug.youtube}) ` +
      `top: ${top || "none"}`
  );
}

export async function getBlogDemand(gscOpps: GscOpportunity[] = [], force = false): Promise<DemandResult> {
  if (!force && blogCache && Date.now() - blogCache.at < CACHE_TTL_MS) return blogCache.value;
  const cats = await leastCoveredBlogCategories(3);
  const value = await collect(BLOG_DEMAND_SEEDS, cats, gscOpps, 5, 6);
  blogCache = { at: Date.now(), value };
  logDemand("blog", value);
  return value;
}

export async function getServiceDemand(gscOpps: GscOpportunity[] = [], force = false): Promise<DemandResult> {
  if (!force && serviceCache && Date.now() - serviceCache.at < CACHE_TTL_MS) return serviceCache.value;
  const cats = await leastCoveredServiceCategories(2);
  const value = await collect(SERVICE_DEMAND_SEEDS, cats, gscOpps, 5, 6);
  serviceCache = { at: Date.now(), value };
  logDemand("service", value);
  return value;
}

// ─── One-call entry points (GSC first, keyless collectors fill gaps) ──
// GSC is uncached (cheap: 2 fetches) but the Trends/Autocomplete layer
// below still caches 6h — pass force=true to bypass everything.

export async function getBlogDemandWithGsc(force = false): Promise<DemandResult> {
  const gsc = await getGscOpportunities(15);
  return getBlogDemand(gsc, force);
}

export async function getServiceDemandWithGsc(force = false): Promise<DemandResult> {
  const gsc = await getGscOpportunities(15);
  return getServiceDemand(gsc, force);
}

// ─── YouTube trending demand (free, API-key only) ───────
// What the US is actually WATCHING in Science & Technology right now.
// videos.list?chart=mostPopular costs 1 quota unit per call (10,000/day
// free) — with the 6h demand cache that's ~4 units/day. The expensive
// search.list endpoint (100 units/call) is deliberately NOT used.
//
// Titles skew "what people click", queries skew "what people type" —
// together they cover both discovery intents for topic generation.

const API = "https://www.googleapis.com/youtube/v3/videos";

// Trending is often gadget-hype (today: all iPhone) — keep only titles
// with dev/buyer relevance so a phone launch can't hijack the dev blog.
const DEV_RELEVANT =
  /ai\b|artificial|code|cod(?:ing|e)|program|software|develop|app\b|web\b|site|startup|saas|robot|chatgpt|openai|gemini|Muse|google|microsoft|nvidia|chip|data\b|cloud|cyber|hack|linux|github|vscode|api\b|automat/i;

export interface YoutubeTrend {
  title: string;
  views: number;
}

export async function getYoutubeTrendingTech(limit = 12): Promise<YoutubeTrend[]> {
  // Dedicated YouTube key first, generic Google key as fallback.
  const key = process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!key) return [];
  try {
    const url =
      `${API}?part=snippet,statistics&chart=mostPopular` +
      `&videoCategoryId=28&regionCode=US&maxResults=25&key=${encodeURIComponent(key)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.warn("[DEMAND] youtube trending failed:", res.status, (await res.text()).slice(0, 160));
      return [];
    }
    const data: any = await res.json();
    const seen = new Set<string>();
    const out: YoutubeTrend[] = [];
    for (const item of data.items || []) {
      const title = String(item?.snippet?.title || "").trim().replace(/\s+/g, " ");
      if (title.length < 15 || title.length > 110) continue;
      if (/[#|｜]?(shorts|#shorts)/i.test(title)) continue;
      if (!DEV_RELEVANT.test(title)) continue;
      const low = title.toLowerCase();
      if (seen.has(low)) continue;
      seen.add(low);
      out.push({ title, views: parseInt(item?.statistics?.viewCount || "0", 10) || 0 });
      if (out.length >= limit) break;
    }
    return out;
  } catch (err) {
    console.warn("[DEMAND] youtube trending error:", (err as Error)?.message || err);
    return [];
  }
}

// ─── Google Search Console demand (100% free, no extra deps) ─
// Your OWN property's real queries: impressions + position per query.
// This is the strongest possible topic signal — "queries Google already
// shows you for, but you rank #8-20 for" = guaranteed-indexable topics
// with proven demand. Feeds getBlogDemand()/getServiceDemand() as
// first-priority seeds; everything else (Trends/Autocomplete) fills gaps.
//
// Setup (one-time, ~10 min, all free):
//   1. https://console.cloud.google.com → new project → enable
//      "Google Search Console API"
//   2. OAuth consent screen (External, test mode is fine for own use) →
//      create OAuth client (Desktop) → note client ID + secret
//   3. https://developers.google.com/oauthplayground → gear icon →
//      "Use your own OAuth credentials" (ID + secret) → select
//      "Search Console API v1 → https://www.googleapis.com/auth/webmasters.readonly"
//      → Authorize → Exchange code for tokens → copy refresh_token
//   4. Put the 4 values in backend .env (see .env.example) + restart.
// Without them every function below returns [] and logs ONE hint.

const TOKEN_URL = "https://oauth2.googleapis.com/token";

let hintLogged = false;
function creds(): { clientId: string; clientSecret: string; refreshToken: string; siteUrl: string } | null {
  const c = {
    clientId: process.env.GSC_CLIENT_ID || "",
    clientSecret: process.env.GSC_CLIENT_SECRET || "",
    refreshToken: process.env.GSC_REFRESH_TOKEN || "",
    siteUrl: process.env.GSC_SITE_URL || "",
  };
  if (!c.clientId || !c.clientSecret || !c.refreshToken || !c.siteUrl) {
    if (!hintLogged) {
      hintLogged = true;
      console.log("[GSC] Not configured — skipping Search Console demand (see .env.example → GSC). Trends + Autocomplete still active.");
    }
    return null;
  }
  return c;
}

async function accessToken(c: NonNullable<ReturnType<typeof creds>>): Promise<string | null> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: c.clientId,
        client_secret: c.clientSecret,
        refresh_token: c.refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn("[GSC] Token refresh failed:", res.status, (await res.text()).slice(0, 160));
      return null;
    }
    const data: any = await res.json();
    return data.access_token || null;
  } catch (err) {
    console.warn("[GSC] Token refresh error:", (err as Error)?.message || err);
    return null;
  }
}

export interface GscOpportunity {
  query: string;
  impressions: number;
  position: number;
  ctr: number;
}

/**
 * Queries with real impressions where a new/better page can win:
 * position 5-25 (striking distance) OR high impressions + low CTR
 * (intent mismatch = new angle opportunity). Sorted by impressions desc.
 */
export async function getGscOpportunities(limit = 15): Promise<GscOpportunity[]> {
  const c = creds();
  if (!c) return [];
  try {
    const token = await accessToken(c);
    if (!token) return [];
    const end = new Date();
    const start = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    // Demand is best-effort: single attempt, empty on any failure.
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(c.siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: fmt(start),
          endDate: fmt(end),
          dimensions: ["query"],
          rowLimit: 100,
        }),
        signal: AbortSignal.timeout(20000),
      }
    );
    if (!res.ok) {
      console.warn("[GSC] Query failed:", res.status, (await res.text()).slice(0, 200));
      return [];
    }
    const data: any = await res.json();
    const rows: any[] = data.rows || [];
    return rows
      .map((r) => ({
        query: String(r.keys?.[0] || "").trim(),
        impressions: r.impressions || 0,
        position: r.position || 99,
        ctr: r.ctr || 0,
      }))
      .filter((r) => r.query.length > 3 && r.impressions >= 5)
      .filter((r) => (r.position >= 5 && r.position <= 30) || (r.impressions >= 50 && r.ctr < 0.03))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, limit);
  } catch (err) {
    console.warn("[GSC] Fetch error:", (err as Error)?.message || err);
    return [];
  }
}

/** Plain query strings for the demand pipeline (most impressions first). */
export async function getGscQueries(limit = 15): Promise<string[]> {
  const opps = await getGscOpportunities(limit);
  if (opps.length) {
    console.log(`[GSC] ${opps.length} opportunities (top: "${opps[0].query}" ${opps[0].impressions} impr, pos ${opps[0].position.toFixed(1)})`);
  }
  return opps.map((o) => o.query);
}

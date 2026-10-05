/**
 * Repair broken in-article / cover images on published posts.
 *
 * Root cause: autopilot embedded Pixabay `…/get/…` CDN URLs directly into
 * post content. Those tokens expire (HTTP 400 + HTML body once stale), so
 * ~21 posts show broken-image icons mid-article. New posts are fixed at
 * generation time (R2 rehost in imageFinder.ts); this script repairs the
 * already-published rows by swapping each dead URL for a freshly sourced
 * + R2-rehosted image.
 *
 * Usage (backend dir):
 *   npx tsx src/scripts/fix-broken-content-images.ts            # dry run
 *   npx tsx src/scripts/fix-broken-content-images.ts --apply    # write to DB
 */
import prisma from "../config/db";
import {
  findImages,
  extractKeywords,
  rehostImagesToR2,
} from "../services/imageFinder";

const APPLY = process.argv.includes("--apply");
const CHECK_TIMEOUT_MS = 20000;

function extractContentUrls(content: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (u: string) => {
    const t = (u || "").trim();
    if (t && /^https:\/\//.test(t) && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  };
  for (const m of content.matchAll(/!\[[^\]]*\]\((https:[^)\s]+)/g)) push(m[1]);
  for (const m of content.matchAll(/<img[^>]+src="([^"]+)"/g)) push(m[1]);
  return out;
}

async function isBroken(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      headers: { "User-Agent": "raselhossain.dev autopilot" },
    });
    if (res.status >= 400) return true;
    const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    // No content-type or a non-image body (Pixabay serves an error page
    // with 400, but be strict in general) counts as broken.
    if (!ct || !ct.startsWith("image/")) return true;
    // Drain the body so the socket closes promptly.
    await res.arrayBuffer().catch(() => undefined);
    return false;
  } catch {
    return true;
  }
}

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY (writing to DB)" : "DRY RUN (no writes)"}`);
  const posts = await prisma.post.findMany({
    where: { published: true },
    select: { id: true, slug: true, title: true, category: true, content: true, image: true, ogImage: true },
    orderBy: { createdAt: "desc" },
  });
  console.log(`Scanning ${posts.length} published posts…`);

  let postsFixed = 0;
  let urlsReplaced = 0;
  let urlsUnfixable = 0;

  for (const p of posts) {
    const content = p.content || "";
    const contentUrls = extractContentUrls(content);
    const coverUrls = [p.image, p.ogImage].filter(
      (u): u is string => !!u && /^https:\/\//.test(u)
    );
    const all = [...new Set([...contentUrls, ...coverUrls])];
    if (!all.length) continue;

    const broken: string[] = [];
    for (const u of all) {
      if (await isBroken(u)) broken.push(u);
    }
    if (!broken.length) continue;

    console.log(`\n[${p.slug}] ${broken.length} broken URL(s)`);
    for (const u of broken) console.log(`  dead: ${u.slice(0, 110)}`);

    // Fresh candidates: one per broken URL, excluding the dead ones.
    // Dry runs skip the R2 upload so no orphaned objects are created.
    const keywords = extractKeywords(p.title || "", p.category || "");
    const found = await findImages(keywords, broken.length, p.category || "", {
      exclude: broken,
    }).catch(() => []);
    const fresh = APPLY ? await rehostImagesToR2(found, "blog") : found;
    if (!fresh.length) {
      console.log("  !! no replacement images found — left as-is");
      urlsUnfixable += broken.length;
      continue;
    }

    let newContent = content;
    let newImage = p.image;
    let newOgImage = p.ogImage;
    broken.forEach((dead, i) => {
      const replacement = fresh[i % fresh.length]?.url;
      if (!replacement) {
        urlsUnfixable++;
        return;
      }
      // Escape for literal string split (replace ALL occurrences).
      newContent = newContent.split(dead).join(replacement);
      if (newImage === dead) newImage = replacement;
      if (newOgImage === dead) newOgImage = replacement;
      urlsReplaced++;
      console.log(`  fix: …${dead.slice(-45)} → ${replacement}`);
    });

    if (APPLY) {
      await prisma.post.update({
        where: { id: p.id },
        data: { content: newContent, image: newImage, ogImage: newOgImage },
      });
      console.log("  saved.");
    }
    postsFixed++;
  }

  console.log(
    `\nDone. posts affected: ${postsFixed}, URLs ${APPLY ? "replaced" : "would replace"}: ${urlsReplaced}, unfixable: ${urlsUnfixable}`
  );
  if (!APPLY) console.log("Re-run with --apply to write these changes to the DB.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Fatal:", e?.message || e);
  await prisma.$disconnect();
  process.exit(1);
});

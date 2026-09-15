import { getAiConfig } from "./src/services/aiProvider.ts";
async function main() {
  const cfg = await getAiConfig();
  console.log("NOW:", cfg.provider, cfg.model, "keylen=" + (cfg.apiKey ? cfg.apiKey.length : 0), "prefix=" + (cfg.apiKey ? cfg.apiKey.slice(0,7) : "EMPTY"));
  const prisma = (await import("./src/config/db.ts")).default;
  await prisma.$disconnect();
}
main();

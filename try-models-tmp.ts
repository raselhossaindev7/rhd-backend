import { getAiConfig, aiChatFull } from "./src/services/aiProvider.ts";
async function main() {
  const cfg = await getAiConfig();
  console.log("Current:", cfg.provider, cfg.model);
  const candidates = [
    "google/gemma-4-26b-a4b-it:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "qwen/qwen3-30b-a3b:free",
    "meta-llama/llama-4-maverick:free",
    "deepseek/deepseek-r1:free",
  ];
  for (const m of candidates) {
    try {
      console.log("TRY:", m);
      const r = await aiChatFull([{role:"user", content:"Reply with exactly: OK"}], {provider:"openrouter", apiKey: cfg.apiKey, model: m}, {maxTokens:30});
      console.log("OK:", m, "->", JSON.stringify(r.content).slice(0,80));
      const { saveAiConfig } = await import("./src/services/aiProvider.ts");
      await saveAiConfig({provider:"openrouter", apiKey: cfg.apiKey, model: m});
      console.log("SAVED:", m);
      break;
    } catch(e:any) { console.log("FAIL:", m, "->", String(e.message).slice(0,100)); }
  }
  const prisma = (await import("./src/config/db.ts")).default;
  await prisma.$disconnect();
}
main();

import { listProviderModels, openAiCompatibleChat } from "./src/services/aiProvider.ts";
import { getAiConfig } from "./src/services/aiProvider.ts";
async function main() {
  const cfg = await getAiConfig();
  const live = await listProviderModels({provider:"openrouter", apiKey: cfg.apiKey});
  console.log("live:", live.live, "count:", live.models.length);
  const free = live.models.filter(m=>m.free).slice(0,12).map(m=>m.id);
  console.log("FREE:", JSON.stringify(free));
  for (const mid of free.slice(0,4)) {
    try {
      const { aiChatFull } = await import("./src/services/aiProvider.ts");
      const r = await aiChatFull([{role:"user", content:"Reply with exactly: OK"}], {provider:"openrouter", apiKey: cfg.apiKey, model: mid, baseUrl:"https://openrouter.ai/api/v1"}, {maxTokens:30});
      console.log("OK:", mid, "->", JSON.stringify(r.content).slice(0,100));
      break;
    } catch (e:any) { console.log("FAIL:", mid, "->", e.message.slice(0,120)); }
  }
}
main();

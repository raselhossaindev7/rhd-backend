import { saveAiConfig, getAiConfig, aiChatFull, AI_PROVIDER_DEFAULTS } from "./src/services/aiProvider.ts";
async function main() {
  const ollamaKey = "ee4d3c7da2834ad781548b97ee2736ec.G5maQxglmDyLEagdXwd1bNVC";
  // Set provider to ollama with this key
  await saveAiConfig({ provider: "ollama", apiKey: ollamaKey, model: "" });
  console.log("Config saved: ollama provider");

  const cfg = await getAiConfig();
  console.log("Resolved:", cfg.provider, cfg.model, "keylen=" + cfg.apiKey.length);

  // Try models one by one
  const models = ["minimax-m3:cloud", "llama3.1:cloud", "qwen3:cloud", "deepseek-v3:cloud", "llama3.1", "qwen2.5"];
  for (const m of models) {
    try {
      console.log("TRY:", m);
      const r = await aiChatFull([{ role: "user", content: "Reply with exactly: OK" }], { provider: "ollama", apiKey: ollamaKey, model: m, baseUrl: "https://ollama.com" }, { maxTokens: 30 });
      console.log("OK:", m, "->", JSON.stringify(r.content).slice(0, 100));
      // Save the working model
      await saveAiConfig({ provider: "ollama", apiKey: ollamaKey, model: m });
      console.log("SAVED model:", m);
      break;
    } catch (e: any) {
      console.log("FAIL:", m, "->", String(e.message).slice(0, 120));
    }
  }
  const prisma = (await import("./src/config/db.ts")).default;
  await prisma.$disconnect();
}
main();

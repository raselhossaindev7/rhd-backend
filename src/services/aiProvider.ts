import prisma from "../config/db";
import { safeQuery } from "../config/db";
import { config } from "../config/env";

// ─── Types ────────────────────────────────────────────────

export type AiProviderName = "ollama" | "gemini" | "openrouter" | "groq" | "cerebras";

export const AI_PROVIDERS: AiProviderName[] = ["ollama", "gemini", "openrouter", "groq", "cerebras"];

export interface AiConfig {
  provider: AiProviderName;
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ─── Provider defaults ────────────────────────────────────

export const AI_PROVIDER_DEFAULTS: Record<
  AiProviderName,
  { baseUrl: string; defaultModel: string; suggestedModels: string[]; keyLabel: string; keyHint: string }
> = {
  ollama: {
    baseUrl: "https://ollama.com",
    defaultModel: "minimax-m3:cloud",
    suggestedModels: ["minimax-m3:cloud", "llama3.1:cloud", "qwen3:cloud", "deepseek-v3:cloud", "llama3.1", "qwen2.5"],
    keyLabel: "Ollama API Key",
    keyHint: "Ollama Cloud → API Keys (https://ollama.com/settings/keys). Local Ollama-তে key লাগে না।",
  },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-3.6-flash",
    suggestedModels: ["gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"],
    keyLabel: "Gemini API Key",
    keyHint: "Google AI Studio (https://aistudio.google.com/apikey) থেকে free key নিন।",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "minimax/minimax-m2.7:free",
    suggestedModels: [
      "minimax/minimax-m2.7:free",
      "nvidia/nemotron-3-super-120b-a12b:free",
      "google/gemma-4-31b-it:free",
      "minimax/minimax-m3:free",
      "google/gemma-4-26b-a4b-it:free",
    ],
    keyLabel: "OpenRouter API Key",
    keyHint: "OpenRouter (https://openrouter.ai/keys) থেকে key নিন। Free models-এ :free থাকে।",
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "openai/gpt-oss-120b",
    suggestedModels: [
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "qwen/qwen3.8-27b",
      "qwen/qwen3.6-27b",
      "minimaxai/minimax-m2.7",
    ],
    keyLabel: "Groq API Key",
    keyHint: "Groq Console (https://console.groq.com/keys) থেকে free key নিন।",
  },
  cerebras: {
    baseUrl: "https://api.cerebras.ai/v1",
    defaultModel: "gpt-oss-120b",
    suggestedModels: ["gpt-oss-120b", "qwen-3.8-27b", "gemma-4-31b"],
    keyLabel: "Cerebras API Key",
    keyHint: "Cerebras Cloud (https://cloud.cerebras.ai/) থেকে free key নিন।",
  },
};

function fallbackConfig(): AiConfig {
  // Prefer explicit AI_PROVIDER env, else first provider that has a key, else ollama default
  const envProvider = (config.aiProvider as AiProviderName) || "";
  const candidates: AiProviderName[] = envProvider && AI_PROVIDERS.includes(envProvider)
    ? [envProvider]
    : (["ollama", "gemini", "openrouter", "groq", "cerebras"] as AiProviderName[]);

  const envKeys: Record<AiProviderName, string> = {
    ollama: config.ollamaApiKey,
    gemini: config.geminiApiKey,
    openrouter: config.openrouterApiKey,
    groq: config.groqApiKey,
    cerebras: config.cerebrasApiKey,
  };

  for (const p of candidates) {
    if (envKeys[p]) {
      return {
        provider: p,
        apiKey: envKeys[p],
        model: config.aiModel || AI_PROVIDER_DEFAULTS[p].defaultModel,
        baseUrl: config.aiBaseUrl || AI_PROVIDER_DEFAULTS[p].baseUrl,
      };
    }
  }

  // No key anywhere — return ollama default (UI will show "not configured")
  return {
    provider: (envProvider as AiProviderName) || "ollama",
    apiKey: "",
    model: config.aiModel || AI_PROVIDER_DEFAULTS[(envProvider as AiProviderName) || "ollama"].defaultModel,
    baseUrl: config.aiBaseUrl || AI_PROVIDER_DEFAULTS[(envProvider as AiProviderName) || "ollama"].baseUrl,
  };
}

// ─── Read / Write config (DB first, env fallback) ─────────
// Uses raw SQL so it works even if the generated Prisma client
// predates the SystemSetting model (no client regenerate needed).

async function readDbSettings(): Promise<Record<string, string>> {
  const rows = await safeQuery(() =>
    prisma.$queryRawUnsafe<Array<{ key: string; value: string }>>(
      `SELECT "key", "value" FROM "system_settings" WHERE "key" IN ('ai_provider','ai_api_key','ai_model','ai_base_url')`
    )
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

async function writeDbSetting(key: string, value: string): Promise<void> {
  await safeQuery(() =>
    prisma.$executeRawUnsafe(
      `INSERT INTO "system_settings" ("key", "value", "updatedAt") VALUES ($1, $2, NOW())
       ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = NOW()`,
      key,
      value
    )
  );
}

export async function getAiConfig(): Promise<AiConfig> {
  const fallback = fallbackConfig();
  try {
    const map = await readDbSettings();
    if (!Object.keys(map).length) return fallback;
    const provider = (map.ai_provider as AiProviderName) || fallback.provider;
    const safeProvider = AI_PROVIDERS.includes(provider) ? provider : fallback.provider;
    return {
      provider: safeProvider,
      apiKey: map.ai_api_key ?? fallback.apiKey,
      model: map.ai_model || fallback.model || AI_PROVIDER_DEFAULTS[safeProvider].defaultModel,
      baseUrl: map.ai_base_url || fallback.baseUrl || AI_PROVIDER_DEFAULTS[safeProvider].baseUrl,
    };
  } catch {
    // Table may not exist yet (before db push) — fall back to env
    return fallback;
  }
}

export async function saveAiConfig(input: Partial<AiConfig> & { provider: AiProviderName }): Promise<AiConfig> {
  const provider = AI_PROVIDERS.includes(input.provider) ? input.provider : "ollama";
  const defaults = AI_PROVIDER_DEFAULTS[provider];
  const next: AiConfig = {
    provider,
    apiKey: (input.apiKey ?? "").trim(),
    model: (input.model ?? "").trim() || defaults.defaultModel,
    baseUrl: (input.baseUrl ?? "").trim() || defaults.baseUrl,
  };

  const entries: Record<string, string> = {
    ai_provider: next.provider,
    ai_api_key: next.apiKey,
    ai_model: next.model,
    ai_base_url: next.baseUrl,
  };
  for (const [key, value] of Object.entries(entries)) {
    await writeDbSetting(key, value);
  }
  return next;
}

/** Admin response — includes full key so Settings UI can show it.
 *  Route is admin-authenticated, so the owner can view their own key. */
export async function getAiConfigPublic(): Promise<{ provider: AiProviderName; apiKey: string; model: string; baseUrl: string; configured: boolean; maskedKey: string }> {
  const cfg = await getAiConfig();
  return {
    provider: cfg.provider,
    apiKey: cfg.apiKey,
    model: cfg.model,
    baseUrl: cfg.baseUrl,
    configured: cfg.apiKey.length > 0,
    maskedKey: maskKey(cfg.apiKey),
  };
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

// Extract a short human-readable message from a provider error body
function providerErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body);
    const msg =
      parsed?.error?.message || parsed?.message || parsed?.error;
    if (typeof msg === "string" && msg.trim()) return msg.trim().slice(0, 160);
  } catch {
    // not JSON — fall through
  }
  return body.trim().slice(0, 160) || "request failed";
}

// ─── JSON extraction ──────────────────────────────────────
// Models sometimes wrap JSON in ```json fences or add prose around it.
export function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  const match = candidate.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Invalid AI response format");
  return match[0];
}

// ─── Unified chat completion ──────────────────────────────

export interface AiChatOptions {
  /** Ask the provider for a strict JSON object (kills bad-JSON retries). */
  jsonMode?: boolean;
  /** Cap output tokens so one call can't blow the per-minute budget. */
  maxTokens?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Groq-style 429 bodies say "try again in 10.6575s" — honor it. */
function parseRetryAfterSeconds(body: string, fallbackSeconds: number): number {
  const m = body.match(/try again in ([\d.]+)s/i);
  if (m) return Math.min(Math.ceil(parseFloat(m[1])) + 1, 60);
  // Dimensional/other providers: Retry-After style "retry in 12 seconds"
  const m2 = body.match(/retr(?:y|ies) (?:in|after) ([\d.]+)\s*s/i);
  if (m2) return Math.min(Math.ceil(parseFloat(m2[1])) + 1, 60);
  return fallbackSeconds;
}

export interface AiChatResult {
  content: string;
  /** Provider stop reason: "stop" = complete, "length" = cut off by max tokens */
  finishReason?: string;
}

async function ollamaChat(cfg: AiConfig, messages: AiMessage[], opts: AiChatOptions = {}): Promise<AiChatResult> {
  const base = (cfg.baseUrl || AI_PROVIDER_DEFAULTS.ollama.baseUrl).replace(/\/$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  const body: Record<string, unknown> = { model: cfg.model, messages, stream: false };
  // Mirror maxTokens as num_predict so long-form generations can't run
  // unbounded on Ollama while other providers are capped.
  if (opts.maxTokens) body.options = { num_predict: opts.maxTokens };
  // Ollama Cloud chat endpoint honours response_format like OpenAI
  if (opts.jsonMode) (body as any).response_format = { type: "json_object" };
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("[AI ollama ERROR]", res.status, err.slice(0, 500));
    throw new Error(`AI ollama error (${res.status}): ${providerErrorMessage(err)}`);
  }
  const data: any = await res.json();
  const content = data.message?.content || "";
  if (!content) throw new Error("Empty AI response");
  return { content, finishReason: data.done_reason };
}

async function openAiCompatibleChat(
  cfg: AiConfig,
  messages: AiMessage[],
  opts: AiChatOptions = {}
): Promise<AiChatResult> {
  const base = (cfg.baseUrl || AI_PROVIDER_DEFAULTS[cfg.provider].baseUrl).replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg.apiKey}`,
  };
  // OpenRouter attribution (optional but recommended)
  if (cfg.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://raselhossain.dev";
    headers["X-Title"] = "Rasel Hossain Portfolio";
  }
  const buildBody = (jsonMode: boolean) => {
    const body: Record<string, unknown> = { model: cfg.model, messages, temperature: 0.7 };
    if (jsonMode) body.response_format = { type: "json_object" };
    // Cap output: a 2000-word blog ≈ 3000 tokens; uncapped calls blew
    // Groq's 8000 TPM limit (prompt ~1500 + output ~4000 + retries).
    if (opts.maxTokens) body.max_tokens = opts.maxTokens;
    return body;
  };

  let useJsonMode = !!opts.jsonMode;
  // 429s are waited out (provider tells us how long); 5xx get one fast
  // retry; anything else fails immediately with a readable message.
  // Old code failed INSTANTLY on 429 → topic FAILED → cron revived it →
  // daily token-burn loop. Now a 429 just pauses and continues.
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(buildBody(useJsonMode)),
      signal: AbortSignal.timeout(180000),
    });
    if (res.ok) {
      const data: any = await res.json();
      const content = data.choices?.[0]?.message?.content || "";
      if (!content) throw new Error("Empty AI response");
      return { content, finishReason: data.choices?.[0]?.finish_reason };
    }
    const err = await res.text();
    if (res.status === 429 && attempt < 4) {
      const wait = parseRetryAfterSeconds(err, 12) * attempt;
      console.log(`[AI ${cfg.provider}] Rate limited (429), waiting ${wait}s before retry ${attempt}/3...`);
      await sleep(wait * 1000);
      continue;
    }
    if (res.status >= 500 && attempt < 3) {
      console.log(`[AI ${cfg.provider}] Server error (${res.status}), retrying ${attempt}/2...`);
      await sleep(2000 * attempt);
      continue;
    }
    // Model doesn't support response_format → retry once as plain text
    // (extractJsonObject fallback still applies downstream).
    // Matches: "response_format is not supported", "...does not support
    // feature: structured-outputs", "JSON mode is not available", etc.
    if (useJsonMode && res.status === 400 && /response_format|json|structured.output/i.test(err)) {
      console.log(`[AI ${cfg.provider}] JSON mode unsupported, falling back to text mode`);
      useJsonMode = false;
      continue;
    }
    console.error(`[AI ${cfg.provider} ERROR]`, res.status, err.slice(0, 500));
    throw new Error(`AI ${cfg.provider} error (${res.status}): ${providerErrorMessage(err)}`);
  }
  throw new Error(`AI ${cfg.provider} error: rate limit persisted after retries`);
}

async function resolveChatConfig(override?: Partial<AiConfig>): Promise<AiConfig> {
  const cfg = override?.apiKey || override?.provider || override?.model
    ? { ...(await getAiConfig()), ...override } as AiConfig
    : await getAiConfig();
  if (!cfg.apiKey) throw new Error("AI service not configured — Settings থেকে API key সেট করুন");
  return cfg;
}

/** Main entry — all generators + chat go through here */
export async function aiChat(
  messages: AiMessage[],
  override?: Partial<AiConfig>,
  opts?: AiChatOptions
): Promise<string> {
  return (await aiChatFull(messages, override, opts)).content;
}

/** Same as aiChat but also returns the provider finish reason, so callers
 *  can tell a complete response ("stop") from a truncated one ("length"). */
export async function aiChatFull(
  messages: AiMessage[],
  override?: Partial<AiConfig>,
  opts?: AiChatOptions
): Promise<AiChatResult> {
  const cfg = await resolveChatConfig(override);
  if (cfg.provider === "ollama") return ollamaChat(cfg, messages, opts);
  return openAiCompatibleChat(cfg, messages, opts);
}

export interface DetectedModel {
  id: string;
  free: boolean;
}

/** Resolve an API key: explicit > saved config (same provider) > env */
async function resolveApiKey(provider: AiProviderName, apiKey?: string): Promise<string> {
  const explicit = (apiKey ?? "").trim();
  if (explicit) return explicit;
  const saved = await getAiConfig();
  if (saved.provider === provider && saved.apiKey) return saved.apiKey;
  const envMap: Record<AiProviderName, string> = {
    ollama: config.ollamaApiKey,
    gemini: config.geminiApiKey,
    openrouter: config.openrouterApiKey,
    groq: config.groqApiKey,
    cerebras: config.cerebrasApiKey,
  };
  return envMap[provider] || "";
}

/** Live model list for a provider (for auto-detect in Settings UI).
 *  Falls back to the static suggested list when the live call fails. */
export async function listProviderModels(
  input: Partial<AiConfig> & { provider: AiProviderName }
): Promise<{ models: DetectedModel[]; recommended: string; live: boolean }> {
  const provider = AI_PROVIDERS.includes(input.provider) ? input.provider : "ollama";
  const defaults = AI_PROVIDER_DEFAULTS[provider];
  const baseUrl = (input.baseUrl ?? "").trim() || defaults.baseUrl;
  const fallback = {
    models: defaults.suggestedModels.map((id) => ({ id, free: provider !== "openrouter" })),
    recommended: (input.model ?? "").trim() || defaults.defaultModel,
    live: false,
  };

  try {
    // Ollama Cloud has no public model catalog — use static list
    if (provider === "ollama") return fallback;

    if (provider === "gemini") {
      const key = await resolveApiKey(provider, input.apiKey);
      if (!key) return fallback;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=100`,
        { signal: AbortSignal.timeout(20000) }
      );
      if (!res.ok) return fallback;
      const data: any = await res.json();
      const ids: string[] = (data.models || [])
        .map((m: any) => String(m.name || "").replace(/^models\//, ""))
        .filter(Boolean)
        // skip speech/image-only variants for blog generation
        .filter((id: string) => !/tts|image|transcribe|lyria|robotics|computer-use|deep-research|antigravity/i.test(id));
      if (!ids.length) return fallback;
      return {
        models: ids.map((id) => ({ id, free: true })),
        recommended: ids.includes(defaults.defaultModel) ? defaults.defaultModel : ids[0],
        live: true,
      };
    }

    // OpenAI-compatible: GET {base}/models
    const key = await resolveApiKey(provider, input.apiKey);
    if (!key) return fallback;
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return fallback;
    const data: any = await res.json();
    const raw: any[] = data.data || [];
    if (!raw.length) return fallback;
    const models: DetectedModel[] = raw.map((m: any) => {
      const id = String(m.id || "");
      let free = true;
      if (provider === "openrouter" && m.pricing) {
        const p = parseFloat(m.pricing.prompt ?? "1");
        const c = parseFloat(m.pricing.completion ?? "1");
        free = p === 0 && c === 0;
      }
      return { id, free };
    }).filter((m) => m.id);
    // Free models first
    models.sort((a, b) => Number(b.free) - Number(a.free));
    const recommended =
      (input.model ?? "").trim() && models.some((m) => m.id === (input.model ?? "").trim())
        ? (input.model ?? "").trim()
        : models.some((m) => m.id === defaults.defaultModel)
          ? defaults.defaultModel
          : (models.find((m) => m.free)?.id || models[0].id);
    return { models, recommended, live: true };
  } catch {
    return fallback;
  }
}
/** Quick connection test with a tiny prompt */
export async function testAiConnection(input: Partial<AiConfig> & { provider: AiProviderName }): Promise<{ ok: boolean; reply: string; provider: AiProviderName; model: string }> {
  const provider = AI_PROVIDERS.includes(input.provider) ? input.provider : "ollama";
  const defaults = AI_PROVIDER_DEFAULTS[provider];
  const cfg: AiConfig = {
    provider,
    apiKey: (input.apiKey ?? "").trim(),
    model: (input.model ?? "").trim() || defaults.defaultModel,
    baseUrl: (input.baseUrl ?? "").trim() || defaults.baseUrl,
  };
  if (!cfg.apiKey) throw new Error("API key is required");
  const result =
    provider === "ollama"
      ? await ollamaChat(cfg, [{ role: "user", content: "Reply with exactly: OK" }])
      : await openAiCompatibleChat(cfg, [{ role: "user", content: "Reply with exactly: OK" }]);
  return { ok: true, reply: result.content.slice(0, 200), provider: cfg.provider, model: cfg.model };
}

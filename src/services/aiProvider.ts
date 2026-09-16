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
    defaultModel: "minimax-m3",
    suggestedModels: ["minimax-m3", "qwen3.5:397b", "deepseek-v4.1-flash", "glm-5.3-flash", "gpt-oss:120b"],
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
    defaultModel: "google/gemma-4-31b-it:free",
    suggestedModels: [
      "google/gemma-4-31b-it:free",
      "google/gemma-4-26b-a4b-it:free",
      "nvidia/nemotron-3-super-120b-a12b:free",
      "nvidia/nemotron-3.5-lightning:free",
      "z-ai/glm-5.2:free",
      "qwen/qwen3-235b-a22b:free",
      "qwen/qwen3-30b-a3b:free",
      "deepseek/deepseek-r1-0528:free",
      "deepseek/deepseek-chat-v3-0324:free",
      "meta-llama/llama-4-maverick:free",
      "meta-llama/llama-4-scout:free",
      "microsoft/mai-ds-r1:free",
    ],
    keyLabel: "OpenRouter API Key",
    keyHint: "OpenRouter (https://openrouter.ai/keys) থেকে key নিন। 429 হলে https://openrouter.ai/settings/integrations এ Gemini key add করুন (BYOK)।",
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
    // If DB has an empty API key (accidentally overwritten), fall back to env key
    const dbKey = map.ai_api_key ?? "";
    const apiKey = dbKey || fallback.apiKey;
    const baseUrl = map.ai_base_url || fallback.baseUrl || AI_PROVIDER_DEFAULTS[safeProvider].baseUrl;
    let model = map.ai_model || fallback.model || AI_PROVIDER_DEFAULTS[safeProvider].defaultModel;
    // Heal retired Ollama Cloud names (e.g. qwen2.5 → qwen3.5:397b)
    if (safeProvider === "ollama") model = normalizeOllamaModel(model, baseUrl);
    return {
      provider: safeProvider,
      apiKey,
      model,
      baseUrl,
    };
  } catch {
    // Table may not exist yet (before db push) — fall back to env
    return fallback;
  }
}

export async function saveAiConfig(input: Partial<AiConfig> & { provider: AiProviderName }): Promise<AiConfig> {
  const provider = AI_PROVIDERS.includes(input.provider) ? input.provider : "ollama";
  const defaults = AI_PROVIDER_DEFAULTS[provider];
  // Never overwrite an existing key with empty string — only save if caller
  // explicitly provides a new key (prevents accidental key deletion on model-only saves).
  const current = await getAiConfig();
  const inputKey = (input.apiKey ?? "").trim();
  const apiKey = inputKey || current.apiKey || "";
  let baseInput = (input.baseUrl ?? "").trim();
  // Provider switch with a stale Base URL carried over from the old provider
  // (e.g. gemini + https://openrouter.ai/api/v1 → every call 401s at the
  // wrong host). If it exactly matches the OLD provider's default, drop it
  // so the new provider's default applies. Custom URLs (local Ollama etc.)
  // are always preserved.
  if (provider !== current.provider && baseInput === AI_PROVIDER_DEFAULTS[current.provider].baseUrl) {
    baseInput = "";
  }
  const next: AiConfig = {
    provider,
    apiKey,
    model: (input.model ?? "").trim() || defaults.defaultModel,
    baseUrl: baseInput || defaults.baseUrl,
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

// Per-provider model rotation — every provider gets the same armor:
// requested model first, then its fallback list. A 404 / 402 / empty /
// shared-pool 429 rotates to the next model instantly instead of failing.
const OPENROUTER_FALLBACK_MODELS = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "nvidia/nemotron-3.5-lightning:free",
  "z-ai/glm-5.2:free",
  "qwen/qwen3-235b-a22b:free",
  "qwen/qwen3-30b-a3b:free",
  "deepseek/deepseek-r1-0528:free",
  "deepseek/deepseek-chat-v3-0324:free",
  "meta-llama/llama-4-maverick:free",
  "meta-llama/llama-4-scout:free",
  "microsoft/mai-ds-r1:free",
];

const OLLAMA_FALLBACK_MODELS = [
  "minimax-m3",
  "qwen3.5:397b",
  "deepseek-v4.1-flash",
  "glm-5.3-flash",
  "gpt-oss:120b",
];

// Old Ollama Cloud names (retired 2026: `:cloud` suffix dropped, local-only
// names never worked on Cloud). Remapped only when baseUrl is Cloud —
// local Ollama keeps user model untouched.
const OLLAMA_STALE_MODEL_MAP: Record<string, string> = {
  "minimax-m3:cloud": "minimax-m3",
  "llama3.1:cloud": "minimax-m3",
  "qwen3:cloud": "qwen3.5:397b",
  "deepseek-v3:cloud": "deepseek-v4.1-flash",
  "llama3.1": "minimax-m3",
  "qwen2.5": "qwen3.5:397b",
};

function isLocalOllamaBase(baseUrl: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.\d/.test(baseUrl || "");
}

function normalizeOllamaModel(model: string, baseUrl: string): string {
  if (!model || isLocalOllamaBase(baseUrl)) return model;
  return OLLAMA_STALE_MODEL_MAP[model.trim()] || model;
}

// Groq / Cerebras / Gemini fall back through their own suggested lists
// (requested model first). Unknown/stale names 404 → instant rotate.
const PROVIDER_FALLBACK_MODELS: Record<AiProviderName, string[]> = {
  ollama: OLLAMA_FALLBACK_MODELS,
  openrouter: OPENROUTER_FALLBACK_MODELS,
  groq: AI_PROVIDER_DEFAULTS.groq.suggestedModels,
  cerebras: AI_PROVIDER_DEFAULTS.cerebras.suggestedModels,
  gemini: AI_PROVIDER_DEFAULTS.gemini.suggestedModels,
};

function buildTryModels(provider: AiProviderName, requested: string): string[] {
  const fallbacks = (PROVIDER_FALLBACK_MODELS[provider] || []).filter((m) => m !== requested);
  return [requested, ...fallbacks];
}

function isSharedPoolRateLimit(body: string): boolean {
  return /upstream_provider_shared_pool|temporarily rate-limited upstream/i.test(body);
}

function isJsonModeError(body: string): boolean {
  return /response_format|json|structured.output/i.test(body);
}

function isPaymentError(status: number, body: string): boolean {
  return status === 402 || /payment|credit|quota|billing|insufficient/i.test(body);
}

function isAuthError(status: number): boolean {
  return status === 401 || status === 403;
}

async function ollamaChat(cfg: AiConfig, messages: AiMessage[], opts: AiChatOptions = {}): Promise<AiChatResult> {
  const base = (cfg.baseUrl || AI_PROVIDER_DEFAULTS.ollama.baseUrl).replace(/\/$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  const baseBody: Record<string, unknown> = { messages, stream: false };
  // Mirror maxTokens as num_predict so long-form generations can't run
  // unbounded on Ollama while other providers are capped.
  if (opts.maxTokens) baseBody.options = { num_predict: opts.maxTokens };

  let useJsonMode = !!opts.jsonMode;
  // Heal stale names even when caller passes model directly (e.g. Test button)
  const effectiveModel = normalizeOllamaModel(cfg.model, base);
  const tryModels = buildTryModels("ollama", effectiveModel);
  let modelIdx = 0;
  let currentModel = tryModels[modelIdx]!;

  const rotate = (reason: string) => {
    if (modelIdx + 1 >= tryModels.length) return false;
    console.log(`[AI ollama] ${reason} on ${currentModel}, trying fallback ${tryModels[modelIdx + 1]} (${modelIdx + 2}/${tryModels.length})`);
    modelIdx++;
    currentModel = tryModels[modelIdx]!;
    return true;
  };

  for (let attempt = 1; attempt <= 8; attempt++) {
    const sendBody: Record<string, unknown> = { ...baseBody, model: currentModel };
    if (useJsonMode) (sendBody as any).response_format = { type: "json_object" };
    let res: Response;
    try {
      res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify(sendBody),
        signal: AbortSignal.timeout(180000),
      });
    } catch (netErr) {
      // Network blip → one retry per attempt cycle, then fail loud
      if (attempt < 8) {
        console.log(`[AI ollama] Network error, retrying (${attempt}/8): ${(netErr as Error)?.message}`);
        await sleep(2000 * attempt);
        continue;
      }
      throw netErr;
    }
    if (!res.ok) {
      const err = await res.text();
      if (isAuthError(res.status)) {
        console.error("[AI ollama ERROR]", res.status, err.slice(0, 500));
        throw new Error(`AI ollama error (${res.status}): ${providerErrorMessage(err)}`);
      }
      // Unknown model / out of credits → next model instantly
      if ((res.status === 404 || isPaymentError(res.status, err)) && rotate(res.status === 404 ? "Model not found" : "Payment/credits")) continue;
      // JSON mode unsupported → plain text on same model
      if (useJsonMode && res.status === 400 && isJsonModeError(err)) {
        console.log("[AI ollama] JSON mode unsupported, falling back to text mode");
        useJsonMode = false;
        continue;
      }
      if (res.status === 429 && attempt < 8) {
        const wait = parseRetryAfterSeconds(err, 10);
        console.log(`[AI ollama:${currentModel}] Rate limited (429), waiting ${wait}s before retry ${attempt}/8...`);
        await sleep(wait * 1000);
        continue;
      }
      if (res.status >= 500 && attempt < 8) {
        console.log(`[AI ollama] Server error (${res.status}), retrying ${attempt}/8...`);
        await sleep(2000 * attempt);
        continue;
      }
      console.error("[AI ollama ERROR]", res.status, err.slice(0, 500));
      throw new Error(`AI ollama error (${res.status}): ${providerErrorMessage(err)}`);
    }
    const data: any = await res.json();
    const content = data.message?.content || "";
    if (!content) {
      // Empty with JSON mode → same model in plain text first (model may
      // not support structured output), else rotate to next model.
      if (useJsonMode) {
        console.log(`[AI ollama] Empty response with JSON mode on ${currentModel}, retrying as plain text`);
        useJsonMode = false;
        continue;
      }
      if (rotate("Empty response")) continue;
      if (attempt < 8) {
        console.log(`[AI ollama] Empty response, retrying attempt ${attempt}/8...`);
        await sleep(2000);
        continue;
      }
      throw new Error("Empty AI response");
    }
    if (currentModel !== cfg.model) {
      console.log(`[AI ollama] Fallback model succeeded: ${currentModel} (requested ${cfg.model})`);
    }
    return { content, finishReason: data.done_reason };
  }
  throw new Error(`AI ollama error: all retries exhausted (tried ${tryModels.slice(0, modelIdx + 1).join(", ")})`);
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
  const buildBody = (model: string, jsonMode: boolean) => {
    const body: Record<string, unknown> = { model, messages, temperature: 0.7 };
    if (jsonMode) body.response_format = { type: "json_object" };
    // Cap output: a 2000-word blog ≈ 3000 tokens; uncapped calls blew
    // Groq's 8000 TPM limit (prompt ~1500 + output ~4000 + retries).
    if (opts.maxTokens) body.max_tokens = opts.maxTokens;
    return body;
  };

  let useJsonMode = !!opts.jsonMode;
  // Build ordered model list: requested model first, then that provider's
  // fallback list. Works for openrouter AND groq/cerebras/gemini.
  const tryModels = buildTryModels(cfg.provider, cfg.model);
  const maxAttempts = Math.max(8, tryModels.length + 3);
  let modelIdx = 0;
  let currentModel = tryModels[modelIdx]!;

  const rotate = (reason: string) => {
    if (modelIdx + 1 >= tryModels.length) return false;
    console.log(`[AI ${cfg.provider}] ${reason} on ${tryModels[modelIdx]}, trying fallback ${tryModels[modelIdx + 1]} (${modelIdx + 2}/${tryModels.length})`);
    modelIdx++;
    currentModel = tryModels[modelIdx]!;
    return true;
  };

  // 429s are waited out (provider tells us how long); 5xx get fast
  // retries; 404/402/empty/shared-pool 429s rotate to next model instantly.
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(buildBody(currentModel, useJsonMode)),
        signal: AbortSignal.timeout(180000),
      });
    } catch (netErr) {
      if (attempt < maxAttempts) {
        console.log(`[AI ${cfg.provider}] Network error, retrying (${attempt}/${maxAttempts}): ${(netErr as Error)?.message}`);
        await sleep(2000 * attempt);
        continue;
      }
      throw netErr;
    }
    if (res.ok) {
      const data: any = await res.json();
      const content = data.choices?.[0]?.message?.content || "";
      if (!content) {
        // Empty with JSON mode → same model in plain text first, else next model
        // (e.g. z-ai/glm sometimes returns empty on tiny JSON prompts).
        if (useJsonMode) {
          console.log(`[AI ${cfg.provider}] Empty response with JSON mode on ${currentModel}, retrying as plain text`);
          useJsonMode = false;
          continue;
        }
        if (rotate("Empty response")) continue;
        if (attempt < maxAttempts) {
          await sleep(2000);
          continue;
        }
        throw new Error("Empty AI response");
      }
      if (currentModel !== cfg.model) {
        console.log(`[AI ${cfg.provider}] Fallback model succeeded: ${currentModel} (requested ${cfg.model})`);
      }
      return { content, finishReason: data.choices?.[0]?.finish_reason };
    }
    const err = await res.text();
    // Bad key → fail fast with a clear message (retries can't fix it).
    if (isAuthError(res.status)) {
      console.error(`[AI ${cfg.provider}:${currentModel} ERROR]`, res.status, err.slice(0, 500));
      throw new Error(`AI ${cfg.provider} error (${res.status}): ${providerErrorMessage(err)}`);
    }
    // Unknown model or out-of-credits → next model instantly.
    if (res.status === 404 && rotate("Model not found")) continue;
    if (isPaymentError(res.status, err) && rotate("Payment/credits")) continue;
    // Shared-pool 429 → next free model immediately (no long wait).
    if (res.status === 429 && isSharedPoolRateLimit(err) && rotate("Shared-pool rate limited")) continue;
    if (res.status === 429 && attempt < maxAttempts) {
      const wait = parseRetryAfterSeconds(err, 12) * Math.min(attempt, 3);
      console.log(`[AI ${cfg.provider}:${currentModel}] Rate limited (429), waiting ${wait}s before retry ${attempt}/${maxAttempts}...`);
      await sleep(wait * 1000);
      continue;
    }
    if (res.status >= 500 && attempt < maxAttempts) {
      console.log(`[AI ${cfg.provider}] Server error (${res.status}), retrying ${attempt}/${maxAttempts}...`);
      await sleep(2000 * attempt);
      continue;
    }
    // Model doesn't support response_format → retry as plain text
    // (extractJsonObject fallback still applies downstream).
    if (useJsonMode && res.status === 400 && isJsonModeError(err)) {
      console.log(`[AI ${cfg.provider}] JSON mode unsupported, falling back to text mode`);
      useJsonMode = false;
      continue;
    }
    console.error(`[AI ${cfg.provider}:${currentModel} ERROR]`, res.status, err.slice(0, 500));
    throw new Error(`AI ${cfg.provider} error (${res.status}): ${providerErrorMessage(err)}`);
  }
  throw new Error(`AI ${cfg.provider} error: all retries exhausted (tried ${tryModels.slice(0, modelIdx + 1).join(", ")})`);
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
  // UI shows max 5 FREE models only — keep payload small & dynamic
  const MAX_FREE_MODELS = 5;
  const fallback = {
    models: defaults.suggestedModels.slice(0, MAX_FREE_MODELS).map((id) => ({ id, free: true })),
    recommended: (input.model ?? "").trim() || defaults.defaultModel,
    live: false,
  };

  try {
    // Ollama: /api/tags is public on Cloud and works on local too → live list
    if (provider === "ollama") {
      try {
        const tagsRes = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`, {
          signal: AbortSignal.timeout(20000),
        });
        if (tagsRes.ok) {
          const tagsData: any = await tagsRes.json();
          const ids: string[] = (tagsData.models || [])
            .map((m: any) => String(m.name || m.model || ""))
            .filter(Boolean);
          if (ids.length) {
            const sorted = [...ids].sort((a, b) => {
              if (a === defaults.defaultModel) return -1;
              if (b === defaults.defaultModel) return 1;
              return 0;
            });
            const top = sorted.slice(0, MAX_FREE_MODELS);
            return {
              models: top.map((id) => ({ id, free: true })),
              recommended: top.includes(defaults.defaultModel) ? defaults.defaultModel : top[0],
              live: true,
            };
          }
        }
      } catch {
        // fall through to static list
      }
      return fallback;
    }

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
      // Dynamic free list: default model first, then flash variants, max 5
      const sorted = [...ids].sort((a, b) => {
        if (a === defaults.defaultModel) return -1;
        if (b === defaults.defaultModel) return 1;
        const aFlash = /flash/i.test(a) ? 0 : 1;
        const bFlash = /flash/i.test(b) ? 0 : 1;
        return aFlash - bFlash;
      });
      const top = sorted.slice(0, MAX_FREE_MODELS);
      return {
        models: top.map((id) => ({ id, free: true })),
        recommended: top.includes(defaults.defaultModel) ? defaults.defaultModel : top[0],
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
    // Free models first, then slice to max 5 FREE only
    models.sort((a, b) => Number(b.free) - Number(a.free));
    const freeOnly = models.filter((m) => m.free).slice(0, MAX_FREE_MODELS);
    // No free model found live → fall back to curated static free list
    if (!freeOnly.length) return fallback;
    const recommended =
      (input.model ?? "").trim() && freeOnly.some((m) => m.id === (input.model ?? "").trim())
        ? (input.model ?? "").trim()
        : freeOnly.some((m) => m.id === defaults.defaultModel)
          ? defaults.defaultModel
          : freeOnly[0].id;
    return { models: freeOnly, recommended, live: true };
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

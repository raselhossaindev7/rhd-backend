import { Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../config/db";
import { sendSuccess, sendError, ApiError } from "../utils/helpers";
import { AuthRequest } from "../types";
import { config } from "../config/env";
import { r2Client } from "../config/r2";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import {
  AI_PROVIDERS,
  AI_PROVIDER_DEFAULTS,
  AiProviderName,
  getAiConfig,
  getAiConfigPublic,
  listProviderModels,
  saveAiConfig,
  testAiConnection,
} from "../services/aiProvider";

// ─── Get Profile ──────────────────────────────────────────

export async function getProfile(req: AuthRequest, res: Response) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) throw new ApiError(404, "User not found");
    sendSuccess(res, user);
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Update Profile ───────────────────────────────────────

export async function updateProfile(req: AuthRequest, res: Response) {
  try {
    const { name, email, avatar } = req.body;

    // Check if email is taken by another user
    if (email) {
      const existing = await prisma.user.findFirst({
        where: { email, NOT: { id: req.user!.id } },
      });
      if (existing) throw new ApiError(409, "Email already in use");
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(name && { name }),
        ...(email && { email }),
        ...(avatar !== undefined && { avatar }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    sendSuccess(res, user);
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── Change Password ──────────────────────────────────────

export async function changePassword(req: AuthRequest, res: Response) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new ApiError(400, "Current and new password are required");
    }

    if (newPassword.length < 6) {
      throw new ApiError(400, "New password must be at least 6 characters");
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new ApiError(404, "User not found");

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new ApiError(401, "Current password is incorrect");

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { password: hashed },
    });

    sendSuccess(res, { message: "Password changed successfully" });
  } catch (error) {
    sendError(res, error as Error);
  }
}

// ─── AI Config ────────────────────────────────────────────

export async function getAiSettings(_req: AuthRequest, res: Response) {
  try {
    const cfg = await getAiConfigPublic();
    sendSuccess(res, {
      ...cfg,
      providers: AI_PROVIDERS.map((p) => ({
        id: p,
        defaultModel: AI_PROVIDER_DEFAULTS[p].defaultModel,
        suggestedModels: AI_PROVIDER_DEFAULTS[p].suggestedModels,
        baseUrl: AI_PROVIDER_DEFAULTS[p].baseUrl,
        keyLabel: AI_PROVIDER_DEFAULTS[p].keyLabel,
        keyHint: AI_PROVIDER_DEFAULTS[p].keyHint,
      })),
    });
  } catch (error) {
    sendError(res, error as Error);
  }
}

export async function updateAiSettings(req: AuthRequest, res: Response) {
  try {
    const { provider, apiKey, model, baseUrl } = req.body as {
      provider: AiProviderName;
      apiKey?: string;
      model?: string;
      baseUrl?: string;
    };

    if (!provider || !AI_PROVIDERS.includes(provider)) {
      throw new ApiError(400, `Invalid provider. Must be one of: ${AI_PROVIDERS.join(", ")}`);
    }

    // Empty apiKey means "keep existing" only if a key already exists for same provider.
    // Otherwise require a key.
    let finalKey = (apiKey ?? "").trim();
    if (!finalKey) {
      const current = await getAiConfig();
      if (current.provider === provider && current.apiKey) {
        finalKey = current.apiKey;
      } else {
        throw new ApiError(400, "API key is required");
      }
    }

    const saved = await saveAiConfig({ provider, apiKey: finalKey, model, baseUrl });
    const pub = await getAiConfigPublic();
    sendSuccess(res, { ...pub, saved: true });
  } catch (error) {
    sendError(res, error as Error);
  }
}

export async function listAiModels(req: AuthRequest, res: Response) {
  try {
    const { provider, apiKey, model, baseUrl } = req.body as {
      provider: AiProviderName;
      apiKey?: string;
      model?: string;
      baseUrl?: string;
    };

    if (!provider || !AI_PROVIDERS.includes(provider)) {
      throw new ApiError(400, `Invalid provider. Must be one of: ${AI_PROVIDERS.join(", ")}`);
    }

    const result = await listProviderModels({ provider, apiKey, model, baseUrl });
    sendSuccess(res, result);
  } catch (error) {
    sendError(res, error as Error);
  }
}

export async function testAiSettings(req: AuthRequest, res: Response) {
  try {
    const { provider, apiKey, model, baseUrl } = req.body as {
      provider: AiProviderName;
      apiKey?: string;
      model?: string;
      baseUrl?: string;
    };

    if (!provider || !AI_PROVIDERS.includes(provider)) {
      throw new ApiError(400, `Invalid provider. Must be one of: ${AI_PROVIDERS.join(", ")}`);
    }

    // Allow testing saved config when apiKey omitted
    let finalKey = (apiKey ?? "").trim();
    let finalModel = (model ?? "").trim();
    let finalBase = (baseUrl ?? "").trim();
    if (!finalKey || !finalModel) {
      const current = await getAiConfig();
      if (!finalKey) finalKey = current.apiKey;
      if (!finalModel) finalModel = current.model;
      if (!finalBase) finalBase = current.baseUrl;
    }

    const result = await testAiConnection({ provider, apiKey: finalKey, model: finalModel, baseUrl: finalBase });
    sendSuccess(res, result);
  } catch (error) {
    // Surface the real provider message (e.g. 403 reason) instead of generic 500
    if (error instanceof ApiError) return sendError(res, error);
    return sendError(res, new ApiError(400, error instanceof Error ? error.message : "Connection test failed"));
  }
}

// ─── System Info ──────────────────────────────────────────

export async function getSystemInfo(_req: AuthRequest, res: Response) {
  try {
    // Sequential counts (no $transaction — see db.ts: a batch pins one
    // server connection on the Supabase transaction-mode pooler).
    const projectCount = await prisma.project.count();
    const postCount = await prisma.post.count();
    const serviceCount = await prisma.service.count();
    const contactCount = await prisma.contact.count();
    const subscriberCount = await prisma.subscriber.count();
    const messageCount = await prisma.message.count();
    const userCount = await prisma.user.count();

    // R2 storage check
    let r2Status = "disconnected";
    let r2Files = 0;
    let r2Size = 0;
    try {
      const command = new ListObjectsV2Command({
        Bucket: config.r2.bucketName,
        MaxKeys: 1000,
      });
      const response = await r2Client.send(command);
      r2Status = "connected";
      r2Files = response.KeyCount || 0;
      r2Size = (response.Contents || []).reduce((acc, obj) => acc + (obj.Size || 0), 0);
    } catch {
      r2Status = "error";
    }

    // Active AI provider check (uses saved config, falls back to env)
    const aiCfg = await getAiConfig();
    let aiStatus = "disconnected";
    try {
      const probe = await testAiConnection(aiCfg);
      aiStatus = probe.ok ? "connected" : "error";
    } catch {
      aiStatus = aiCfg.apiKey ? "error" : "disconnected";
    }

    sendSuccess(res, {
      database: {
        projects: projectCount,
        posts: postCount,
        services: serviceCount,
        contacts: contactCount,
        subscribers: subscriberCount,
        messages: messageCount,
        users: userCount,
      },
      storage: {
        r2: r2Status,
        r2Files,
        r2Size,
        bucket: config.r2.bucketName,
        publicUrl: config.r2.publicUrl,
      },
      ai: {
        provider: aiCfg.provider,
        status: aiStatus,
        model: aiCfg.model,
        configured: aiCfg.apiKey.length > 0,
        // backward-compat for older admin builds
        ollama: aiStatus,
      },
      server: {
        nodeEnv: config.nodeEnv,
        port: config.port,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      },
    });
  } catch (error) {
    sendError(res, error as Error);
  }
}

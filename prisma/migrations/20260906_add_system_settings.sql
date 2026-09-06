-- Migration: Add SystemSetting model (key-value runtime config, used for AI provider settings)
-- Run this SQL directly in Supabase SQL Editor (already applied to production on 2026-09-06)

CREATE TABLE IF NOT EXISTS "system_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

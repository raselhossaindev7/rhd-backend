-- CreateTable: ServiceTopic (AI Service Autopilot queue, mirrors topics)
-- NOTE: IF NOT EXISTS / duplicate_object guards make this safe to apply on
-- databases where the table was created via `prisma db push` or the manual
-- SQL file. `prisma migrate deploy` (Render build + deploy.sh) picks this up
-- automatically — no Supabase SQL-editor step needed.

-- Reuse the blog autopilot enum when present (fresh DBs that never ran the
-- manual topics SQL don't have it yet).
DO $$ BEGIN
  CREATE TYPE "TopicStatus" AS ENUM ('PENDING', 'GENERATING', 'COMPLETED', 'FAILED', 'PUBLISHED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "service_topics" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "description" TEXT,
  "status" "TopicStatus" NOT NULL DEFAULT 'PENDING',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "scheduledFor" TIMESTAMP(3),
  "generatedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "serviceId" TEXT,
  "error" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "service_topics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "service_topics_serviceId_key" ON "service_topics"("serviceId");
CREATE INDEX IF NOT EXISTS "service_topics_status_idx" ON "service_topics"("status");
CREATE INDEX IF NOT EXISTS "service_topics_scheduledFor_idx" ON "service_topics"("scheduledFor");

DO $$ BEGIN
  ALTER TABLE "service_topics" ADD CONSTRAINT "service_topics_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

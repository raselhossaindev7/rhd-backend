-- Migration: Add Topic model for AI Blog Scheduler
-- Run this SQL directly in Supabase SQL Editor

-- 1. Create TopicStatus enum
CREATE TYPE "TopicStatus" AS ENUM ('PENDING', 'GENERATING', 'COMPLETED', 'FAILED', 'PUBLISHED');

-- 2. Create topics table
CREATE TABLE "topics" (
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
    "postId" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- 3. Create unique constraint on postId
CREATE UNIQUE INDEX "topics_postId_key" ON "topics"("postId");

-- 4. Create indexes for performance
CREATE INDEX "topics_status_idx" ON "topics"("status");
CREATE INDEX "topics_scheduledFor_idx" ON "topics"("scheduledFor");

-- 5. Add foreign key constraint to posts table
ALTER TABLE "topics" ADD CONSTRAINT "topics_postId_fkey" 
    FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Add scheduledAt column to posts table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'posts' AND column_name = 'scheduledAt'
    ) THEN
        ALTER TABLE "posts" ADD COLUMN "scheduledAt" TIMESTAMP(3);
    END IF;
END $$;

-- Add analytics fields to page_views
ALTER TABLE "page_views" ADD COLUMN "browser" TEXT,
ADD COLUMN "os" TEXT,
ADD COLUMN "device" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "region" TEXT;

CREATE INDEX "page_views_path_idx" ON "page_views"("path");
CREATE INDEX "page_views_createdAt_idx" ON "page_views"("createdAt");
CREATE INDEX "page_views_country_idx" ON "page_views"("country");
CREATE INDEX "page_views_browser_idx" ON "page_views"("browser");
CREATE INDEX "page_views_device_idx" ON "page_views"("device");

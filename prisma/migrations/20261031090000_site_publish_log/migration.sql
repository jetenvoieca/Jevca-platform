-- Publish log (2026-10-31): every publish of a site is kept — when, by
-- which login, and how it went. See SitePublishLog in schema.prisma.
CREATE TYPE "PublishOutcome" AS ENUM ('PUBLISHED', 'PUBLISHED_WITH_WARNING', 'FAILED');

CREATE TABLE "SitePublishLog" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "userId" TEXT,
    "outcome" "PublishOutcome" NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SitePublishLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SitePublishLog_siteId_createdAt_idx" ON "SitePublishLog"("siteId", "createdAt");

CREATE INDEX "SitePublishLog_userId_idx" ON "SitePublishLog"("userId");

ALTER TABLE "SitePublishLog" ADD CONSTRAINT "SitePublishLog_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SitePublishLog" ADD CONSTRAINT "SitePublishLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

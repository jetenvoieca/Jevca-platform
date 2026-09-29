-- Business website (jetenvoieca.com) — platform-level, not tied to any
-- Artist or Site. See WebsiteHome / WebsitePage / WebsiteMenuItem in
-- schema.prisma.

-- CreateTable: the one Home page (always id 'singleton').
CREATE TABLE "WebsiteHome" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "imageUrl" TEXT,
    "wordmark" TEXT NOT NULL DEFAULT 'JETENVOIECA',
    "email" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteHome_pkey" PRIMARY KEY ("id")
);

-- CreateTable: content pages.
CREATE TABLE "WebsitePage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "caption" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsitePage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebsitePage_slug_key" ON "WebsitePage"("slug");
CREATE INDEX "WebsitePage_position_idx" ON "WebsitePage"("position");

-- CreateTable: the Home page's menu items.
CREATE TABLE "WebsiteMenuItem" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL DEFAULT '',
    "hoverText" TEXT NOT NULL DEFAULT '',
    "pageId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteMenuItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebsiteMenuItem_position_idx" ON "WebsiteMenuItem"("position");
CREATE INDEX "WebsiteMenuItem_pageId_idx" ON "WebsiteMenuItem"("pageId");

ALTER TABLE "WebsiteMenuItem" ADD CONSTRAINT "WebsiteMenuItem_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "WebsitePage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

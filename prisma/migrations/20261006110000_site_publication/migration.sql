-- Publishing (2026-10-06): "Publish to live site" now saves a snapshot
-- of everything the site's pages show, which the site's pages are drawn
-- from — see SitePublication in schema.prisma. The old per-page
-- liveBlocks copy is no longer read anywhere, so it goes.
CREATE TABLE "SitePublication" (
    "siteId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SitePublication_pkey" PRIMARY KEY ("siteId")
);

ALTER TABLE "SitePublication" ADD CONSTRAINT "SitePublication_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Page" DROP COLUMN "liveBlocks";

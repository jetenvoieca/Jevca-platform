-- Administration → Concierge (2026-11-13, Craig): a Concierge request keeps
-- the site it was sent from, so the task (e.g. Reorder pages) is done on
-- that site. Requests already sent take their client's site when the
-- client has only one.
ALTER TABLE "HopperNote" ADD COLUMN "siteId" TEXT;
ALTER TABLE "HopperNote" ADD CONSTRAINT "HopperNote_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "HopperNote" n
SET "siteId" = s."id"
FROM "Site" s
WHERE n."kind" IS NOT NULL
  AND n."siteId" IS NULL
  AND s."artistId" = n."artistId"
  AND (SELECT COUNT(*) FROM "Site" s2 WHERE s2."artistId" = n."artistId") = 1;

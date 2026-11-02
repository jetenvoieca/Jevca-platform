-- An exhibition's page on the artist's old ISYT site, when brought in by
-- the browser importer (2026-11-02) — see Exhibition.sourceUrl.
ALTER TABLE "Exhibition" ADD COLUMN "sourceUrl" TEXT;
CREATE UNIQUE INDEX "Exhibition_artistId_sourceUrl_key" ON "Exhibition"("artistId", "sourceUrl");

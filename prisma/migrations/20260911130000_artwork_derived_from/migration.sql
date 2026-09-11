-- AlterTable: track which artwork (if any) a "Create Derivative" copy
-- was made from (2026-09-11) — shown in the Catalogue tab's header as
-- "Derived from #...". See the matching comment on Artwork.derivedFromId
-- in schema.prisma.
ALTER TABLE "Artwork" ADD COLUMN "derivedFromId" TEXT;

ALTER TABLE "Artwork" ADD CONSTRAINT "Artwork_derivedFromId_fkey"
  FOREIGN KEY ("derivedFromId") REFERENCES "Artwork"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Artwork_derivedFromId_idx" ON "Artwork"("derivedFromId");

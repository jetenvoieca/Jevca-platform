-- Hopper notes (2026-10-31): Done keeps a note on record (doneAt) and
-- takes it out of the Hopper; Delete removes it — see HopperNote.
ALTER TABLE "HopperNote" ADD COLUMN "doneAt" TIMESTAMP(3);

DROP INDEX "HopperNote_artistId_createdAt_idx";

CREATE INDEX "HopperNote_artistId_doneAt_idx" ON "HopperNote"("artistId", "doneAt");

-- A curation's Description becomes plain text (2026-10-05, direct
-- request — formatting not needed). Rebuilt rather than converted: the
-- only descriptions written so far were tests, and starting them blank
-- was agreed.
ALTER TABLE "Curation" DROP COLUMN "description";
ALTER TABLE "Curation" ADD COLUMN "description" TEXT;

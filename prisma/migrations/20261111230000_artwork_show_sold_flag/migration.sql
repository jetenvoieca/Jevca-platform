-- Show sold flag (2026-11-11, Craig's request): whether a sold work's SOLD
-- flag shows on the website — e.g. imported works sold long ago. On by
-- default, as before.
ALTER TABLE "Artwork" ADD COLUMN "showSoldFlag" BOOLEAN NOT NULL DEFAULT true;

-- A component filled with "Unsold works" (2026-10-26) — the curation's
-- works with sold ones left out. See PageComponentContent.unsoldOnly.
ALTER TABLE "PageComponentContent" ADD COLUMN "unsoldOnly" BOOLEAN NOT NULL DEFAULT false;

-- A curation's own Description (2026-10-05) — formatted text stored as
-- JSON. See the note on Curation.description in schema.prisma. Null for
-- every existing curation until one is written.
ALTER TABLE "Curation" ADD COLUMN "description" JSONB;

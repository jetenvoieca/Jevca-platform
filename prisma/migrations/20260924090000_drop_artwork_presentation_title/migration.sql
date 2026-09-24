-- One artwork name (2026-09-24): the artwork's Name (catalogueName) is
-- now the only name used anywhere in the app. The old separate
-- Presentation title is dropped outright, by direct decision — any
-- wording that differed from Name is intentionally not kept.
ALTER TABLE "Artwork" DROP COLUMN "presentationTitle";

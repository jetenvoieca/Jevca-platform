-- The Artist Statement and Biography / CV in the Profile Catalogue
-- (2026-11-02) — see ProfileStory.kind.
CREATE TYPE "ProfileStoryKind" AS ENUM ('STORY', 'STATEMENT', 'BIOGRAPHY');
ALTER TABLE "ProfileStory" ADD COLUMN "kind" "ProfileStoryKind" NOT NULL DEFAULT 'STORY';

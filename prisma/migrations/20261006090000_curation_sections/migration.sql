-- A curation's presentation sections (2026-10-06): Tag line, Description,
-- Video, Free text and Images, in any number and order. See
-- CurationSection in schema.prisma.
CREATE TYPE "CurationSectionType" AS ENUM ('TAGLINE', 'DESCRIPTION', 'VIDEO', 'TEXT', 'IMAGES');

CREATE TABLE "CurationSection" (
    "id" TEXT NOT NULL,
    "curationId" TEXT NOT NULL,
    "type" "CurationSectionType" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "heading" TEXT,
    "text" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurationSection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CurationSection_curationId_position_idx" ON "CurationSection"("curationId", "position");

ALTER TABLE "CurationSection" ADD CONSTRAINT "CurationSection_curationId_fkey" FOREIGN KEY ("curationId") REFERENCES "Curation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CurationSectionMedia" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "CurationSectionMedia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CurationSectionMedia_sectionId_imageId_key" ON "CurationSectionMedia"("sectionId", "imageId");
CREATE INDEX "CurationSectionMedia_sectionId_position_idx" ON "CurationSectionMedia"("sectionId", "position");
CREATE INDEX "CurationSectionMedia_imageId_idx" ON "CurationSectionMedia"("imageId");

ALTER TABLE "CurationSectionMedia" ADD CONSTRAINT "CurationSectionMedia_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CurationSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CurationSectionMedia" ADD CONSTRAINT "CurationSectionMedia_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Image"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Each curation's existing Description becomes its first section, so
-- nothing written is lost, then the old column goes.
INSERT INTO "CurationSection" ("id", "curationId", "type", "position", "text", "updatedAt")
SELECT 'cs' || md5(random()::text || "id"), "id", 'DESCRIPTION', 0, "description", CURRENT_TIMESTAMP
FROM "Curation"
WHERE "description" IS NOT NULL;

ALTER TABLE "Curation" DROP COLUMN "description";

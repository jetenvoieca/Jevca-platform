-- Galleries in the Profile Catalogue (2026-11-03, Craig's request): a
-- third fixed entry listing chosen gallery Locations in order, and a
-- Town on gallery contacts to show with each.
ALTER TYPE "ProfileStoryKind" ADD VALUE 'GALLERIES';

ALTER TABLE "Customer" ADD COLUMN "town" TEXT;

CREATE TABLE "ProfileGallery" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ProfileGallery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProfileGallery_storyId_locationId_key" ON "ProfileGallery"("storyId", "locationId");
CREATE INDEX "ProfileGallery_locationId_idx" ON "ProfileGallery"("locationId");

ALTER TABLE "ProfileGallery" ADD CONSTRAINT "ProfileGallery_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "ProfileStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileGallery" ADD CONSTRAINT "ProfileGallery_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

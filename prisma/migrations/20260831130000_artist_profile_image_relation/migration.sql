-- AlterTable: switch Artist's Personal Profile photo from a separate
-- direct-upload URL to a real relation to an existing Image row, picked
-- via MediaPicker from the artist's own Media Catalogue (2026-08-31,
-- direct request — "keep everything in one place"). No production data
-- existed in profileImageUrl yet (this column was only added minutes
-- earlier, in a build that hadn't gone live), so it's safe to drop
-- outright rather than migrate any values across.
ALTER TABLE "Artist" DROP COLUMN "profileImageUrl";
ALTER TABLE "Artist" ADD COLUMN "profileImageId" TEXT;
ALTER TABLE "Artist" ADD CONSTRAINT "Artist_profileImageId_key" UNIQUE ("profileImageId");
ALTER TABLE "Artist" ADD CONSTRAINT "Artist_profileImageId_fkey" FOREIGN KEY ("profileImageId") REFERENCES "Image"("id") ON DELETE SET NULL ON UPDATE CASCADE;

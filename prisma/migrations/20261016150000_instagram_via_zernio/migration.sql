-- Instagram posting moves to Zernio (2026-10-16): the Meta app route was
-- dropped, so a connection now records the artist's Zernio account, and
-- each artist keeps their Zernio profile. No connection was ever made
-- the old way, so the table is emptied before its columns change.

DELETE FROM "InstagramConnection";

-- AlterTable
ALTER TABLE "InstagramConnection" DROP COLUMN "instagramUserId",
DROP COLUMN "accessTokenEncrypted",
DROP COLUMN "expiresAt",
DROP COLUMN "renewError",
DROP COLUMN "updatedAt",
ADD COLUMN "zernioAccountId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "InstagramConnection_zernioAccountId_key" ON "InstagramConnection"("zernioAccountId");

-- AlterTable
ALTER TABLE "Artist" ADD COLUMN "zernioProfileId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Artist_zernioProfileId_key" ON "Artist"("zernioProfileId");

-- An artist's Instagram account, connected for posting (2026-10-15).

-- CreateTable
CREATE TABLE "InstagramConnection" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "instagramUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstagramConnection_artistId_key" ON "InstagramConnection"("artistId");

-- AddForeignKey
ALTER TABLE "InstagramConnection" ADD CONSTRAINT "InstagramConnection_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

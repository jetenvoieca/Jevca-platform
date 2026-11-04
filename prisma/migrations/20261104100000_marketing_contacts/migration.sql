-- Administration → Contacts (2026-11-04, Craig's request): the platform's
-- own marketing list of artists and galleries — see MarketingContact.
CREATE TYPE "MarketingContactType" AS ENUM ('GALLERY', 'ARTIST');

CREATE TABLE "MarketingContact" (
    "id" TEXT NOT NULL,
    "type" "MarketingContactType" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "instagram" TEXT,
    "tiktok" TEXT,
    "town" TEXT,
    "country" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketingContact_type_idx" ON "MarketingContact"("type");

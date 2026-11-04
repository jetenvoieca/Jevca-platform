-- Contacts (2026-11-04, Craig's request): a gallery's artists and an
-- artist's galleries — see MarketingContactLink.
CREATE TABLE "MarketingContactLink" (
    "galleryId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingContactLink_pkey" PRIMARY KEY ("galleryId","artistId")
);

CREATE INDEX "MarketingContactLink_artistId_idx" ON "MarketingContactLink"("artistId");
ALTER TABLE "MarketingContactLink" ADD CONSTRAINT "MarketingContactLink_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "MarketingContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingContactLink" ADD CONSTRAINT "MarketingContactLink_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "MarketingContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

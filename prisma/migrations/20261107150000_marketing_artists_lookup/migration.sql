-- Contacts (2026-11-07, Craig's request): the artists a gallery's website
-- lists, as last looked up, so the lookup runs again only on Update.
CREATE TABLE "MarketingArtistsLookup" (
    "contactId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "artists" JSONB NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingArtistsLookup_pkey" PRIMARY KEY ("contactId")
);

ALTER TABLE "MarketingArtistsLookup" ADD CONSTRAINT "MarketingArtistsLookup_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "MarketingContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Contacts (2026-11-06, Craig's request): a gallery's contact person,
-- price band and works types, and tags grouping contacts (e.g. "Louise
-- Dear criteria") — see MarketingContact, MarketingTag.
CREATE TYPE "MarketingWorksType" AS ENUM ('ORIGINALS', 'PRINTS', 'SCULPTURE', 'PHOTOGRAPHY', 'MIXED_MEDIA');
CREATE TYPE "MarketingCurrency" AS ENUM ('GBP', 'EUR', 'USD');

ALTER TABLE "MarketingContact"
    ADD COLUMN "contactPerson" TEXT,
    ADD COLUMN "priceMin" INTEGER,
    ADD COLUMN "priceMax" INTEGER,
    ADD COLUMN "priceCurrency" "MarketingCurrency",
    ADD COLUMN "worksTypes" "MarketingWorksType"[] DEFAULT ARRAY[]::"MarketingWorksType"[];

CREATE TABLE "MarketingTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketingTag_name_key" ON "MarketingTag"("name");

CREATE TABLE "MarketingContactTag" (
    "contactId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "MarketingContactTag_pkey" PRIMARY KEY ("contactId","tagId")
);

CREATE INDEX "MarketingContactTag_tagId_idx" ON "MarketingContactTag"("tagId");
ALTER TABLE "MarketingContactTag" ADD CONSTRAINT "MarketingContactTag_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "MarketingContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingContactTag" ADD CONSTRAINT "MarketingContactTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "MarketingTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

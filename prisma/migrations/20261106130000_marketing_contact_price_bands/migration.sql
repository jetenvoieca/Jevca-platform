-- Contacts (2026-11-06, Craig's request): separate price bands for
-- originals and prints. The one band so far becomes the originals band.
ALTER TABLE "MarketingContact" RENAME COLUMN "priceMin" TO "originalsMin";
ALTER TABLE "MarketingContact" RENAME COLUMN "priceMax" TO "originalsMax";
ALTER TABLE "MarketingContact"
    ADD COLUMN "printsMin" INTEGER,
    ADD COLUMN "printsMax" INTEGER;

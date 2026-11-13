-- Personal Concierge (2026-11-13, Craig): a product (Plan.includesConcierge
-- or add-on CONCIERGE) giving the Artist App its Concierge — requests sent
-- to the client's Hopper as notes, with the kind of request and one
-- picture.
ALTER TYPE "AddOn" ADD VALUE IF NOT EXISTS 'CONCIERGE';
ALTER TABLE "Plan" ADD COLUMN "includesConcierge" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HopperNote" ADD COLUMN "kind" TEXT;
ALTER TABLE "HopperNote" ADD COLUMN "imageId" TEXT;
ALTER TABLE "HopperNote" ADD CONSTRAINT "HopperNote_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Image"("id") ON DELETE SET NULL ON UPDATE CASCADE;

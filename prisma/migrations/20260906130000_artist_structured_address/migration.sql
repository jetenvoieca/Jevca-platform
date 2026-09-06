-- Reform Artist's freeform invoiceAddress into structured fields
-- (2026-09-06, direct request — "reform the Artist address field so it
-- can be used wherever needed") — lets both the invoice PDF and the
-- Certificate of Authenticity's signature block (which needs just
-- postcode + country, e.g. "11440, France") pull exactly the piece they
-- need instead of parsing one blob of free text.

ALTER TABLE "Artist" ADD COLUMN "addressLine1" TEXT;
ALTER TABLE "Artist" ADD COLUMN "city" TEXT;
ALTER TABLE "Artist" ADD COLUMN "postcode" TEXT;
ALTER TABLE "Artist" ADD COLUMN "country" TEXT;

-- Move the old freeform text across as a starting point rather than
-- attempting to automatically parse city/postcode/country out of it —
-- there's no reliable way to split an arbitrary address string, so
-- those three are left blank for a quick manual fill-in per artist.
UPDATE "Artist" SET "addressLine1" = "invoiceAddress" WHERE "invoiceAddress" IS NOT NULL;

ALTER TABLE "Artist" DROP COLUMN "invoiceAddress";

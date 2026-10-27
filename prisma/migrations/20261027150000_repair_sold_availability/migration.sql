-- One-off repair (2026-10-27): works with a sale on record but still
-- marked AVAILABLE (e.g. "Sarah Sixtieth Commission" — paid 27/06, shown
-- unsold). Brings them in line with what recording each kind of sale
-- does (lib/purchases.ts): a paid sale, or a gallery/own-location sale
-- recorded but not yet paid, makes the work SOLD; a direct sale still
-- being paid makes it RESERVED. Framing/delivery charge sales
-- ("parentPurchaseId") and cancelled sales are ignored.
UPDATE "Artwork" a
SET "availability" = 'SOLD'
WHERE a."availability" = 'AVAILABLE'
  AND EXISTS (
    SELECT 1 FROM "Purchase" p
    WHERE p."artworkId" = a."id"
      AND p."parentPurchaseId" IS NULL
      AND (p."status" = 'COMPLETED' OR (p."status" = 'ACTIVE' AND p."channel" = 'GALLERY'))
  );

UPDATE "Artwork" a
SET "availability" = 'RESERVED'
WHERE a."availability" = 'AVAILABLE'
  AND EXISTS (
    SELECT 1 FROM "Purchase" p
    WHERE p."artworkId" = a."id"
      AND p."parentPurchaseId" IS NULL
      AND p."status" = 'ACTIVE'
      AND p."channel" = 'STRIPE'
  );

-- Framing/delivery charge sales and a separate receipt sent-log
-- (2026-09-23) — see the notes on Purchase.parentPurchaseId and
-- Purchase.receiptEmailedAt in schema.prisma.
CREATE TYPE "ChargeKind" AS ENUM ('FRAMING', 'DELIVERY');

ALTER TABLE "Purchase" ADD COLUMN "parentPurchaseId" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "chargeKind" "ChargeKind";
ALTER TABLE "Purchase" ADD COLUMN "receiptEmailedAt" TIMESTAMP(3);
ALTER TABLE "Purchase" ADD COLUMN "receiptEmailedTo" TEXT;

CREATE INDEX "Purchase_parentPurchaseId_idx" ON "Purchase"("parentPurchaseId");

ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_parentPurchaseId_fkey"
  FOREIGN KEY ("parentPurchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Until now a receipt send overwrote the invoice log. Rebuild both from
-- the unified Sent list (OutboundEmail, kept since 2026-09-05): the
-- latest RECEIPT send becomes the receipt log, and the invoice log goes
-- back to the latest INVOICE send, where there was one.
UPDATE "Purchase" p
SET "receiptEmailedAt" = o."sentAt", "receiptEmailedTo" = o."toAddress"
FROM (
  SELECT DISTINCT ON ("purchaseId") "purchaseId", "sentAt", "toAddress"
  FROM "OutboundEmail"
  WHERE "kind" = 'RECEIPT' AND "purchaseId" IS NOT NULL
  ORDER BY "purchaseId", "sentAt" DESC
) o
WHERE o."purchaseId" = p."id";

UPDATE "Purchase" p
SET "invoiceEmailedAt" = o."sentAt", "invoiceEmailedTo" = o."toAddress"
FROM (
  SELECT DISTINCT ON ("purchaseId") "purchaseId", "sentAt", "toAddress"
  FROM "OutboundEmail"
  WHERE "kind" = 'INVOICE' AND "purchaseId" IS NOT NULL
  ORDER BY "purchaseId", "sentAt" DESC
) o
WHERE o."purchaseId" = p."id";

UPDATE "Purchase" p
SET "invoiceEmailedAt" = NULL, "invoiceEmailedTo" = NULL
WHERE p."receiptEmailedAt" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "OutboundEmail" o WHERE o."purchaseId" = p."id" AND o."kind" = 'INVOICE'
  );

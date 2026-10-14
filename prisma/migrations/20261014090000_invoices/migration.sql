-- Invoices (2026-10-14, Craig's mockup): one invoice can cover several
-- sales. Invoice numbers, the invoice payment link and the invoice /
-- receipt sent dates move from Purchase onto the new Invoice table.

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "stripeMode" "StripeMode" NOT NULL,
    "stripeAccountId" TEXT,
    "stripePaymentLinkId" TEXT,
    "stripePaymentLinkUrl" TEXT,
    "emailedAt" TIMESTAMP(3),
    "emailedTo" TEXT,
    "receiptEmailedAt" TIMESTAMP(3),
    "receiptEmailedTo" TEXT,
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "invoiceId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("invoiceId","purchaseId")
);

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN "invoiceId" TEXT;
ALTER TABLE "OutboundEmail" ADD COLUMN "invoiceId" TEXT;

-- Every sale that already has an invoice number becomes an invoice of
-- one, keeping its number, sent dates and (if still unpaid) payment
-- link. Its date is when it was
-- first sent, or else when the sale was recorded. A cancelled sale's
-- invoice is kept as a cancelled invoice. (Should two sales of one
-- artist ever share a number, only the first keeps it.)
CREATE TEMP TABLE "_invoice_seed" AS
SELECT DISTINCT ON (a."id", p."invoiceNumber")
    replace(gen_random_uuid()::text, '-', '') AS "invoiceId",
    p."id" AS "purchaseId",
    a."id" AS "artistId",
    p."invoiceNumber",
    p."currency",
    p."stripeMode",
    p."stripeAccountId",
    p."stripePaymentLinkId",
    p."stripePaymentLinkUrl",
    p."invoiceEmailedAt",
    p."invoiceEmailedTo",
    p."receiptEmailedAt",
    p."receiptEmailedTo",
    p."status",
    p."closedAt",
    COALESCE(p."invoiceEmailedAt", p."receiptEmailedAt", p."createdAt") AS "createdAt"
FROM "Purchase" p
JOIN "Artwork" w ON w."id" = p."artworkId"
JOIN "Artist" a ON a."id" = w."artistId"
WHERE p."invoiceNumber" IS NOT NULL
ORDER BY a."id", p."invoiceNumber", p."createdAt";

INSERT INTO "Invoice" (
    "id", "artistId", "number", "currency", "stripeMode", "stripeAccountId",
    "stripePaymentLinkId", "stripePaymentLinkUrl", "emailedAt", "emailedTo", "receiptEmailedAt", "receiptEmailedTo",
    "paidAt", "cancelledAt", "createdAt"
)
SELECT
    "invoiceId", "artistId", "invoiceNumber", "currency", "stripeMode", "stripeAccountId",
    CASE WHEN "status" = 'ACTIVE' THEN "stripePaymentLinkId" END,
    CASE WHEN "status" = 'ACTIVE' THEN "stripePaymentLinkUrl" END,
    "invoiceEmailedAt", "invoiceEmailedTo", "receiptEmailedAt", "receiptEmailedTo",
    CASE WHEN "status" = 'COMPLETED' THEN COALESCE("closedAt", "createdAt") END,
    CASE WHEN "status" = 'ABANDONED' THEN COALESCE("closedAt", "createdAt") END,
    "createdAt"
FROM "_invoice_seed";

INSERT INTO "InvoiceLine" ("invoiceId", "purchaseId", "position")
SELECT "invoiceId", "purchaseId", 0 FROM "_invoice_seed";

-- An unpaid sale's full-amount payment link becomes its invoice's link.
UPDATE "Purchase" p
SET "invoiceId" = s."invoiceId",
    "stripePaymentLinkId" = CASE WHEN s."status" = 'ACTIVE' THEN NULL ELSE p."stripePaymentLinkId" END,
    "stripePaymentLinkUrl" = CASE WHEN s."status" = 'ACTIVE' THEN NULL ELSE p."stripePaymentLinkUrl" END
FROM "_invoice_seed" s
WHERE s."purchaseId" = p."id" AND s."status" <> 'ABANDONED';

-- Invoice and receipt emails already sent now belong to the invoice.
UPDATE "OutboundEmail" o
SET "invoiceId" = s."invoiceId", "purchaseId" = NULL
FROM "_invoice_seed" s
WHERE s."purchaseId" = o."purchaseId" AND o."kind" IN ('INVOICE', 'RECEIPT');

DROP TABLE "_invoice_seed";

-- AlterTable
ALTER TABLE "Purchase" DROP COLUMN "invoiceNumber",
DROP COLUMN "invoiceEmailedAt",
DROP COLUMN "invoiceEmailedTo",
DROP COLUMN "receiptEmailedAt",
DROP COLUMN "receiptEmailedTo";

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_artistId_number_key" ON "Invoice"("artistId", "number");

-- CreateIndex
CREATE INDEX "Invoice_paidAt_cancelledAt_emailedAt_idx" ON "Invoice"("paidAt", "cancelledAt", "emailedAt");

-- CreateIndex
CREATE INDEX "InvoiceLine_purchaseId_idx" ON "InvoiceLine"("purchaseId");

-- CreateIndex
CREATE INDEX "Purchase_invoiceId_idx" ON "Purchase"("invoiceId");

-- CreateIndex
CREATE INDEX "OutboundEmail_invoiceId_idx" ON "OutboundEmail"("invoiceId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundEmail" ADD CONSTRAINT "OutboundEmail_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

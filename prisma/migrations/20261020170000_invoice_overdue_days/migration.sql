-- Per-client number of days after an invoice is produced before it's
-- overdue (the alert now counts from the date invoiced, not emailed).
ALTER TABLE "Artist" ADD COLUMN "invoiceOverdueDays" INTEGER NOT NULL DEFAULT 21;

DROP INDEX "Invoice_paidAt_cancelledAt_emailedAt_idx";
CREATE INDEX "Invoice_paidAt_cancelledAt_createdAt_idx" ON "Invoice"("paidAt", "cancelledAt", "createdAt");

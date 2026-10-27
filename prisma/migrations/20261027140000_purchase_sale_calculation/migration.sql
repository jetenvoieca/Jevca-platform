-- How a gallery sale's price was worked out (2026-10-27) — VAT removed
-- and exchange rate. See Purchase.priceAsSold in schema.prisma.
ALTER TABLE "Purchase" ADD COLUMN "priceAsSold" DECIMAL(10,2);
ALTER TABLE "Purchase" ADD COLUMN "currencyAsSold" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "vatPercentRemoved" DECIMAL(5,2);
ALTER TABLE "Purchase" ADD COLUMN "exchangeRate" DECIMAL(12,6);

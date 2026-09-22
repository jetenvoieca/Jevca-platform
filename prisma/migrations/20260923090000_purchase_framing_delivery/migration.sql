-- Framing / delivery on a sale (2026-09-23) — see the note on
-- Purchase.framer in schema.prisma.
ALTER TABLE "Purchase" ADD COLUMN "framer" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "framingCost" DECIMAL(10,2);
ALTER TABLE "Purchase" ADD COLUMN "courier" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "deliveryCost" DECIMAL(10,2);

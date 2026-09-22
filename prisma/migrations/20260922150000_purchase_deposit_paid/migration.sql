-- Phase 1 sale-recording rework (2026-09-22) — see the note on
-- Purchase.depositPaid in schema.prisma.
ALTER TABLE "Purchase" ADD COLUMN "depositPaid" DECIMAL(10,2);

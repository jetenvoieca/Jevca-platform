-- Instalment payment link on a consigned sale (2026-09-23) — see the note
-- on Purchase.stripeInstalmentLinkId in schema.prisma.
ALTER TABLE "Purchase" ADD COLUMN "stripeInstalmentLinkId" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "stripeInstalmentLinkUrl" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "stripeInstalmentLinkCount" INTEGER;

-- Sites billed from their plan (2026-11-10, sign-up) — see Site in
-- schema.prisma.
ALTER TABLE "Site" ADD COLUMN "billingStripeMode" "StripeMode";
ALTER TABLE "Site" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "Site" ADD COLUMN "stripeSubscriptionId" TEXT;
ALTER TABLE "Site" ADD COLUMN "stripeSubscriptionStatus" TEXT;
CREATE UNIQUE INDEX "Site_stripeSubscriptionId_key" ON "Site"("stripeSubscriptionId");

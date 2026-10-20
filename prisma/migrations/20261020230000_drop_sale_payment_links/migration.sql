-- One payment link per invoice and per statement — sales no longer have
-- their own. (Links already made stay usable in Stripe until switched off
-- there; they're recorded by the sale's id as before.)
ALTER TABLE "Purchase" DROP COLUMN "stripePaymentLinkId";
ALTER TABLE "Purchase" DROP COLUMN "stripePaymentLinkUrl";

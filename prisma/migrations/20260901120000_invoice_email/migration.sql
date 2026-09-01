-- AlterTable: Purchase gains a persistent gallery payment link and an
-- invoice-email log (2026-09-01, Part Three).
--
-- stripePaymentLinkId/Url: a real Stripe Payment Link (not a Checkout
-- Session, which is what the existing Stripe-sale flow elsewhere in this
-- app uses) for the NET amount a gallery owes on this sale. Deliberately
-- the Payment Links API — a gallery invoice can sit unpaid for weeks,
-- and Checkout Session URLs expire; a Payment Link doesn't. See
-- createGalleryPaymentLink in lib/actions/payments.ts.
--
-- invoiceEmailedAt/To: when the invoice for this sale was last actually
-- emailed, and to which address — set only by sendInvoiceEmail
-- (lib/actions/invoiceEmail.ts). Purely a log for display ("Invoice sent
-- 01/09/2026"); re-sending overwrites both rather than keeping history.
ALTER TABLE "Purchase" ADD COLUMN "stripePaymentLinkId" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "stripePaymentLinkUrl" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "invoiceEmailedAt" TIMESTAMP(3);
ALTER TABLE "Purchase" ADD COLUMN "invoiceEmailedTo" TEXT;

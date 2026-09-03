-- AlterTable: a Settings-editable list of payment methods (2026-09-03),
-- same pattern as Artist.expenseCategories/saleSources/etc. — edited via
-- SettingsListCard on the Artwork Catalogue's Settings screen, offered
-- as the "Method" dropdown when marking a gallery sale paid.
ALTER TABLE "Artist" ADD COLUMN "paymentMethods" TEXT[] NOT NULL DEFAULT ARRAY['Bank transfer', 'Cash', 'Cheque', 'Card', 'PayPal']::TEXT[];

-- AlterTable: which payment method was actually used, recorded at the
-- same moment a gallery sale is marked paid (2026-09-03) — set only by
-- markGallerySalePaid (lib/actions/payments.ts). Null for every Payment
-- row created before this existed, and for Stripe-channel payments
-- (the method there is always "card", not worth recording per row).
ALTER TABLE "Payment" ADD COLUMN "method" TEXT;

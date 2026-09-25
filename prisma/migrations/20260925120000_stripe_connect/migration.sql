-- Stripe Connect (2026-09-25) — each artist can link their own Stripe
-- account; each sale records which account (and mode) it belongs to.
-- See StripeConnection and Purchase.stripeAccountId in schema.prisma.

-- Purchase: the sale's own Stripe mode and account.
ALTER TABLE "Purchase" ADD COLUMN "stripeMode" "StripeMode" NOT NULL DEFAULT 'TEST';
ALTER TABLE "Purchase" ADD COLUMN "stripeAccountId" TEXT;

-- Every existing sale was made on Jetenvoieca's own account
-- (stripeAccountId stays null) in its artist's current mode.
UPDATE "Purchase" p
SET "stripeMode" = a."stripeMode"
FROM "Artwork" w
JOIN "Artist" a ON a."id" = w."artistId"
WHERE w."id" = p."artworkId";

-- From now on every sale sets its mode explicitly.
ALTER TABLE "Purchase" ALTER COLUMN "stripeMode" DROP DEFAULT;

CREATE INDEX "Purchase_stripeAccountId_idx" ON "Purchase"("stripeAccountId");

-- CreateTable
CREATE TABLE "StripeConnection" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "mode" "StripeMode" NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountName" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StripeConnection_artistId_mode_key" ON "StripeConnection"("artistId", "mode");
CREATE INDEX "StripeConnection_accountId_idx" ON "StripeConnection"("accountId");

-- AddForeignKey
ALTER TABLE "StripeConnection" ADD CONSTRAINT "StripeConnection_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

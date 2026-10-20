-- Statements for gallery locations: every sale still owed, with a Pay all link.
CREATE TABLE "Statement" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "currency" TEXT,
    "stripeMode" "StripeMode",
    "stripeAccountId" TEXT,
    "stripePaymentLinkId" TEXT,
    "stripePaymentLinkUrl" TEXT,
    "emailedAt" TIMESTAMP(3),
    "emailedTo" TEXT,
    "paidAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Statement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StatementLine" (
    "statementId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "StatementLine_pkey" PRIMARY KEY ("statementId","purchaseId")
);

CREATE INDEX "Statement_customerId_closedAt_idx" ON "Statement"("customerId", "closedAt");
CREATE INDEX "StatementLine_purchaseId_idx" ON "StatementLine"("purchaseId");

ALTER TABLE "Statement" ADD CONSTRAINT "Statement_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StatementLine" ADD CONSTRAINT "StatementLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "Statement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StatementLine" ADD CONSTRAINT "StatementLine_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

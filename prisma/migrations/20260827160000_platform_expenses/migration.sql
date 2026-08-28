-- CreateTable: the platform owner's own business expenses, not tied to
-- any artist.
CREATE TABLE "PlatformExpense" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "payeeName" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "category" TEXT NOT NULL DEFAULT 'Other',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformExpense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformExpense_date_idx" ON "PlatformExpense"("date");

-- CreateTable: single-row config table, always accessed via id
-- 'singleton' — holds the editable category list for PlatformExpense.
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "expenseCategories" TEXT[] NOT NULL DEFAULT ARRAY['Hosting','Domains','Software & APIs','Legal & Accounting','Marketing','Other'],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

-- Seed the one row this table will ever have.
INSERT INTO "PlatformSettings" ("id", "updatedAt") VALUES ('singleton', CURRENT_TIMESTAMP);

-- AlterTable: add the editable per-artist category list, seeded with
-- the same defaults the fixed enum used to offer, so nothing changes
-- for existing artists until they actually edit the list themselves.
ALTER TABLE "Artist" ADD COLUMN "expenseCategories" TEXT[] NOT NULL DEFAULT ARRAY['Materials','Studio','Framing','Insurance','Equipment','Shipping','Professional fees','Travel','Marketing','Other'];

-- AlterTable: convert Expense.category from the fixed ExpenseCategory
-- enum to free text, validated against the artist's own editable list
-- at the UI level rather than by the database. Existing rows keep their
-- meaning — enum values are mapped to the matching human-readable label.
ALTER TABLE "Expense" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "Expense" ALTER COLUMN "category" TYPE TEXT USING (
  CASE "category"::text
    WHEN 'MATERIALS' THEN 'Materials'
    WHEN 'STUDIO' THEN 'Studio'
    WHEN 'FRAMING' THEN 'Framing'
    WHEN 'INSURANCE' THEN 'Insurance'
    WHEN 'EQUIPMENT' THEN 'Equipment'
    WHEN 'SHIPPING' THEN 'Shipping'
    WHEN 'PROFESSIONAL_FEES' THEN 'Professional fees'
    WHEN 'TRAVEL' THEN 'Travel'
    WHEN 'MARKETING' THEN 'Marketing'
    ELSE 'Other'
  END
);
ALTER TABLE "Expense" ALTER COLUMN "category" SET DEFAULT 'Other';

-- DropEnum: no longer used now Expense.category is free text.
DROP TYPE "ExpenseCategory";

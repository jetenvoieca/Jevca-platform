-- AlterTable: Artist gains the Sale sources preset list
ALTER TABLE "Artist" ADD COLUMN "saleSources" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable: Purchase gains a source field (who initiated the sale)
ALTER TABLE "Purchase" ADD COLUMN "source" TEXT;

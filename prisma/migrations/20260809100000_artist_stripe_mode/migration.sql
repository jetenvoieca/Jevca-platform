-- CreateEnum
CREATE TYPE "StripeMode" AS ENUM ('TEST', 'LIVE');

-- AlterTable
ALTER TABLE "Artist" ADD COLUMN "stripeMode" "StripeMode" NOT NULL DEFAULT 'TEST';

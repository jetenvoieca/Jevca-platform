-- Trusted senders become sender rules: TRUSTED (Not spam) or BLOCKED
-- (Mark as spam). Existing rows are trusted senders.
CREATE TYPE "SenderRuleKind" AS ENUM ('TRUSTED', 'BLOCKED');

ALTER TABLE "TrustedSender" RENAME TO "SenderRule";
ALTER TABLE "SenderRule" RENAME CONSTRAINT "TrustedSender_pkey" TO "SenderRule_pkey";
ALTER INDEX "TrustedSender_address_key" RENAME TO "SenderRule_address_key";

ALTER TABLE "SenderRule" ADD COLUMN "kind" "SenderRuleKind" NOT NULL DEFAULT 'TRUSTED';
ALTER TABLE "SenderRule" ALTER COLUMN "kind" DROP DEFAULT;
ALTER TABLE "SenderRule" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "SenderRule" ALTER COLUMN "updatedAt" DROP DEFAULT;

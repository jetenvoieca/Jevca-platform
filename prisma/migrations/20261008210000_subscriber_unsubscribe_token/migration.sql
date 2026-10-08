-- Marketing → unsubscribe (2026-10-08): each subscriber's own secret
-- token for the unsubscribe link in every campaign mail
-- (news.jevca.art/unsubscribe/<token>). The default is worked out for
-- each existing row too, so every subscriber gets their own.

-- AlterTable
ALTER TABLE "Subscriber" ADD COLUMN "unsubscribeToken" TEXT NOT NULL DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_unsubscribeToken_key" ON "Subscriber"("unsubscribeToken");

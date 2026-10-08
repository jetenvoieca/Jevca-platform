-- Marketing → Subscribers (2026-10-08): each artist's own mailing list
-- and named mail lists. Additive only.

CREATE TYPE "SubscriberStatus" AS ENUM ('SUBSCRIBED', 'UNSUBSCRIBED');

CREATE TYPE "SubscriberSource" AS ENUM ('MANUAL', 'IMPORT', 'CUSTOMER', 'WEBSITE');

CREATE TABLE "Subscriber" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "language" TEXT,
    "status" "SubscriberStatus" NOT NULL DEFAULT 'SUBSCRIBED',
    "source" "SubscriberSource" NOT NULL,
    "consentAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscriber_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MailList" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailList_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MailListMember" (
    "listId" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailListMember_pkey" PRIMARY KEY ("listId","subscriberId")
);

CREATE UNIQUE INDEX "Subscriber_artistId_email_key" ON "Subscriber"("artistId", "email");
CREATE INDEX "Subscriber_artistId_status_idx" ON "Subscriber"("artistId", "status");
CREATE INDEX "Subscriber_customerId_idx" ON "Subscriber"("customerId");

CREATE UNIQUE INDEX "MailList_artistId_name_key" ON "MailList"("artistId", "name");
CREATE INDEX "MailList_artistId_idx" ON "MailList"("artistId");

CREATE INDEX "MailListMember_subscriberId_idx" ON "MailListMember"("subscriberId");

ALTER TABLE "Subscriber" ADD CONSTRAINT "Subscriber_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscriber" ADD CONSTRAINT "Subscriber_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MailList" ADD CONSTRAINT "MailList_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MailListMember" ADD CONSTRAINT "MailListMember_listId_fkey" FOREIGN KEY ("listId") REFERENCES "MailList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailListMember" ADD CONSTRAINT "MailListMember_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

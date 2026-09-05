-- Email Integration (2026-09-05) — real per-artist sending/receiving
-- addresses on the shared jevca.art domain, plus a unified admin inbox.

-- Artist.emailSlug: the local part of this artist's own address
-- (louise.dear -> louise.dear@jevca.art). Backfilled from each
-- artist's name for every existing artist (same slugify rule as
-- generateUniqueEmailSlug in lib/emailSlug.ts), so nothing needs a
-- manual per-artist follow-up after this deploys. Left nullable —
-- unlike hopperToken, a brand-new artist can genuinely go a moment
-- without one before it's assigned.
ALTER TABLE "Artist" ADD COLUMN "emailSlug" TEXT;

WITH base AS (
  SELECT
    "id",
    "createdAt",
    NULLIF(
      regexp_replace(
        regexp_replace(lower("name"), '[^a-z0-9]+', '.', 'g'),
        '(^\.+|\.+$)', '', 'g'
      ),
      ''
    ) AS slug
  FROM "Artist"
),
numbered AS (
  SELECT
    "id",
    COALESCE(slug, 'artist') AS base_slug,
    ROW_NUMBER() OVER (PARTITION BY COALESCE(slug, 'artist') ORDER BY "createdAt") AS rn
  FROM base
)
UPDATE "Artist" a
SET "emailSlug" = CASE WHEN n.rn = 1 THEN n.base_slug ELSE n.base_slug || n.rn::text END
FROM numbered n
WHERE a."id" = n."id";

CREATE UNIQUE INDEX "Artist_emailSlug_key" ON "Artist"("emailSlug");

-- PlatformSettings.adminEmailAddress: the single shared address ad hoc
-- admin emails send from (craig@jevca.art) — editable here rather than
-- an env var, same reasoning as everything else on this singleton row.
ALTER TABLE "PlatformSettings" ADD COLUMN "adminEmailAddress" TEXT NOT NULL DEFAULT 'craig@jevca.art';

-- CreateTable: InboundEmail — every reply/email received at any
-- @jevca.art address, one shared inbox filtered by artist/gallery in
-- the UI rather than split into per-artist mailboxes.
CREATE TABLE "InboundEmail" (
    "id" TEXT NOT NULL,
    "resendEmailId" TEXT NOT NULL,
    "messageId" TEXT,
    "fromAddress" TEXT NOT NULL,
    "fromName" TEXT,
    "toAddress" TEXT NOT NULL,
    "artistId" TEXT,
    "customerId" TEXT,
    "subject" TEXT,
    "textBody" TEXT,
    "htmlBody" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundEmail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboundEmail_resendEmailId_key" ON "InboundEmail"("resendEmailId");
CREATE INDEX "InboundEmail_artistId_idx" ON "InboundEmail"("artistId");
CREATE INDEX "InboundEmail_customerId_idx" ON "InboundEmail"("customerId");
CREATE INDEX "InboundEmail_toAddress_idx" ON "InboundEmail"("toAddress");

ALTER TABLE "InboundEmail" ADD CONSTRAINT "InboundEmail_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InboundEmail" ADD CONSTRAINT "InboundEmail_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: OutboundEmail — the other half of the same inbox: ad hoc
-- admin sends and replies sent from an open thread, so a thread shows
-- both sides. Deliberately separate from Purchase's own
-- invoiceEmailedAt/certificateEmailedAt "last sent" stamps, which are
-- unchanged by this migration.
CREATE TABLE "OutboundEmail" (
    "id" TEXT NOT NULL,
    "resendEmailId" TEXT,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "artistId" TEXT,
    "customerId" TEXT,
    "inReplyToId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundEmail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutboundEmail_resendEmailId_key" ON "OutboundEmail"("resendEmailId");
CREATE INDEX "OutboundEmail_artistId_idx" ON "OutboundEmail"("artistId");
CREATE INDEX "OutboundEmail_customerId_idx" ON "OutboundEmail"("customerId");
CREATE INDEX "OutboundEmail_inReplyToId_idx" ON "OutboundEmail"("inReplyToId");

ALTER TABLE "OutboundEmail" ADD CONSTRAINT "OutboundEmail_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutboundEmail" ADD CONSTRAINT "OutboundEmail_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutboundEmail" ADD CONSTRAINT "OutboundEmail_inReplyToId_fkey" FOREIGN KEY ("inReplyToId") REFERENCES "InboundEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: the artist's signature image, for the Certificate of
-- Authenticity (2026-09-03) — deliberately its own field, separate from
-- the existing Invoicing Logo, since the two aren't always the same
-- image for every artist (though they can be, and often will be).
ALTER TABLE "Artist" ADD COLUMN "signatureUrl" TEXT;

-- CreateTable: editable Certificate of Authenticity wording, one per
-- artwork Type-ish category (Original / Unique / Edition, etc.) — own
-- table rather than a plain string list, since each entry needs both a
-- label (matched against Artwork.type, same free-text-match convention
-- as ArtworkType) and its own certifying text. Same pattern as
-- ArtworkType above it.
CREATE TABLE "CertificateTemplate" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificateTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CertificateTemplate_artistId_idx" ON "CertificateTemplate"("artistId");

-- AddForeignKey
ALTER TABLE "CertificateTemplate" ADD CONSTRAINT "CertificateTemplate_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed every existing artist with the same three starting templates
-- shown in the mockup — editable/removable afterwards from Settings,
-- same "sensible defaults, not empty" approach as
-- Artist.paymentMethods.
INSERT INTO "CertificateTemplate" ("id", "artistId", "label", "text", "updatedAt")
SELECT gen_random_uuid()::text, "id", 'Original', 'I certify that this work is a unique original Artwork created by myself', CURRENT_TIMESTAMP FROM "Artist"
UNION ALL
SELECT gen_random_uuid()::text, "id", 'Unique', 'I certify that this work is a unique Artwork hand finished and embellished by myself', CURRENT_TIMESTAMP FROM "Artist"
UNION ALL
SELECT gen_random_uuid()::text, "id", 'Edition', 'I certify that this work is a genuine reproduction of my original artwork created in a limited edition.', CURRENT_TIMESTAMP FROM "Artist";

-- AlterTable: when a Certificate of Authenticity was last emailed, and
-- to which address (2026-09-03) — same simple current-status log as
-- invoiceEmailedAt/invoiceEmailedTo, not a full send history.
ALTER TABLE "Purchase" ADD COLUMN "certificateEmailedAt" TIMESTAMP(3);
ALTER TABLE "Purchase" ADD COLUMN "certificateEmailedTo" TEXT;

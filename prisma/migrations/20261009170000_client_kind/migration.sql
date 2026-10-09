-- Artist or brand (2026-10-09). Every existing client is an artist.
CREATE TYPE "ClientKind" AS ENUM ('ARTIST', 'BRAND');

ALTER TABLE "Artist" ADD COLUMN "kind" "ClientKind" NOT NULL DEFAULT 'ARTIST';

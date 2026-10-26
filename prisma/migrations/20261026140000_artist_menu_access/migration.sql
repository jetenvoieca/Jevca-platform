-- The site menu items a client's login may reach (2026-10-26) — see
-- Artist.menuAccess.
ALTER TABLE "Artist" ADD COLUMN "menuAccess" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

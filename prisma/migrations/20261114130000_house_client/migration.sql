-- House clients (2026-11-14, Craig): the owners of the sites we run, whose
-- curations mix works from any artist (Administration → Curator).
ALTER TABLE "Artist" ADD COLUMN "isHouse" BOOLEAN NOT NULL DEFAULT false;

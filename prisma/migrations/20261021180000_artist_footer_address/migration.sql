-- Whether the artist's address shows in mail and website footers.
ALTER TABLE "Artist" ADD COLUMN "showFooterAddress" BOOLEAN NOT NULL DEFAULT true;

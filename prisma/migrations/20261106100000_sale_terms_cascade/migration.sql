-- A work's sale terms (its payment set-up) go with it when it's deleted
-- (2026-11-06 — deleting a duplicate failed on them). Its sales
-- (Purchase) still prevent deleting it.
ALTER TABLE "SaleTerms" DROP CONSTRAINT "SaleTerms_artworkId_fkey";
ALTER TABLE "SaleTerms" ADD CONSTRAINT "SaleTerms_artworkId_fkey" FOREIGN KEY ("artworkId") REFERENCES "Artwork"("id") ON DELETE CASCADE ON UPDATE CASCADE;

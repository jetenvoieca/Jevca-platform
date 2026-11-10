-- The Artist App's Account (2026-11-10, Craig's mockup): what a plan
-- includes, one item a line (Portfolio's as the mockup), and the
-- artist's TikTok username.
ALTER TABLE "Plan" ADD COLUMN "included" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Artist" ADD COLUMN "tiktokHandle" TEXT;

UPDATE "Plan" SET "included" = E'Home page\nShowcase Page\nPortfolio with 10 pages\nCV / Biography / Artist statement\nGallery listings\nEvents and Artist stories\nExhibition Listing\nContact page\nPersonal Concierge'
WHERE "id" = 'plan_portfolio';

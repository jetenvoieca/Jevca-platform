-- Business website: a fixed Contact page (2026-09-29). Every page gets a
-- kind; exactly one CONTACT page is created here and can't be deleted
-- from the editor (see deleteWebsitePage in lib/actions/website.ts).

CREATE TYPE "WebsitePageKind" AS ENUM ('CONTENT', 'CONTACT');

ALTER TABLE "WebsitePage" ADD COLUMN "kind" "WebsitePageKind" NOT NULL DEFAULT 'CONTENT';

-- The Contact page, at the end of the page list. Uses the address
-- "contact" unless a page already has it, then "contact-2".
INSERT INTO "WebsitePage" ("id", "name", "slug", "title", "kind", "position", "updatedAt")
SELECT
  gen_random_uuid()::text,
  'Contact',
  CASE WHEN EXISTS (SELECT 1 FROM "WebsitePage" WHERE "slug" = 'contact') THEN 'contact-2' ELSE 'contact' END,
  'CONTACT',
  'CONTACT',
  COALESCE((SELECT MAX("position") FROM "WebsitePage"), -1) + 1,
  CURRENT_TIMESTAMP;

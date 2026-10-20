-- Business website: the fixed Contact page (which showed the email
-- address) is removed — contact is now a form on the Home page. Menu
-- items linking to it keep their text and lose the link (ON DELETE SET NULL).
DELETE FROM "WebsitePage" WHERE "kind" = 'CONTACT';
ALTER TABLE "WebsitePage" DROP COLUMN "kind";
DROP TYPE "WebsitePageKind";

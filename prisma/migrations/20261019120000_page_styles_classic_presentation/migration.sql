-- Page Styles without a Presentation template use Classic (2026-10-19),
-- so editing Classic changes every page that hadn't chosen another.
UPDATE "PageStyle"
SET "presentationTemplateId" = 'presentation_template_classic'
WHERE "presentationTemplateId" IS NULL
  AND EXISTS (SELECT 1 FROM "PresentationTemplate" WHERE "id" = 'presentation_template_classic');

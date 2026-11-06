-- Contacts (2026-11-06, Craig's request): the tag "Louise Dear criteria"
-- is now just "Louise Dear". Merged into an existing "Louise Dear" tag if
-- one was made meanwhile.
INSERT INTO "MarketingContactTag" ("contactId", "tagId")
SELECT ct."contactId", newtag."id"
FROM "MarketingContactTag" ct
JOIN "MarketingTag" oldtag ON oldtag."id" = ct."tagId" AND oldtag."name" = 'Louise Dear criteria'
JOIN "MarketingTag" newtag ON newtag."name" = 'Louise Dear'
ON CONFLICT DO NOTHING;

DELETE FROM "MarketingTag"
WHERE "name" = 'Louise Dear criteria'
  AND EXISTS (SELECT 1 FROM "MarketingTag" WHERE "name" = 'Louise Dear');

UPDATE "MarketingTag" SET "name" = 'Louise Dear' WHERE "name" = 'Louise Dear criteria';

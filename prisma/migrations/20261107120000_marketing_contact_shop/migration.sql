-- Contacts (2026-11-07, Craig's request): the page of a contact's site
-- listing works for sale, where Find prices looks first. Contacts
-- imported with "Shop: <link>" in their notes have it moved here.
ALTER TABLE "MarketingContact" ADD COLUMN "shopUrl" TEXT;

UPDATE "MarketingContact"
SET "shopUrl" = substring("notes" from 'Shop:\s*(https?://\S+)'),
    "notes" = NULLIF(btrim(regexp_replace("notes", '\s*Shop:\s*https?://\S+', '', 'g')), '')
WHERE "notes" ~ 'Shop:\s*https?://';

-- The ISYT "contact" menu item opens the profile page with its Contact
-- panel slid across (2026-11-03, Craig's correction) — see
-- Page.opensPageId. So ISYT — Profile gets the Contact panel (hidden
-- unless the page is opened that way), straight under the Page heading,
-- and ISYT — Contact (made earlier the same day) goes: any page using it
-- loses its style and what filled its components, to be set to open the
-- profile page instead.
UPDATE "PageStyle"
SET "layout" = jsonb_set(
      jsonb_insert(
        "layout",
        '{blocks,1}',
        '{"id": "isyt_profile_contact", "type": "contact", "contact": {"title": "Contact / Mailing List", "share": 50, "titleSize": 19}}'::jsonb
      ),
      '{rows,isyt_profile_contact}',
      '{"below": 0, "between": 16, "horizontal": "left", "vertical": "top"}'::jsonb
    ),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'page_style_isyt_profile'
  AND "layout"->'blocks'->0->>'id' = 'isyt_profile_heading'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements("layout"->'blocks') AS b WHERE b->>'type' = 'contact'
  );

DELETE FROM "PageComponentContent"
WHERE "pageId" IN (SELECT "id" FROM "Page" WHERE "pageStyleId" = 'page_style_isyt_contact');
DELETE FROM "PageSignupForm"
WHERE "pageId" IN (SELECT "id" FROM "Page" WHERE "pageStyleId" = 'page_style_isyt_contact');
DELETE FROM "PageStyle" WHERE "id" = 'page_style_isyt_contact';

-- The Logo becomes a mail component (2026-10-08), so it can sit anywhere
-- in a mail instead of only at the top. Every template that showed the
-- Logo gets a Logo component at the top, where it was; the old
-- "showLogo" setting is then removed from every template.
UPDATE "MailTemplate"
SET "layout" = jsonb_set(
  "layout",
  '{blocks}',
  jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'type', 'logo'))
    || COALESCE("layout"->'blocks', '[]'::jsonb)
)
WHERE COALESCE("layout"->>'showLogo', 'true') <> 'false';

UPDATE "MailTemplate" SET "layout" = "layout" - 'showLogo' WHERE "layout" ? 'showLogo';

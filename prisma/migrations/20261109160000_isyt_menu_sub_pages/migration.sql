-- ISYT menus (2026-11-09, Craig's screenshot): pages under another
-- indented less (their words start just right of the pages' own) and
-- spaced a little further apart.
UPDATE "MenuStyle"
SET "layout" = jsonb_set(jsonb_set("layout", '{sub,indent}', '10'::jsonb), '{sub,gap}', '4'::jsonb),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN ('menu_style_isyt', 'menu_style_isyt_dark')
  AND ("layout"->'sub') IS NOT NULL;

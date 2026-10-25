-- A Side list's pages are now spaced only by its own spacing (2026-10-25,
-- for the ISYT menus' tight lines). Bling — Side menu keeps its look:
-- its 40px becomes 51px, making up the padding its pages had.
UPDATE "MenuStyle"
SET "layout" = jsonb_set("layout", '{list,gap}', '51'::jsonb), "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'menu_style_louise_side' AND "layout"->'list'->>'gap' = '40';

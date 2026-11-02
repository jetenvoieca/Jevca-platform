-- The ISYT menus beside the page, as on the old ISYT sites (2026-11-02,
-- Craig's screenshots): the page and the menu kept together, 960px wide
-- in all (790 + 170), centred in the window with grey (#808080) either
-- side. And ISYT — Portfolio's page heading without the line under it,
-- as the old pages.
UPDATE "MenuStyle"
SET "layout" = jsonb_set("layout", '{list,frame}', '{"width": 960, "outside": "#808080"}'::jsonb),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN ('menu_style_isyt', 'menu_style_isyt_dark')
  AND ("layout"->'list'->'frame') IS NULL;

UPDATE "PageStyle"
SET "layout" = jsonb_set("layout", '{blocks,0,pageHeading,line}', 'null'::jsonb),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'page_style_isyt_portfolio'
  AND "layout"->'blocks'->0->>'id' = 'isyt_portfolio_heading';

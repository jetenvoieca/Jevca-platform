-- ISYT — Exhibitions (2026-11-03, Craig's request): on a desktop the Page
-- heading stays at the top and the chosen exhibition stays in view while
-- the list scrolls.
UPDATE "PageStyle"
SET "layout" = jsonb_set(
      jsonb_set("layout", '{blocks,0,pageHeading,sticky}', 'true'::jsonb),
      '{blocks,1,exhibitions,stickyDetail}', 'true'::jsonb
    ),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'page_style_isyt_exhibitions'
  AND "layout"->'blocks'->0->>'type' = 'pageheading'
  AND "layout"->'blocks'->1->>'type' = 'exhibitions';

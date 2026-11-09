-- ISYT — Portfolio (2026-11-09, Craig's request): on a desktop the chosen
-- work stays in view while the thumbnails scroll (as ISYT — Exhibitions).
UPDATE "PageStyle"
SET "layout" = jsonb_set("layout", '{blocks,1,viewer,stickyDetail}', 'true'::jsonb),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'page_style_isyt_portfolio'
  AND "layout"->'blocks'->1->>'type' = 'viewer';

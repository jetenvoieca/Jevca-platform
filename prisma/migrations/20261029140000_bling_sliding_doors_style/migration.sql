-- Bling — Sliding doors (2026-10-29, Craig's request): a copy of the
-- "Sliding doors" page style in the Bling look. Kept from Sliding doors:
-- its components and their settings (the doors' timing, gap and height),
-- rows, spacing, width and margins. Taken from Bling — Portfolio (La
-- Galerie's style): the background and the text looks (fonts, sizes,
-- colours) — any component's own text look is dropped so Bling's apply —
-- and Bling's fine line on any Line component. Nothing happens if there's
-- no style called Sliding doors, or Bling — Sliding doors already exists.
INSERT INTO "PageStyle" ("id", "name", "type", "layout", "presentationTemplateId", "updatedAt")
SELECT
  'page_style_bling_sliding_doors',
  'Bling — Sliding doors',
  s."type",
  jsonb_set(
    s."layout"
      || jsonb_build_object(
        'backgroundColor', b."layout"->'backgroundColor',
        'backgroundImage', b."layout"->'backgroundImage',
        'textStyles', b."layout"->'textStyles'
      ),
    '{blocks}',
    COALESCE((
      SELECT jsonb_agg(
        CASE
          WHEN blk->>'type' = 'line'
            THEN (blk - 'textStyle') || jsonb_build_object('line', '{"colour": "#dfdcd7", "thickness": 0.5}'::jsonb)
          ELSE blk - 'textStyle'
        END
        ORDER BY i
      )
      FROM jsonb_array_elements(s."layout"->'blocks') WITH ORDINALITY AS t(blk, i)
    ), '[]'::jsonb)
  ),
  COALESCE(s."presentationTemplateId", b."presentationTemplateId"),
  CURRENT_TIMESTAMP
FROM "PageStyle" s
CROSS JOIN "PageStyle" b
WHERE lower(trim(s."name")) = 'sliding doors'
  AND b."id" = 'page_style_louise_portfolio'
LIMIT 1
ON CONFLICT ("name") DO NOTHING;

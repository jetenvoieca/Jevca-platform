-- Louise Dear — Home (2026-10-22, Craig's choice): the headline and the
-- "SIGNATURE WORKS" title at her site's sizes for an 1100px window (55
-- and 33px), so they don't get too big on a wide screen; the Gallery's
-- pictures square-cornered, as on her site.
UPDATE "PageStyle"
SET "layout" = jsonb_set(
  jsonb_set("layout", '{textStyles,header,size}', '33'::jsonb),
  '{blocks}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN b.value->>'id' = 'louise_home_hero' THEN
          jsonb_set(jsonb_set(b.value, '{hero,headline,size}', '55'::jsonb), '{hero,accent,size}', '55'::jsonb)
        WHEN b.value->>'id' = 'louise_home_gallery' THEN
          jsonb_set(b.value, '{tiles,rounding}', '0'::jsonb)
        ELSE b.value
      END
      ORDER BY b.ordinality
    )
    FROM jsonb_array_elements("layout"->'blocks') WITH ORDINALITY AS b(value, ordinality)
  )
),
"updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'page_style_louise_home' AND jsonb_typeof("layout"->'blocks') = 'array';

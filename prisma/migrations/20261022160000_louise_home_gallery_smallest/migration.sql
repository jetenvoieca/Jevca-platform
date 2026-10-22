-- Louise Dear — Home's Gallery keeps 4 across down to small windows, as
-- her site does (2026-10-22): its smallest image 140 pixels.
UPDATE "PageStyle"
SET "layout" = jsonb_set(
  "layout",
  '{blocks}',
  (
    SELECT jsonb_agg(
      CASE WHEN b.value->>'id' = 'louise_home_gallery'
        THEN jsonb_set(b.value, '{perRow}', COALESCE(b.value->'perRow', '{}'::jsonb) || '{"smallest": 140}'::jsonb)
        ELSE b.value
      END
      ORDER BY b.ordinality
    )
    FROM jsonb_array_elements("layout"->'blocks') WITH ORDINALITY AS b(value, ordinality)
  )
)
WHERE "id" = 'page_style_louise_home' AND jsonb_typeof("layout"->'blocks') = 'array';

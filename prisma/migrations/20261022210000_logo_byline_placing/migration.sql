-- The words under a Logo scale with it (2026-10-22, Craig's choice, as
-- louisedear.com): size 46% of the logo's height, tucked up 30% of its
-- height and 57% across its width — replacing their own size and
-- Left / Centred / Right. Their font, style and colour are kept.
UPDATE "PageStyle"
SET "layout" = jsonb_set(
  "layout",
  '{blocks}',
  (
    SELECT jsonb_agg(
      CASE WHEN b.value->>'type' = 'logo' AND b.value ? 'byline'
        THEN jsonb_set(
          b.value,
          '{byline}',
          jsonb_build_object(
            'style', COALESCE(b.value->'byline'->'style', '{}'::jsonb) || '{"size": null, "smallest": null}'::jsonb,
            'size', 46,
            'up', 30,
            'across', 57
          )
        )
        ELSE b.value
      END
      ORDER BY b.ordinality
    )
    FROM jsonb_array_elements("layout"->'blocks') WITH ORDINALITY AS b(value, ordinality)
  )
)
WHERE "type" = 'BLOCK_BUILD'
  AND jsonb_typeof("layout"->'blocks') = 'array'
  AND jsonb_path_exists("layout", '$.blocks[*] ? (@.type == "logo")');

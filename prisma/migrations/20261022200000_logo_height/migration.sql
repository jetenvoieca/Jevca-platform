-- A Logo component is sized by its height on a desktop and on a phone
-- (2026-10-22, Craig's choice, as louisedear.com: 74 and 48 pixels),
-- replacing its width on a phone (% of the screen).
UPDATE "PageStyle"
SET "layout" = jsonb_set(
  "layout",
  '{blocks}',
  (
    SELECT jsonb_agg(
      CASE WHEN b.value->>'type' = 'logo'
        THEN (b.value - 'phoneWidth') || '{"logoHeight": {"desktop": 74, "phone": 48}}'::jsonb
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

-- ISYT — Profile (2026-11-03, Craig's request): the stories' pictures shown
-- whole, at their own shape, on a desktop and a phone — a portrait profile
-- photo was being cut to a landscape box on phones.
UPDATE "PageStyle"
SET "layout" = jsonb_set(
      "layout",
      '{blocks}',
      (
        SELECT jsonb_agg(
          CASE
            WHEN b->>'type' = 'stories'
              THEN jsonb_set(b, '{stories,shape}', '{"desktop": "whole", "phone": "whole"}'::jsonb)
            ELSE b
          END
          ORDER BY i
        )
        FROM jsonb_array_elements("layout"->'blocks') WITH ORDINALITY AS t(b, i)
      )
    ),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'page_style_isyt_profile';

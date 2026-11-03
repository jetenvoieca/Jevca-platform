-- ISYT — Portfolio, Showcase and Profile (2026-11-03, Craig's request):
-- on a desktop the Page heading stays at the top while the page scrolls,
-- as on ISYT — Exhibitions.
UPDATE "PageStyle"
SET "layout" = jsonb_set(
      "layout",
      '{blocks}',
      (
        SELECT jsonb_agg(
          CASE
            WHEN b->>'type' = 'pageheading' THEN jsonb_set(b, '{pageHeading,sticky}', 'true'::jsonb)
            ELSE b
          END
          ORDER BY i
        )
        FROM jsonb_array_elements("layout"->'blocks') WITH ORDINALITY AS t(b, i)
      )
    ),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN ('page_style_isyt_portfolio', 'page_style_isyt_showcase', 'page_style_isyt_profile')
  AND jsonb_array_length("layout"->'blocks') > 0;

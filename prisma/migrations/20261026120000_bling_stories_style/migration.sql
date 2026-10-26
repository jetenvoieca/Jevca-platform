-- Bling — Stories (2026-10-26, Craig's request: headings to match La
-- Galerie): Bling — Portfolio as it is now — its Header, Byline and line,
-- background, width, margins and text looks — with Profile stories in
-- place of its Gallery (same component id, so its row spacing carries
-- over). The stories in the Bling look: caption in Cormorant Garamond,
-- story in Jost. A blank Header or Byline shows nothing.
INSERT INTO "PageStyle" ("id", "name", "type", "layout", "presentationTemplateId", "updatedAt")
SELECT
  'page_style_bling_stories',
  'Bling — Stories',
  'BLOCK_BUILD',
  jsonb_set(
    p."layout",
    '{blocks}',
    (
      SELECT jsonb_agg(
        CASE WHEN b->>'type' = 'gallery' THEN jsonb_build_object(
          'id', b->>'id',
          'type', 'stories',
          'stories', '{
            "side": "left",
            "pictureShare": 50,
            "gap": {"desktop": 64, "phone": 24},
            "shape": {"desktop": "landscape", "phone": "landscape"},
            "pictureFirstOnPhone": true,
            "wordsAt": "middle",
            "headlineSpace": 20,
            "headline": {"font": "cormorant-garamond", "size": 30, "smallest": null, "look": "light", "colour": "#1a1714", "spacing": null, "align": null},
            "body": {"font": "jost", "size": 15, "smallest": null, "look": "light", "colour": "#7a7066", "spacing": null, "align": null},
            "storySpace": 80
          }'::jsonb
        ) ELSE b END
        ORDER BY i
      )
      FROM jsonb_array_elements(p."layout"->'blocks') WITH ORDINALITY AS t(b, i)
    )
  ),
  p."presentationTemplateId",
  CURRENT_TIMESTAMP
FROM "PageStyle" p
WHERE p."id" = 'page_style_louise_portfolio'
ON CONFLICT ("name") DO NOTHING;

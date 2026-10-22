-- Louise Dear — Home matches louisedear.com's home page (2026-10-22,
-- Craig's request): page no wider than 1100px on her cream; the Hero's
-- two equal halves, each work whole in a square box (4:3 on a phone,
-- shown first), the words in light Cormorant Garamond shrinking with the
-- page; "SIGNATURE WORKS" spaced; the Gallery 2px apart with 36px
-- between rows (20px on a phone), names on one line, hover zoom and
-- veil with the price, and the work showing in the Hero outlined in
-- pink. The whole layout is set, keeping its components' ids.
UPDATE "PageStyle"
SET "layout" = '{
  "backgroundColor": "#faf7f2",
  "backgroundImage": false,
  "maxWidth": 1100,
  "gridSpacing": {"vertical": 36, "horizontal": 2, "phoneVertical": 20},
  "margins": {"desktop": {"vertical": 80, "horizontal": 48}, "phone": {"vertical": 32, "horizontal": 24}},
  "textStyles": {
    "header": {"font": "cormorant-garamond", "size": 40, "smallest": 24, "look": "regular", "colour": "#1a1714", "spacing": 6},
    "byline": {"font": "jost", "size": 15, "smallest": null, "look": "light", "colour": "#7a7066", "spacing": null},
    "text": {"font": "jost", "size": 15, "smallest": null, "look": "light", "colour": "#1a1714", "spacing": null},
    "textgrid": {"font": null, "size": null, "smallest": null, "look": null, "colour": null, "spacing": null}
  },
  "rows": {
    "louise_home_hero": {"below": 80, "between": 16, "horizontal": "left", "vertical": "top"},
    "louise_home_heading": {"below": 24, "between": 16, "horizontal": "left", "vertical": "top"},
    "louise_home_gallery": {"below": 16, "between": 16, "horizontal": "left", "vertical": "top"}
  },
  "blocks": [
    {"id": "louise_home_hero", "type": "hero", "hero": {
      "seconds": 5, "fade": 0.9, "pictureShare": 50,
      "gap": {"desktop": 64, "phone": 32},
      "shape": {"desktop": "square", "phone": "landscape"},
      "pictureFirstOnPhone": true,
      "kicker": {"font": "jost", "size": 12, "smallest": null, "look": "light", "colour": "#c4965a", "spacing": 16},
      "headline": {"font": "cormorant-garamond", "size": 68, "smallest": 42, "look": "light", "colour": "#1a1714", "spacing": null},
      "accent": {"font": "cormorant-garamond", "size": 68, "smallest": 42, "look": "lightitalic", "colour": "#e8698a", "spacing": null},
      "below": {"font": "jost", "size": 15, "smallest": null, "look": "light", "colour": "#7a7066", "spacing": null}
    }},
    {"id": "louise_home_heading", "type": "header"},
    {"id": "louise_home_gallery", "type": "gallery",
      "perRow": {"desktop": 4, "phone": 2, "smallest": 140},
      "names": {"font": "cormorant-garamond", "size": 15, "smallest": null, "look": "lightitalic", "colour": "#1a1714", "spacing": null},
      "tiles": {"oneLineNames": true, "zoom": true, "veil": true, "heroOutline": "#e8698a"}
    }
  ]
}'::jsonb,
"updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'page_style_louise_home';

-- On her site "LONDON & SOUTH OF FRANCE" sits under the headline: a
-- Hero's small line typed on her home page moves to the new line under
-- it (only where that's still empty).
UPDATE "PageComponentContent"
SET "text" = (("text"::jsonb) || jsonb_build_object('below', "text"::jsonb->>'kicker', 'kicker', ''))::text
WHERE "blockId" = 'louise_home_hero'
  AND "text" IS NOT NULL
  AND "text" LIKE '{%'
  AND COALESCE("text"::jsonb->>'kicker', '') <> ''
  AND COALESCE("text"::jsonb->>'below', '') = '';

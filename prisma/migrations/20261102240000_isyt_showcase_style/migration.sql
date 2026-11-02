-- ISYT — Showcase (2026-11-02, Craig's screenshot of
-- jillysuttonsculpture.com's showcase page): the ISYT look (white,
-- 790px, Gelasio), the Page heading without a line under it, then the
-- Showcase — every work the site shows, shuffled, two at a time with a
-- grey line between, sliding apart to the next pair; five red dots above
-- and the titles in red. Works open with the ISYT presentation template.
INSERT INTO "PageStyle" ("id", "name", "type", "layout", "presentationTemplateId", "updatedAt")
VALUES (
  'page_style_isyt_showcase',
  'ISYT — Showcase',
  'BLOCK_BUILD',
  '{
    "backgroundColor": "#ffffff",
    "backgroundImage": false,
    "maxWidth": 790,
    "gridSpacing": {"vertical": 10, "horizontal": 10, "phoneVertical": 10},
    "margins": {"desktop": {"vertical": 50, "horizontal": 20}, "phone": {"vertical": 24, "horizontal": 20}},
    "textStyles": {
      "header": {"font": "gelasio", "size": 21, "smallest": null, "look": "regular", "colour": "#808080", "spacing": null, "align": null},
      "byline": {"font": "gelasio", "size": 14, "smallest": null, "look": "regular", "colour": "#888888", "spacing": null, "align": null},
      "text": {"font": "gelasio", "size": 13, "smallest": null, "look": "regular", "colour": "#333333", "spacing": null, "align": null},
      "textgrid": {"font": null, "size": null, "smallest": null, "look": null, "colour": null, "spacing": null, "align": null}
    },
    "rows": {
      "isyt_showcase_heading": {"below": 40, "between": 16, "horizontal": "left", "vertical": "top"},
      "isyt_showcase_pairs": {"below": 16, "between": 16, "horizontal": "left", "vertical": "top"}
    },
    "blocks": [
      {"id": "isyt_showcase_heading", "type": "pageheading", "pageHeading": {
        "showPage": true,
        "name": {"font": "gelasio", "size": 23, "smallest": null, "look": "bold", "colour": "#808080", "spacing": null, "align": null},
        "page": {"font": "gelasio", "size": 29, "smallest": null, "look": "regular", "colour": "#b8b8b8", "spacing": null, "align": null},
        "gap": 0,
        "line": null,
        "lineSpace": 30
      }},
      {"id": "isyt_showcase_pairs", "type": "showcase", "showcase": {
        "duration": 5, "speed": 1.5,
        "height": {"desktop": 384, "phone": 300},
        "gap": 24,
        "line": {"colour": "#cccccc", "thickness": 2},
        "accent": "#8b1a1a", "titleSize": 15
      }}
    ]
  }'::jsonb,
  (SELECT "id" FROM "PresentationTemplate" WHERE "name" = 'ISYT'),
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;

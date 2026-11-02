-- ISYT — Exhibitions (2026-11-02, Craig's screenshot of
-- jillysuttonsculpture.com's exhibitions page): the ISYT look (white,
-- 790px, Gelasio), the Page heading with a line under it, then the
-- Exhibitions list — newest first, each its picture, name, venue and
-- year in red — beside the chosen one: its picture, its name and venue
-- in red, dates, opening times and description.
INSERT INTO "PageStyle" ("id", "name", "type", "layout", "presentationTemplateId", "updatedAt")
VALUES (
  'page_style_isyt_exhibitions',
  'ISYT — Exhibitions',
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
      "isyt_exhibitions_heading": {"below": 16, "between": 16, "horizontal": "left", "vertical": "top"},
      "isyt_exhibitions_list": {"below": 16, "between": 16, "horizontal": "left", "vertical": "top"}
    },
    "blocks": [
      {"id": "isyt_exhibitions_heading", "type": "pageheading", "pageHeading": {
        "showPage": true,
        "name": {"font": "gelasio", "size": 23, "smallest": null, "look": "bold", "colour": "#808080", "spacing": null, "align": null},
        "page": {"font": "gelasio", "size": 29, "smallest": null, "look": "regular", "colour": "#b8b8b8", "spacing": null, "align": null},
        "gap": 0,
        "line": {"colour": "#cccccc", "thickness": 1},
        "lineSpace": 30
      }},
      {"id": "isyt_exhibitions_list", "type": "exhibitions", "exhibitions": {
        "newestFirst": true, "listShare": 50, "thumbSize": 78, "gap": 15,
        "line": {"colour": "#cccccc", "thickness": 1},
        "highlight": "#aaaaaa", "accent": "#8b1a1a", "titleSize": 19
      }}
    ]
  }'::jsonb,
  NULL,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;

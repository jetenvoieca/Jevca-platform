-- ISYT — Portfolio (2026-11-02, Craig's request: an ISYT version of
-- Bling — Portfolio). The ISYT sites' look: white, 790px wide, Gelasio;
-- the Page heading (site name 23px bold #808080 over the page name 29px
-- #b8b8b8, a line under) in place of Bling's title, byline and line;
-- then the Gallery as small thumbnails 10px apart — up to 8 across, 4 on
-- a phone — square, no names, no hover effects (as the old sites).
-- Clicking a work opens its presentation, as Bling.
INSERT INTO "PageStyle" ("id", "name", "type", "layout", "presentationTemplateId", "updatedAt")
VALUES (
  'page_style_isyt_portfolio',
  'ISYT — Portfolio',
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
      "isyt_portfolio_heading": {"below": 30, "between": 16, "horizontal": "left", "vertical": "top"},
      "isyt_portfolio_gallery": {"below": 16, "between": 16, "horizontal": "left", "vertical": "top"}
    },
    "blocks": [
      {"id": "isyt_portfolio_heading", "type": "pageheading", "pageHeading": {
        "showPage": true,
        "name": {"font": "gelasio", "size": 23, "smallest": null, "look": "bold", "colour": "#808080", "spacing": null, "align": null},
        "page": {"font": "gelasio", "size": 29, "smallest": null, "look": "regular", "colour": "#b8b8b8", "spacing": null, "align": null},
        "gap": 0,
        "line": {"colour": "#cccccc", "thickness": 1},
        "lineSpace": 12
      }},
      {"id": "isyt_portfolio_gallery", "type": "gallery",
        "perRow": {"desktop": 8, "phone": 4, "smallest": 80},
        "names": null,
        "tiles": {"oneLineNames": false, "zoom": false, "veil": false, "heroOutline": null, "rounding": 0}
      }
    ]
  }'::jsonb,
  (SELECT "id" FROM "PresentationTemplate" WHERE "id" = 'presentation_template_classic'),
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;

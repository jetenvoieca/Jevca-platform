-- ISYT — Profile (2026-11-03, Craig's request): Profile — Stories in the
-- ISYT look — white, 790px, Gelasio, the Page heading with no line under
-- it — then the Profile stories chosen on the page (the Artist Statement
-- and Biography / CV can be among them), stacked, each its picture on the
-- left beside its caption (in the ISYT red) and text, lined up at the
-- top. Needs no curation.
INSERT INTO "PageStyle" ("id", "name", "type", "layout", "presentationTemplateId", "updatedAt")
VALUES (
  'page_style_isyt_profile',
  'ISYT — Profile',
  'BLOCK_BUILD',
  '{
    "backgroundColor": "#ffffff",
    "phoneBackgroundColor": null,
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
      "isyt_profile_heading": {"below": 40, "between": 16, "horizontal": "left", "vertical": "top"},
      "isyt_profile_stories": {"below": 16, "between": 16, "horizontal": "left", "vertical": "top"}
    },
    "blocks": [
      {"id": "isyt_profile_heading", "type": "pageheading", "pageHeading": {
        "showPage": true,
        "name": {"font": "gelasio", "size": 23, "smallest": null, "look": "bold", "colour": "#808080", "spacing": null, "align": null},
        "page": {"font": "gelasio", "size": 29, "smallest": null, "look": "regular", "colour": "#b8b8b8", "spacing": null, "align": null},
        "gap": 0,
        "line": null,
        "lineSpace": 30
      }},
      {"id": "isyt_profile_stories", "type": "stories", "stories": {
        "side": "left",
        "pictureShare": 42,
        "gap": {"desktop": 40, "phone": 20},
        "shape": {"desktop": "portrait", "phone": "landscape"},
        "pictureFirstOnPhone": true,
        "wordsAt": "top",
        "headlineSpace": 12,
        "headline": {"font": "gelasio", "size": 19, "smallest": null, "look": "regular", "colour": "#8b1a1a", "spacing": null, "align": null},
        "body": {"font": "gelasio", "size": 13, "smallest": null, "look": "regular", "colour": "#333333", "spacing": null, "align": null},
        "storySpace": 50
      }}
    ]
  }'::jsonb,
  (SELECT "id" FROM "PresentationTemplate" WHERE "name" = 'ISYT'),
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;

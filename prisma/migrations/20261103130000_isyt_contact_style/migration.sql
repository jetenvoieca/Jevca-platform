-- ISYT — Contact (2026-11-03, Craig's screenshot of jillysuttonsculpture.com's
-- contact page): ISYT — Profile — the Page heading, then the Profile
-- stories chosen on the page — with a Contact panel lying over the right
-- half below the heading: "Contact / Mailing List" in bold, the phone and
-- email from the artist's Settings, and the form. It slides in as the
-- page opens and its ✕ slides it away to show the profile. Needs no
-- curation.
INSERT INTO "PageStyle" ("id", "name", "type", "layout", "presentationTemplateId", "updatedAt")
VALUES (
  'page_style_isyt_contact',
  'ISYT — Contact',
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
      "isyt_contact_heading": {"below": 40, "between": 16, "horizontal": "left", "vertical": "top"},
      "isyt_contact_panel": {"below": 0, "between": 16, "horizontal": "left", "vertical": "top"},
      "isyt_contact_stories": {"below": 16, "between": 16, "horizontal": "left", "vertical": "top"}
    },
    "blocks": [
      {"id": "isyt_contact_heading", "type": "pageheading", "pageHeading": {
        "showPage": true,
        "name": {"font": "gelasio", "size": 23, "smallest": null, "look": "bold", "colour": "#808080", "spacing": null, "align": null},
        "page": {"font": "gelasio", "size": 29, "smallest": null, "look": "regular", "colour": "#b8b8b8", "spacing": null, "align": null},
        "gap": 0,
        "line": {"colour": "#cccccc", "thickness": 1},
        "lineSpace": 30
      }},
      {"id": "isyt_contact_panel", "type": "contact", "contact": {
        "title": "Contact / Mailing List", "share": 50, "titleSize": 19
      }},
      {"id": "isyt_contact_stories", "type": "stories", "stories": {
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

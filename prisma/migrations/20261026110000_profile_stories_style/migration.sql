-- Profile — Stories (2026-10-26, Craig's request): a simple page of
-- profile stories — the Page heading (site name over page name, line
-- under), then the Profile stories chosen on the page, stacked, each its
-- picture beside its caption and story (swappable per story in Arrange).
-- White, Gelasio, 1100px wide. Chosen for a page in Pages; needs no
-- curation.
INSERT INTO "PageStyle" ("id", "name", "type", "layout", "presentationTemplateId", "updatedAt")
VALUES (
  'page_style_profile_stories',
  'Profile — Stories',
  'BLOCK_BUILD',
  '{
  "backgroundColor": "#ffffff",
  "phoneBackgroundColor": null,
  "backgroundImage": false,
  "maxWidth": 1100,
  "gridSpacing": { "vertical": 10, "horizontal": 10, "phoneVertical": 10 },
  "margins": {
    "desktop": { "vertical": 50, "horizontal": 60 },
    "phone": { "vertical": 24, "horizontal": 20 }
  },
  "textStyles": {
    "header": { "font": null, "size": null, "smallest": null, "look": null, "colour": null, "spacing": null, "align": null },
    "byline": { "font": null, "size": null, "smallest": null, "look": null, "colour": null, "spacing": null, "align": null },
    "text": { "font": null, "size": null, "smallest": null, "look": null, "colour": null, "spacing": null, "align": null },
    "textgrid": { "font": null, "size": null, "smallest": null, "look": null, "colour": null, "spacing": null, "align": null }
  },
  "rows": {
    "profile_stories_heading": { "below": 56, "between": 16, "horizontal": "left", "vertical": "top" },
    "profile_stories_list": { "below": 16, "between": 16, "horizontal": "left", "vertical": "top" }
  },
  "blocks": [
    {
      "id": "profile_stories_heading",
      "type": "pageheading",
      "pageHeading": {
        "showPage": true,
        "name": { "font": "gelasio", "size": 23, "smallest": null, "look": "bold", "colour": "#808080", "spacing": null, "align": null },
        "page": { "font": "gelasio", "size": 29, "smallest": null, "look": "regular", "colour": "#b8b8b8", "spacing": null, "align": null },
        "gap": 0,
        "line": { "colour": "#cccccc", "thickness": 1 },
        "lineSpace": 16
      }
    },
    {
      "id": "profile_stories_list",
      "type": "stories",
      "stories": {
        "side": "left",
        "pictureShare": 50,
        "gap": { "desktop": 64, "phone": 24 },
        "shape": { "desktop": "landscape", "phone": "landscape" },
        "pictureFirstOnPhone": true,
        "wordsAt": "middle",
        "headlineSpace": 20,
        "headline": { "font": "gelasio", "size": 28, "smallest": null, "look": "regular", "colour": "#333333", "spacing": null, "align": null },
        "body": { "font": "gelasio", "size": 15, "smallest": null, "look": "regular", "colour": "#555555", "spacing": null, "align": null },
        "storySpace": 80
      }
    }
  ]
}'::jsonb,
  (SELECT "id" FROM "PresentationTemplate" WHERE "id" = 'presentation_template_classic'),
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;

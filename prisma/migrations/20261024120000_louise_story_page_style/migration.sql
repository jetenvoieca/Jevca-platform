-- Louise Dear's Story page (2026-10-24, as louisedear.com/about): her
-- portrait beside "The artist. / The journey." and her bio (Picture &
-- words — the curation's first Supporting Image and its Description),
-- the quote between two lines with its attribution in gold, then
-- Materials and Commissions side by side, each a gold label over a typed
-- text. 900px wide. Chosen for a page in Pages; the words are typed in
-- Arrange (labels in capitals, as her site).
INSERT INTO "PageStyle" ("id", "name", "type", "layout", "presentationTemplateId", "updatedAt")
VALUES (
  'page_style_louise_story',
  'Louise Dear — Story',
  'BLOCK_BUILD',
  '{
    "backgroundColor": "#faf7f2",
    "backgroundImage": false,
    "maxWidth": 900,
    "gridSpacing": {"vertical": 36, "horizontal": 4, "phoneVertical": 20},
    "margins": {"desktop": {"vertical": 64, "horizontal": 48}, "phone": {"vertical": 32, "horizontal": 24}},
    "textStyles": {
      "header": {"font": "cormorant-garamond", "size": 28, "smallest": 22, "look": "lightitalic", "colour": "#1a1714", "spacing": null, "align": "center"},
      "byline": {"font": "jost", "size": 11, "smallest": null, "look": "regular", "colour": "#c4965a", "spacing": 16, "align": null},
      "text": {"font": "jost", "size": 14, "smallest": null, "look": "light", "colour": "#7a7066", "spacing": null, "align": null},
      "textgrid": {"font": null, "size": null, "smallest": null, "look": null, "colour": null, "spacing": null, "align": null}
    },
    "rows": {
      "louise_story_picture": {"below": 80, "between": 16, "horizontal": "left", "vertical": "top"},
      "louise_story_line_top": {"below": 48, "between": 16, "horizontal": "left", "vertical": "top"},
      "louise_story_quote": {"below": 16, "between": 16, "horizontal": "center", "vertical": "top"},
      "louise_story_attribution": {"below": 48, "between": 16, "horizontal": "center", "vertical": "top"},
      "louise_story_line_bottom": {"below": 64, "between": 16, "horizontal": "left", "vertical": "top"},
      "louise_story_labels": {"below": 16, "between": 48, "horizontal": "left", "vertical": "top"},
      "louise_story_texts": {"below": 48, "between": 48, "horizontal": "left", "vertical": "top"}
    },
    "blocks": [
      {"id": "louise_story_picture", "type": "picturewords", "pictureWords": {
        "side": "left", "pictureShare": 50,
        "gap": {"desktop": 80, "phone": 32},
        "shape": {"desktop": "portrait", "phone": "portrait"},
        "pictureFirstOnPhone": true, "wordsAt": "top", "headlineSpace": 32,
        "headline": {"font": "cormorant-garamond", "size": 42, "smallest": null, "look": "light", "colour": "#1a1714", "spacing": null, "align": null},
        "accent": {"font": "cormorant-garamond", "size": 42, "smallest": null, "look": "lightitalic", "colour": "#e8698a", "spacing": null, "align": null},
        "body": {"font": "jost", "size": 15, "smallest": null, "look": "light", "colour": "#7a7066", "spacing": null, "align": null}
      }},
      {"id": "louise_story_line_top", "type": "line", "line": {"colour": "#dfdcd7", "thickness": 0.5}},
      {"id": "louise_story_quote", "type": "header", "width": 70},
      {"id": "louise_story_attribution", "type": "byline", "textStyle": {"font": null, "size": 12, "smallest": null, "look": null, "colour": null, "spacing": 12, "align": "center"}},
      {"id": "louise_story_line_bottom", "type": "line", "line": {"colour": "#dfdcd7", "thickness": 0.5}},
      {"id": "louise_story_label_materials", "type": "byline", "row": "louise_story_labels", "width": 50},
      {"id": "louise_story_label_commissions", "type": "byline", "row": "louise_story_labels", "width": 50},
      {"id": "louise_story_materials", "type": "text", "row": "louise_story_texts", "width": 50},
      {"id": "louise_story_commissions", "type": "text", "row": "louise_story_texts", "width": 50}
    ]
  }'::jsonb,
  (SELECT "id" FROM "PresentationTemplate" WHERE "id" = 'presentation_template_classic'),
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;

-- The "Bling" template series (2026-10-24, Craig's name for the styles
-- built from louisedear.com): Louise Dear's styles renamed, and the last
-- of the series added — Bling — Events, as her Events & Projects: the
-- title, a line, then the Entries list (each event's date, title and
-- pictures with captions and descriptions, a line between events).
-- Same 900px width as Bling — Story.
UPDATE "PageStyle" SET "name" = 'Bling — Home', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'page_style_louise_home' AND NOT EXISTS (SELECT 1 FROM "PageStyle" WHERE "name" = 'Bling — Home');
UPDATE "PageStyle" SET "name" = 'Bling — Portfolio', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'page_style_louise_portfolio' AND NOT EXISTS (SELECT 1 FROM "PageStyle" WHERE "name" = 'Bling — Portfolio');
UPDATE "PageStyle" SET "name" = 'Bling — Story', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'page_style_louise_story' AND NOT EXISTS (SELECT 1 FROM "PageStyle" WHERE "name" = 'Bling — Story');
UPDATE "MenuStyle" SET "name" = 'Bling — Side menu', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'menu_style_louise_side' AND NOT EXISTS (SELECT 1 FROM "MenuStyle" WHERE "name" = 'Bling — Side menu');

INSERT INTO "PageStyle" ("id", "name", "type", "layout", "presentationTemplateId", "updatedAt")
VALUES (
  'page_style_bling_events',
  'Bling — Events',
  'BLOCK_BUILD',
  '{
    "backgroundColor": "#faf7f2",
    "backgroundImage": false,
    "maxWidth": 900,
    "gridSpacing": {"vertical": 36, "horizontal": 4, "phoneVertical": 20},
    "margins": {"desktop": {"vertical": 64, "horizontal": 48}, "phone": {"vertical": 32, "horizontal": 24}},
    "textStyles": {
      "header": {"font": "cormorant-garamond", "size": 42, "smallest": null, "look": "light", "colour": "#1a1714", "spacing": null, "align": null},
      "byline": {"font": "jost", "size": 14, "smallest": null, "look": "light", "colour": "#7a7066", "spacing": null, "align": null},
      "text": {"font": "jost", "size": 15, "smallest": null, "look": "light", "colour": "#1a1714", "spacing": null, "align": null},
      "textgrid": {"font": null, "size": null, "smallest": null, "look": null, "colour": null, "spacing": null, "align": null}
    },
    "rows": {
      "bling_events_heading": {"below": 32, "between": 16, "horizontal": "left", "vertical": "top"},
      "bling_events_line": {"below": 48, "between": 16, "horizontal": "left", "vertical": "top"},
      "bling_events_entries": {"below": 16, "between": 16, "horizontal": "left", "vertical": "top"}
    },
    "blocks": [
      {"id": "bling_events_heading", "type": "header"},
      {"id": "bling_events_line", "type": "line", "line": {"colour": "#dfdcd7", "thickness": 0.5}},
      {"id": "bling_events_entries", "type": "entries", "entries": {
        "pictureWidth": 200, "shape": "square", "gap": 32, "pictureSpace": 32, "titleSpace": 24, "entrySpace": 48,
        "line": {"colour": "#dfdcd7", "thickness": 0.5},
        "date": {"font": "jost", "size": 11, "smallest": null, "look": "regular", "colour": "#c4965a", "spacing": 14, "align": null},
        "title": {"font": "cormorant-garamond", "size": 22, "smallest": null, "look": "regular", "colour": "#1a1714", "spacing": null, "align": null},
        "caption": {"font": "jost", "size": 11, "smallest": null, "look": "italic", "colour": "#7a7066", "spacing": null, "align": "center"},
        "text": {"font": "jost", "size": 14, "smallest": null, "look": "light", "colour": "#7a7066", "spacing": null, "align": null}
      }}
    ]
  }'::jsonb,
  (SELECT "id" FROM "PresentationTemplate" WHERE "id" = 'presentation_template_classic'),
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;

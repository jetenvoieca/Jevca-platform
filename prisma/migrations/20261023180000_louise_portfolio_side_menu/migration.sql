-- Louise Dear's portfolio pages (2026-10-23, Craig's mockup of her La
-- Galerie page): a Menu Style with her top bar (logo and "Painter of
-- PASSION", line under) and the pages listed down the right, a menu
-- button below 1024px, Instagram and Facebook under the list; and a Page
-- Style with the title, byline, a line and the Gallery three across, as
-- louisedear.com's gallery pages. Chosen for a page in Pages.
INSERT INTO "MenuStyle" ("id", "name", "layout", "updatedAt")
VALUES (
  'menu_style_louise_side',
  'Louise Dear — Side menu',
  '{
    "kind": "sidelist",
    "position": "top-right",
    "behaviour": "floating",
    "backgroundColor": "#faf7f2",
    "backgroundOpacity": 100,
    "text": {"font": "cormorant-garamond", "size": 26, "smallest": null, "look": "lightitalic", "colour": "#1a1714", "spacing": null},
    "highlightColor": null,
    "rounding": 0,
    "shadow": "none",
    "blur": 0,
    "topBar": {
      "height": {"desktop": 108, "phone": 72},
      "padding": {"desktop": 48, "phone": 24},
      "logoHeight": {"desktop": 74, "phone": 48},
      "byline": {
        "style": {"font": "cormorant-garamond", "size": null, "smallest": null, "look": "lightitalic", "colour": "#e8698a", "spacing": null},
        "size": 46, "up": 30, "across": 57
      },
      "line": {"colour": "#dfdcd7", "thickness": 0.5}
    },
    "list": {
      "side": "right", "width": 260, "top": 48, "gap": 40, "align": "center", "hamburgerBelow": 1024,
      "social": {
        "text": {"font": "jost", "size": 12, "smallest": null, "look": "regular", "colour": "#7a7066", "spacing": 14},
        "capitals": true
      }
    }
  }'::jsonb,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "PageStyle" ("id", "name", "type", "layout", "presentationTemplateId", "updatedAt")
VALUES (
  'page_style_louise_portfolio',
  'Louise Dear — Portfolio',
  'BLOCK_BUILD',
  '{
    "backgroundColor": "#faf7f2",
    "backgroundImage": false,
    "maxWidth": 1100,
    "gridSpacing": {"vertical": 36, "horizontal": 4, "phoneVertical": 20},
    "margins": {"desktop": {"vertical": 64, "horizontal": 48}, "phone": {"vertical": 32, "horizontal": 24}},
    "textStyles": {
      "header": {"font": "cormorant-garamond", "size": 42, "smallest": null, "look": "light", "colour": "#1a1714", "spacing": null},
      "byline": {"font": "jost", "size": 14, "smallest": null, "look": "light", "colour": "#7a7066", "spacing": null},
      "text": {"font": "jost", "size": 15, "smallest": null, "look": "light", "colour": "#1a1714", "spacing": null},
      "textgrid": {"font": null, "size": null, "smallest": null, "look": null, "colour": null, "spacing": null}
    },
    "rows": {
      "louise_portfolio_heading": {"below": 8, "between": 16, "horizontal": "left", "vertical": "top"},
      "louise_portfolio_byline": {"below": 32, "between": 16, "horizontal": "left", "vertical": "top"},
      "louise_portfolio_line": {"below": 48, "between": 16, "horizontal": "left", "vertical": "top"},
      "louise_portfolio_gallery": {"below": 16, "between": 16, "horizontal": "left", "vertical": "top"}
    },
    "blocks": [
      {"id": "louise_portfolio_heading", "type": "header"},
      {"id": "louise_portfolio_byline", "type": "byline"},
      {"id": "louise_portfolio_line", "type": "line", "line": {"colour": "#dfdcd7", "thickness": 0.5}},
      {"id": "louise_portfolio_gallery", "type": "gallery",
        "perRow": {"desktop": 3, "phone": 2, "smallest": 200},
        "names": {"font": "cormorant-garamond", "size": 15, "smallest": null, "look": "lightitalic", "colour": "#1a1714", "spacing": null},
        "tiles": {"oneLineNames": true, "zoom": true, "veil": true, "heroOutline": null, "rounding": 0}
      }
    ]
  }'::jsonb,
  (SELECT "id" FROM "PresentationTemplate" WHERE "id" = 'presentation_template_classic'),
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;

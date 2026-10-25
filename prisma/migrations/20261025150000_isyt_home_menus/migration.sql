-- The ISYT template series (2026-10-25, from the isendyouthis.com client
-- sites, e.g. jillysuttonsculpture.com — measured in the browser): two
-- menus, the pages listed down the right with a light line beside them
-- (Gelasio 22px, pages under another 16px, indented, shown on that
-- group's pages) — white for most pages, dark for the home page — and
-- ISYT — Home: the site's name, one picture, a title and a quote, dark
-- (#242021) on a desktop and white on a phone, 790px wide. Chosen for a
-- page in Pages; the home page takes ISYT — Menu (dark) as its own menu.
INSERT INTO "MenuStyle" ("id", "name", "layout", "updatedAt")
VALUES ('menu_style_isyt', 'ISYT — Menu', '{
  "kind": "sidelist",
  "position": "top-right",
  "behaviour": "floating",
  "backgroundColor": "#ffffff",
  "backgroundOpacity": 100,
  "text": {
    "font": "gelasio",
    "size": 22,
    "smallest": null,
    "look": "regular",
    "colour": "#000000",
    "spacing": null,
    "align": null
  },
  "highlightColor": null,
  "rounding": 0,
  "shadow": "none",
  "blur": 0,
  "topBar": null,
  "list": {
    "side": "right",
    "line": {
      "colour": "#cccccc",
      "thickness": 1
    },
    "width": 170,
    "top": 160,
    "gap": 0,
    "align": "left",
    "hamburgerBelow": 800,
    "social": null
  },
  "sub": {
    "show": "open",
    "text": {
      "font": "gelasio",
      "size": 16,
      "smallest": null,
      "look": null,
      "colour": "#000000",
      "spacing": null,
      "align": null
    },
    "indent": 20,
    "gap": 0
  }
}'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "MenuStyle" ("id", "name", "layout", "updatedAt")
VALUES ('menu_style_isyt_dark', 'ISYT — Menu (dark)', '{
  "kind": "sidelist",
  "position": "top-right",
  "behaviour": "floating",
  "backgroundColor": "#242021",
  "backgroundOpacity": 100,
  "text": {
    "font": "gelasio",
    "size": 22,
    "smallest": null,
    "look": "regular",
    "colour": "#ffffff",
    "spacing": null,
    "align": null
  },
  "highlightColor": null,
  "rounding": 0,
  "shadow": "none",
  "blur": 0,
  "topBar": null,
  "list": {
    "side": "right",
    "line": {
      "colour": "#cccccc",
      "thickness": 1
    },
    "width": 170,
    "top": 160,
    "gap": 0,
    "align": "left",
    "hamburgerBelow": 800,
    "social": null
  },
  "sub": {
    "show": "open",
    "text": {
      "font": "gelasio",
      "size": 16,
      "smallest": null,
      "look": null,
      "colour": "#ffffff",
      "spacing": null,
      "align": null
    },
    "indent": 20,
    "gap": 0
  }
}'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "PageStyle" ("id", "name", "type", "layout", "presentationTemplateId", "updatedAt")
VALUES (
  'page_style_isyt_home',
  'ISYT — Home',
  'BLOCK_BUILD',
  '{
  "backgroundColor": "#242021",
  "phoneBackgroundColor": "#ffffff",
  "backgroundImage": false,
  "maxWidth": 790,
  "gridSpacing": {
    "vertical": 10,
    "horizontal": 10,
    "phoneVertical": 10
  },
  "margins": {
    "desktop": {
      "vertical": 75,
      "horizontal": 75
    },
    "phone": {
      "vertical": 24,
      "horizontal": 20
    }
  },
  "textStyles": {
    "header": {
      "font": "gelasio",
      "size": 21,
      "smallest": null,
      "look": "regular",
      "colour": "#888888",
      "spacing": null,
      "align": null
    },
    "byline": {
      "font": null,
      "size": null,
      "smallest": null,
      "look": null,
      "colour": null,
      "spacing": null,
      "align": null
    },
    "text": {
      "font": "gelasio",
      "size": 12,
      "smallest": null,
      "look": "regular",
      "colour": "#888888",
      "spacing": null,
      "align": null
    },
    "textgrid": {
      "font": null,
      "size": null,
      "smallest": null,
      "look": null,
      "colour": null,
      "spacing": null,
      "align": null
    }
  },
  "rows": {
    "isyt_home_heading": {
      "below": 40,
      "between": 16,
      "horizontal": "left",
      "vertical": "top"
    },
    "isyt_home_picture": {
      "below": 44,
      "between": 16,
      "horizontal": "left",
      "vertical": "top"
    },
    "isyt_home_title": {
      "below": 20,
      "between": 16,
      "horizontal": "left",
      "vertical": "top"
    },
    "isyt_home_quote": {
      "below": 16,
      "between": 16,
      "horizontal": "left",
      "vertical": "top"
    }
  },
  "blocks": [
    {
      "id": "isyt_home_heading",
      "type": "pageheading",
      "pageHeading": {
        "showPage": false,
        "name": {
          "font": "gelasio",
          "size": 39,
          "smallest": null,
          "look": "bold",
          "colour": "#999999",
          "spacing": null,
          "align": null
        },
        "page": {
          "font": "gelasio",
          "size": 29,
          "smallest": null,
          "look": "regular",
          "colour": "#b8b8b8",
          "spacing": null,
          "align": null
        },
        "gap": 0,
        "line": null,
        "lineSpace": 0
      }
    },
    {
      "id": "isyt_home_picture",
      "type": "image",
      "width": 63
    },
    {
      "id": "isyt_home_title",
      "type": "header"
    },
    {
      "id": "isyt_home_quote",
      "type": "text"
    }
  ]
}'::jsonb,
  (SELECT "id" FROM "PresentationTemplate" WHERE "id" = 'presentation_template_classic'),
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;

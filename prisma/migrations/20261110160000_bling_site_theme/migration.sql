-- Bling Site Theme (2026-11-10, Craig's request — Louise Dear's LD Main
-- Site): the Bling page styles as a Site Theme, like ISYT. Home (its own
-- menu: Bling — Side menu), la galerie with a page for each curation under
-- it, story, events and the contact panel; Bling — Side menu as the
-- site's menu. Styles or menus missing are left off when applied.
INSERT INTO "SiteTheme" ("id", "name", "siteMenuStyleId", "entries", "updatedAt")
VALUES (
  'site_theme_bling',
  'Bling',
  (SELECT "id" FROM "MenuStyle" WHERE "id" = 'menu_style_louise_side'),
  '[
    {"id": "home", "kind": "PAGE", "title": "home", "pageStyleId": "page_style_louise_home", "menuStyleId": "menu_style_louise_side", "parentEntryId": null},
    {"id": "la_galerie", "kind": "PAGE", "title": "la galerie", "pageStyleId": null, "menuStyleId": null, "parentEntryId": null},
    {"id": "la_galerie_sections", "kind": "CURATIONS", "title": "", "pageStyleId": "page_style_louise_portfolio", "menuStyleId": null, "parentEntryId": "la_galerie"},
    {"id": "story", "kind": "PAGE", "title": "story", "pageStyleId": "page_style_louise_story", "menuStyleId": null, "parentEntryId": null},
    {"id": "events", "kind": "PAGE", "title": "events", "pageStyleId": "page_style_bling_events", "menuStyleId": null, "parentEntryId": null},
    {"id": "contact", "kind": "CONTACT", "title": "contact", "pageStyleId": null, "menuStyleId": null, "parentEntryId": null}
  ]'::jsonb,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;

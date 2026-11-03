-- Site Themes (2026-11-03, Craig's request): the pages a site of a theme
-- has, made in one go from a site's Pages page — see SiteTheme and
-- lib/siteThemes.ts. With the ISYT theme as the old ISYT sites: home (its
-- own dark menu), showcase, portfolio with a page for each curation under
-- it, profile, exhibitions and the contact panel; ISYT — Menu as the
-- site's menu.
CREATE TABLE "SiteTheme" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "siteMenuStyleId" TEXT,
    "entries" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteTheme_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SiteTheme_name_key" ON "SiteTheme"("name");
CREATE INDEX "SiteTheme_siteMenuStyleId_idx" ON "SiteTheme"("siteMenuStyleId");
ALTER TABLE "SiteTheme" ADD CONSTRAINT "SiteTheme_siteMenuStyleId_fkey" FOREIGN KEY ("siteMenuStyleId") REFERENCES "MenuStyle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "SiteTheme" ("id", "name", "siteMenuStyleId", "entries", "updatedAt")
VALUES (
  'site_theme_isyt',
  'ISYT',
  (SELECT "id" FROM "MenuStyle" WHERE "id" = 'menu_style_isyt'),
  '[
    {"id": "home", "kind": "PAGE", "title": "home", "pageStyleId": "page_style_isyt_home", "menuStyleId": "menu_style_isyt_dark", "parentEntryId": null},
    {"id": "showcase", "kind": "PAGE", "title": "showcase", "pageStyleId": "page_style_isyt_showcase", "menuStyleId": null, "parentEntryId": null},
    {"id": "portfolio", "kind": "PAGE", "title": "portfolio", "pageStyleId": null, "menuStyleId": null, "parentEntryId": null},
    {"id": "portfolio_sections", "kind": "CURATIONS", "title": "", "pageStyleId": "page_style_isyt_portfolio", "menuStyleId": null, "parentEntryId": "portfolio"},
    {"id": "profile", "kind": "PAGE", "title": "profile", "pageStyleId": "page_style_isyt_profile", "menuStyleId": null, "parentEntryId": null},
    {"id": "exhibitions", "kind": "PAGE", "title": "exhibitions", "pageStyleId": "page_style_isyt_exhibitions", "menuStyleId": null, "parentEntryId": null},
    {"id": "contact", "kind": "CONTACT", "title": "contact", "pageStyleId": null, "menuStyleId": null, "parentEntryId": null}
  ]'::jsonb,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;

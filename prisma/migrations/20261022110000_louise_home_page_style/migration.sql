-- A Page Style recreating Louise Dear's home page (2026-10-22, Craig's
-- request): a Hero (small line, headline, pink italic second line beside
-- the curation's works, one at a time), a Header ("SIGNATURE WORKS")
-- and a Gallery four across with each work's name in italic. The words
-- are typed on the page; the pictures come from its curation.
INSERT INTO "PageStyle" ("id", "name", "type", "layout", "presentationTemplateId", "updatedAt")
VALUES (
  'page_style_louise_home',
  'Louise Dear — Home',
  'BLOCK_BUILD',
  '{"backgroundColor": "#f8f7f3", "backgroundImage": false, "gridSpacing": {"vertical": 40, "horizontal": 6}, "margins": {"desktop": {"vertical": 120, "horizontal": 44}, "phone": {"vertical": 40, "horizontal": 16}}, "textStyles": {"header": {"font": "cormorant-garamond", "size": 44, "look": "regular", "colour": "#1f1f1f"}, "byline": {"font": "jost", "size": 15, "look": "regular", "colour": "#6b6b6b"}, "text": {"font": "jost", "size": 17, "look": "regular", "colour": "#1f1f1f"}, "textgrid": {"font": null, "size": null, "look": null, "colour": null}}, "rows": {"louise_home_hero": {"below": 140, "between": 16, "horizontal": "left", "vertical": "top"}, "louise_home_heading": {"below": 44, "between": 16, "horizontal": "left", "vertical": "top"}, "louise_home_gallery": {"below": 16, "between": 16, "horizontal": "left", "vertical": "top"}}, "blocks": [{"id": "louise_home_hero", "type": "hero", "hero": {"seconds": 5, "fade": 1.5, "pictureShare": 45, "height": 70, "kicker": {"font": "jost", "size": 15, "look": "regular", "colour": "#6b6b6b"}, "headline": {"font": "cormorant-garamond", "size": 72, "look": "regular", "colour": "#1f1f1f"}, "accent": {"font": "cormorant-garamond", "size": 72, "look": "italic", "colour": "#d4708f"}}}, {"id": "louise_home_heading", "type": "header"}, {"id": "louise_home_gallery", "type": "gallery", "perRow": {"desktop": 4, "phone": 2}, "names": {"font": "cormorant-garamond", "size": 20, "look": "italic", "colour": "#1f1f1f"}}]}'::jsonb,
  (SELECT "id" FROM "PresentationTemplate" WHERE "id" = 'presentation_template_classic'),
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;

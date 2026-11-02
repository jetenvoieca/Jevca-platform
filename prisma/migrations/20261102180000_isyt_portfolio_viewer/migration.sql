-- ISYT — Portfolio as the old ISYT portfolio pages (2026-11-02, Craig's
-- screenshots of jillysuttonsculpture.com): its Gallery becomes a
-- Portfolio viewer — portrait thumbnails three across, a light line,
-- and the chosen work beside them (the curation's Description until one
-- is chosen). The component keeps its id, so works already put in it in
-- Arrange stay there.
--
-- And the ISYT presentation template the chosen work is shown with:
-- white, no border, the picture with a soft shadow, then the title, the
-- description, the details (type, medium, size) and where it can be
-- seen, all on the left, in Gelasio. No price or buttons, as the old
-- sites. Settings left out take their defaults.
INSERT INTO "PresentationTemplate" ("id", "name", "settings", "updatedAt")
VALUES (
  'presentation_template_isyt',
  'ISYT',
  '{
    "layout": "column",
    "mediumPlace": "details",
    "colours": {"background": "#ffffff", "border": "#ffffff", "text": "#333333", "muted": "#333333"},
    "borderWidth": 0,
    "rounding": 0,
    "pictureShadow": true,
    "titleFont": "gelasio",
    "textFont": "gelasio",
    "titleSize": 16,
    "textSize": 13,
    "lineSpacing": 1.4,
    "show": {
      "medium": true, "edition": true, "size": true, "description": true, "price": false,
      "purchase": false, "instalments": false, "instalmentTerms": false, "enquire": false, "location": true,
      "mailingList": false, "instagram": false, "enquiryEmail": false
    },
    "labels": {"location": "Can be seen at {location}", "sold": "Sold"}
  }'::jsonb,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;

UPDATE "PageStyle"
SET
  "layout" = jsonb_set(
    "layout",
    '{blocks,1}',
    '{"id": "isyt_portfolio_gallery", "type": "viewer", "viewer": {
      "perRow": 3, "phonePerRow": 3, "shape": "portrait", "thumbShare": 40, "gap": 20,
      "line": {"colour": "#cccccc", "thickness": 1}
    }}'::jsonb
  ),
  "presentationTemplateId" = (SELECT "id" FROM "PresentationTemplate" WHERE "name" = 'ISYT'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'page_style_isyt_portfolio'
  AND "layout"->'blocks'->1->>'id' = 'isyt_portfolio_gallery'
  AND "layout"->'blocks'->1->>'type' = 'gallery';

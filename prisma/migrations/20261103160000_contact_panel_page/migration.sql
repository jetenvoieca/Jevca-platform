-- The Contact panel slides over whatever page is showing (2026-11-03,
-- Craig's request) — a page is a Contact panel page (Page.contactPanel,
-- its settings) instead of opening another page (Page.opensPageId, added
-- earlier the same day, removed). A page that opened another becomes a
-- Contact panel page with the panel's usual settings. ISYT — Profile's
-- Contact panel component (also added earlier the same day) goes, and so
-- does what filled it.
ALTER TABLE "Page" ADD COLUMN "contactPanel" JSONB;

UPDATE "Page"
SET "contactPanel" = '{"title": "Contact / Mailing List", "share": 50, "font": "gelasio", "textSize": 13, "titleSize": 19, "textColour": "#333333", "background": "#ffffff"}'::jsonb
WHERE "opensPageId" IS NOT NULL;

ALTER TABLE "Page" DROP CONSTRAINT "Page_opensPageId_fkey";
DROP INDEX "Page_opensPageId_idx";
ALTER TABLE "Page" DROP COLUMN "opensPageId";

DELETE FROM "PageComponentContent" WHERE "blockId" = 'isyt_profile_contact';

UPDATE "PageStyle"
SET "layout" = jsonb_set(
      "layout" #- '{rows,isyt_profile_contact}',
      '{blocks}',
      COALESCE((
        SELECT jsonb_agg(b ORDER BY i)
        FROM jsonb_array_elements("layout"->'blocks') WITH ORDINALITY AS t(b, i)
        WHERE b->>'type' <> 'contact'
      ), '[]'::jsonb)
    ),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements("layout"->'blocks') AS b WHERE b->>'type' = 'contact'
);

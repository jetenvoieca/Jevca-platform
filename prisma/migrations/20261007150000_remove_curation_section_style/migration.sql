-- Text sections' height and background colour removed (2026-10-07,
-- Craig's request): curation text sections are plain text. Drops the
-- columns added by 20261006100000_curation_section_style.
ALTER TABLE "CurationSection" DROP COLUMN "height";
ALTER TABLE "CurationSection" DROP COLUMN "backgroundColor";

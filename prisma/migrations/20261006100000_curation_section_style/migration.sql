-- Text sections' height and background colour (2026-10-06): `height` is
-- a minimum height in pixels (null = just fits its text), with the text
-- centred in it; `backgroundColor` is a #rrggbb colour (null = none).
ALTER TABLE "CurationSection" ADD COLUMN "height" INTEGER;
ALTER TABLE "CurationSection" ADD COLUMN "backgroundColor" TEXT;

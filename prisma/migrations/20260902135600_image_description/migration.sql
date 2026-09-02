-- Adds Image.description, the companion field to the existing Image.caption
-- ("Name" in the Hopper UI). Additive only — no existing column touched.
ALTER TABLE "Image" ADD COLUMN "description" TEXT;

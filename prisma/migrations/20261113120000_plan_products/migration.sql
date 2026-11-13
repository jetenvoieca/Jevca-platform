-- Web Manager and Art Manager as products (2026-11-13, Craig's request):
-- a Plan includes either or both; the other can be added as an add-on.
-- Plans so far were websites.
ALTER TYPE "AddOn" ADD VALUE IF NOT EXISTS 'WEB_MANAGER';
ALTER TABLE "Plan" ADD COLUMN "includesWeb" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Plan" ADD COLUMN "includesArt" BOOLEAN NOT NULL DEFAULT false;

-- Marketing Manager (2026-11-13, Craig): a third product — a Plan can
-- include it, or offer it as an add-on — giving the Artist App the admin's
-- Marketing items.
ALTER TYPE "AddOn" ADD VALUE IF NOT EXISTS 'MARKETING_MANAGER';
ALTER TABLE "Plan" ADD COLUMN "includesMarketing" BOOLEAN NOT NULL DEFAULT false;

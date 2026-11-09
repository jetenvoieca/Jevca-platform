-- A site's own monthly price (2026-11-09, Craig's request — existing
-- customers' prices): replaces its plan and add-ons' total when set.
ALTER TABLE "Site" ADD COLUMN "monthlyOverride" DECIMAL(10,2);

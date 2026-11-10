-- Each site keeps the prices it joined at (2026-11-10, Craig: plan price
-- changes are for new sign-ups only). Site.planPrice replaces
-- monthlyOverride — the own price if one was set, otherwise the plan's
-- price now; each add-on a site has takes its plan's price now.
ALTER TABLE "Site" ADD COLUMN "planPrice" DECIMAL(10,2);
UPDATE "Site" s SET "planPrice" = COALESCE(s."monthlyOverride", p."monthlyPrice")
FROM "Plan" p WHERE s."planId" = p."id";
ALTER TABLE "Site" DROP COLUMN "monthlyOverride";

ALTER TABLE "SiteAddOn" ADD COLUMN "monthlyPrice" DECIMAL(10,2);
UPDATE "SiteAddOn" sa SET "monthlyPrice" = pa."monthlyPrice"
FROM "Site" s, "PlanAddOn" pa
WHERE sa."siteId" = s."id" AND pa."planId" = s."planId" AND pa."addOn" = sa."addOn";
UPDATE "SiteAddOn" SET "monthlyPrice" = 0 WHERE "monthlyPrice" IS NULL;
ALTER TABLE "SiteAddOn" ALTER COLUMN "monthlyPrice" SET NOT NULL;

-- Sign-ups pay in Test until switched to Live.
ALTER TABLE "PlatformSettings" ADD COLUMN "signupStripeMode" "StripeMode" NOT NULL DEFAULT 'TEST';

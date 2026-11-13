-- A price in each currency (2026-11-13, Craig): a plan and each add-on it
-- offers are priced in £, € and $; a site pays in one (Site.planCurrency,
-- set with its plan — the sign-up's currency), kept apart from the site's
-- own currency for its works (Site.defaultCurrency). Prices so far were in
-- the plan's one currency: that figure is copied to the other two until
-- set.

CREATE TABLE "PlanPrice" (
    "planId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "monthlyPrice" DECIMAL(10,2) NOT NULL,
    CONSTRAINT "PlanPrice_pkey" PRIMARY KEY ("planId","currency")
);
ALTER TABLE "PlanPrice" ADD CONSTRAINT "PlanPrice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
INSERT INTO "PlanPrice" ("planId", "currency", "monthlyPrice")
SELECT p."id", c."code", p."monthlyPrice" FROM "Plan" p CROSS JOIN (VALUES ('GBP'), ('EUR'), ('USD')) AS c("code");

ALTER TABLE "PlanAddOn" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'GBP';
ALTER TABLE "PlanAddOn" DROP CONSTRAINT "PlanAddOn_pkey";
INSERT INTO "PlanAddOn" ("planId", "addOn", "monthlyPrice", "currency")
SELECT a."planId", a."addOn", a."monthlyPrice", c."code"
FROM "PlanAddOn" a CROSS JOIN (VALUES ('EUR'), ('USD')) AS c("code")
WHERE a."currency" = 'GBP';
ALTER TABLE "PlanAddOn" ADD CONSTRAINT "PlanAddOn_pkey" PRIMARY KEY ("planId","addOn","currency");
ALTER TABLE "PlanAddOn" ALTER COLUMN "currency" DROP DEFAULT;

ALTER TABLE "Site" ADD COLUMN "planCurrency" TEXT;
UPDATE "Site" s SET "planCurrency" = p."currency" FROM "Plan" p WHERE s."planId" = p."id";

ALTER TABLE "SignupLink" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'GBP';
UPDATE "SignupLink" l SET "currency" = p."currency" FROM "Plan" p WHERE l."planId" = p."id";
ALTER TABLE "SignupLink" ALTER COLUMN "currency" DROP DEFAULT;

ALTER TABLE "Plan" DROP COLUMN "monthlyPrice";
ALTER TABLE "Plan" DROP COLUMN "currency";

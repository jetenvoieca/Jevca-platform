-- Subscriber options (2026-11-09, Craig's request) — see Plan in
-- schema.prisma and lib/plans.ts. Starts with the "Portfolio" plan as
-- Craig's mockup (prices to be confirmed): £19 a month, the ISYT theme,
-- one group of up to 10 pages, and its add-ons.
CREATE TYPE "AddOn" AS ENUM ('LOCATIONS', 'ECOMMERCE', 'MAILINGS', 'EXTRA_PAGE_GROUP');

CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyPrice" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "groupsIncluded" INTEGER NOT NULL DEFAULT 1,
    "pagesPerGroup" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Plan_name_key" ON "Plan"("name");

CREATE TABLE "PlanTheme" (
    "planId" TEXT NOT NULL,
    "siteThemeId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "PlanTheme_pkey" PRIMARY KEY ("planId","siteThemeId")
);
CREATE INDEX "PlanTheme_siteThemeId_idx" ON "PlanTheme"("siteThemeId");
ALTER TABLE "PlanTheme" ADD CONSTRAINT "PlanTheme_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanTheme" ADD CONSTRAINT "PlanTheme_siteThemeId_fkey" FOREIGN KEY ("siteThemeId") REFERENCES "SiteTheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PlanAddOn" (
    "planId" TEXT NOT NULL,
    "addOn" "AddOn" NOT NULL,
    "monthlyPrice" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "PlanAddOn_pkey" PRIMARY KEY ("planId","addOn")
);
ALTER TABLE "PlanAddOn" ADD CONSTRAINT "PlanAddOn_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SiteAddOn" (
    "siteId" TEXT NOT NULL,
    "addOn" "AddOn" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "SiteAddOn_pkey" PRIMARY KEY ("siteId","addOn")
);
ALTER TABLE "SiteAddOn" ADD CONSTRAINT "SiteAddOn_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Site" ADD COLUMN "planId" TEXT;
ALTER TABLE "Site" ADD COLUMN "siteThemeId" TEXT;
CREATE INDEX "Site_planId_idx" ON "Site"("planId");
CREATE INDEX "Site_siteThemeId_idx" ON "Site"("siteThemeId");
ALTER TABLE "Site" ADD CONSTRAINT "Site_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Site" ADD CONSTRAINT "Site_siteThemeId_fkey" FOREIGN KEY ("siteThemeId") REFERENCES "SiteTheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Plan" ("id", "name", "monthlyPrice", "currency", "groupsIncluded", "pagesPerGroup", "updatedAt")
VALUES ('plan_portfolio', 'Portfolio', 19.00, 'GBP', 1, 10, CURRENT_TIMESTAMP);

INSERT INTO "PlanTheme" ("planId", "siteThemeId", "position")
SELECT 'plan_portfolio', "id", 0 FROM "SiteTheme" WHERE "id" = 'site_theme_isyt';

INSERT INTO "PlanAddOn" ("planId", "addOn", "monthlyPrice") VALUES
  ('plan_portfolio', 'LOCATIONS', 5.00),
  ('plan_portfolio', 'ECOMMERCE', 3.00),
  ('plan_portfolio', 'MAILINGS', 2.00),
  ('plan_portfolio', 'EXTRA_PAGE_GROUP', 1.00);

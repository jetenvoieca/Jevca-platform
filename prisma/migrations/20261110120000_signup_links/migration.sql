-- Sign-up links (2026-11-10, Craig's request) — see SignupLink in
-- schema.prisma.
CREATE TABLE "SignupLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "siteThemeId" TEXT NOT NULL,
    "planPrice" DECIMAL(10,2) NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "openedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "siteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignupLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SignupLink_token_key" ON "SignupLink"("token");
CREATE UNIQUE INDEX "SignupLink_siteId_key" ON "SignupLink"("siteId");
CREATE INDEX "SignupLink_planId_idx" ON "SignupLink"("planId");
CREATE INDEX "SignupLink_siteThemeId_idx" ON "SignupLink"("siteThemeId");
ALTER TABLE "SignupLink" ADD CONSTRAINT "SignupLink_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SignupLink" ADD CONSTRAINT "SignupLink_siteThemeId_fkey" FOREIGN KEY ("siteThemeId") REFERENCES "SiteTheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SignupLink" ADD CONSTRAINT "SignupLink_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SignupLinkAddOn" (
    "linkId" TEXT NOT NULL,
    "addOn" "AddOn" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "monthlyPrice" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "SignupLinkAddOn_pkey" PRIMARY KEY ("linkId","addOn")
);
ALTER TABLE "SignupLinkAddOn" ADD CONSTRAINT "SignupLinkAddOn_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "SignupLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

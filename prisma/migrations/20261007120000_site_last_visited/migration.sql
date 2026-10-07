-- When a site was last opened in the admin (2026-10-07) — drives the two
-- recent sites under "Sites" in the main menu. Indexed for the
-- newest-first lookup.
ALTER TABLE "Site" ADD COLUMN "lastVisitedAt" TIMESTAMP(3);
CREATE INDEX "Site_lastVisitedAt_idx" ON "Site"("lastVisitedAt");

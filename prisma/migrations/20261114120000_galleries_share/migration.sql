-- The shared Galleries link (2026-11-13, Craig): Administration → Contacts'
-- galleries, view only, for colleagues, at /shared/galleries/<token>.
ALTER TABLE "PlatformSettings" ADD COLUMN "galleriesShareToken" TEXT;
CREATE UNIQUE INDEX "PlatformSettings_galleriesShareToken_key" ON "PlatformSettings"("galleriesShareToken");

-- Art Manager only sign-ups (2026-11-13): an offer without the website
-- has no theme.
ALTER TABLE "SignupLink" ALTER COLUMN "siteThemeId" DROP NOT NULL;

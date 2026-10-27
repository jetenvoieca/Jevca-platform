-- Each client's own email texts (2026-10-27) — see Artist.emailTexts and
-- lib/emailTexts.ts.
ALTER TABLE "Artist" ADD COLUMN "emailTexts" JSONB NOT NULL DEFAULT '{}';

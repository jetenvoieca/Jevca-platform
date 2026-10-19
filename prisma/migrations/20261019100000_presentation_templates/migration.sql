-- Presentation Templates (2026-10-19): how a work's details look when
-- opened on a page, chosen per Page Style.
CREATE TABLE "PresentationTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresentationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PresentationTemplate_name_key" ON "PresentationTemplate"("name");

ALTER TABLE "PageStyle" ADD COLUMN "presentationTemplateId" TEXT;

ALTER TABLE "PageStyle" ADD CONSTRAINT "PageStyle_presentationTemplateId_fkey" FOREIGN KEY ("presentationTemplateId") REFERENCES "PresentationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The first template, from Louise Dear's website.
INSERT INTO "PresentationTemplate" ("id", "name", "settings", "updatedAt")
VALUES ('presentation_template_classic', 'Classic', '{}', CURRENT_TIMESTAMP);

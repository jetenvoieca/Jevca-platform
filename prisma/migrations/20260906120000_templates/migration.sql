-- CreateEnum: fixed layout styles offered by the Templates library
-- (2026-09-06) — shell only, no renderer per style yet.
CREATE TYPE "PageStyle" AS ENUM ('PORTFOLIO', 'SHOWCASE', 'PROFILE', 'EXHIBITIONS', 'HOME', 'FREEFORM');

-- CreateTable: a reusable, cross-site design library.
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable: one named page slot within a Template.
CREATE TABLE "TemplatePage" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "style" "PageStyle" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplatePage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TemplatePage_templateId_idx" ON "TemplatePage"("templateId");

-- AddForeignKey
ALTER TABLE "TemplatePage" ADD CONSTRAINT "TemplatePage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

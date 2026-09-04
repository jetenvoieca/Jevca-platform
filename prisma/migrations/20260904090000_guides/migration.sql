-- CreateEnum: the two fixed Guides categories (User / Technical).
CREATE TYPE "GuideCategory" AS ENUM ('USER', 'TECHNICAL');

-- CreateTable: platform-wide step-by-step guides, shown in the
-- Administration menu. Not tied to any Artist or Site.
CREATE TABLE "Guide" (
    "id" TEXT NOT NULL,
    "category" "GuideCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guide_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Guide_category_idx" ON "Guide"("category");

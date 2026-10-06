-- Menu Styles (2026-10-06): named site menu designs shared by every site.
CREATE TABLE "MenuStyle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "layout" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuStyle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MenuStyle_name_key" ON "MenuStyle"("name");

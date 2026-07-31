CREATE TABLE "Menu" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Menu_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MenuGroup" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "byline" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Menu_siteId_idx" ON "Menu"("siteId");
CREATE INDEX "MenuGroup_menuId_idx" ON "MenuGroup"("menuId");
CREATE INDEX "MenuItem_groupId_idx" ON "MenuItem"("groupId");
CREATE INDEX "MenuItem_pageId_idx" ON "MenuItem"("pageId");

ALTER TABLE "Menu" ADD CONSTRAINT "Menu_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MenuGroup" ADD CONSTRAINT "MenuGroup_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "MenuGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

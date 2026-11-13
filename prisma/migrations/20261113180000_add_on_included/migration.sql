-- What each add-on includes (2026-11-13, Craig): one list for each add-on,
-- the same on every plan — shown on the Artist App's Account under the
-- plan's own list when the site has that add-on.
CREATE TABLE "AddOnInfo" (
    "addOn" "AddOn" NOT NULL,
    "included" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "AddOnInfo_pkey" PRIMARY KEY ("addOn")
);

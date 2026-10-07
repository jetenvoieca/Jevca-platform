-- The Section Style Type is removed (2026-10-07, Craig's request): a
-- Block Build style is built from components instead. Deletes every
-- Section page style; pages that used one are left with no Display
-- Style (Page.pageStyleId is set to null by its foreign key).
-- PageType keeps its SECTION value for now, because the old page
-- editors (Page.type) still use it.
DELETE FROM "PageStyle" WHERE "type" = 'SECTION';

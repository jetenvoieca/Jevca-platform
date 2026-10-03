-- Curation descriptions follow the artwork until written (2026-10-03).
-- A work's Description is now null until someone writes one; until then
-- the Curations page shows the artwork's Type, Size and Medium, always
-- current. Clears every description still exactly as it was filled in
-- automatically (Type, Medium, Size — see 20261003120000), so those
-- works show the live default too. Anything edited by hand is kept.
UPDATE "CurationItem" AS ci
SET "description" = NULL
FROM "Artwork" AS a
WHERE a."id" = ci."artworkId"
  AND ci."description" IS NOT DISTINCT FROM NULLIF(
    concat_ws(
      E'\n',
      NULLIF(btrim(a."type"), ''),
      NULLIF(btrim(a."medium"), ''),
      NULLIF(btrim(a."size"), '')
    ),
    ''
  );

-- Art Manager add-on (2026-11-09, Craig's request) — see AddOn in
-- schema.prisma. No plan offers it until it's priced in Templates → Plans.
ALTER TYPE "AddOn" ADD VALUE 'ART_MANAGER' BEFORE 'LOCATIONS';

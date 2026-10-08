-- Settings → Personal Profile → Writing voice (2026-10-08): how the
-- artist writes, used when a campaign mail is translated into French.
-- Louise Dear's starts with the description her own site already uses.

-- AlterTable
ALTER TABLE "Artist" ADD COLUMN "writingVoice" TEXT;

-- Louise Dear's writing voice
UPDATE "Artist"
SET "writingVoice" = 'Louise Dear is a British artist working between the UK and the South of France. Her voice is warm, sensory and first-person — never deadpan-corporate, never generic marketing-speak. She writes the way she''d describe things to a friend: textures, light, the story behind them, a little playful or wistful where it fits.'
WHERE "name" = 'Louise Dear' AND "writingVoice" IS NULL;

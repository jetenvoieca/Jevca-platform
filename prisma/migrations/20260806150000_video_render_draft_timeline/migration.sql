-- AlterEnum: add DRAFT to VideoRenderStatus — the Video Editor's
-- in-progress working state, before anything is submitted to Shotstack.
ALTER TYPE "VideoRenderStatus" ADD VALUE 'DRAFT';

-- AlterTable: the ordered clip list (order, per-photo duration, per-video
-- trim in/out) for a DRAFT VideoRender. See src/lib/videoTimeline.ts.
ALTER TABLE "VideoRender" ADD COLUMN "timeline" JSONB;

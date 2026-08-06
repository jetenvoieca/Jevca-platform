-- AlterTable: records which Shotstack environment a render was submitted
-- to, and the confirmed error reason if one fails.
ALTER TABLE "VideoRender" ADD COLUMN "renderEnv" TEXT;
ALTER TABLE "VideoRender" ADD COLUMN "renderError" TEXT;

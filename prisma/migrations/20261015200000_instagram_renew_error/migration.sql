-- Why an Instagram connection's last renewal failed (2026-10-15).

-- AlterTable
ALTER TABLE "InstagramConnection" ADD COLUMN "renewError" TEXT;

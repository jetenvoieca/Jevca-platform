-- AlterTable: Settings-editable list of task categories (2026-09-19, CRM
-- Phase 2) — same pattern as PlatformSettings.expenseCategories, but
-- starts empty: the categories are entirely Craig's own to define, so
-- nothing is prefilled.
ALTER TABLE "PlatformSettings" ADD COLUMN "taskCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateTable: tasks on the admin Inbox's Task view. An open task has
-- completedAt NULL; completing it sets completedAt, which is what the
-- Done list reads. artistId is optional — a task can be general.
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "artistId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetDate" DATE,
    "category" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_artistId_idx" ON "Task"("artistId");

-- CreateIndex
CREATE INDEX "Task_completedAt_idx" ON "Task"("completedAt");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

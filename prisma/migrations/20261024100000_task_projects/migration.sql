-- Projects (2026-10-24): a task flagged as a project, and a task made
-- from one of a task's action lines.
ALTER TABLE "Task" ADD COLUMN "isProject" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN "fromActionId" TEXT;

CREATE UNIQUE INDEX "Task_fromActionId_key" ON "Task"("fromActionId");

ALTER TABLE "Task" ADD CONSTRAINT "Task_fromActionId_fkey" FOREIGN KEY ("fromActionId") REFERENCES "TaskAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

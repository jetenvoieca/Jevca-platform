-- The Gmail conversation a task was made from (Inbox → Personal).
ALTER TABLE "Task" ADD COLUMN "gmailThreadId" TEXT;
CREATE UNIQUE INDEX "Task_gmailThreadId_key" ON "Task"("gmailThreadId");

-- Emailing from a task (2026-09-27): a task can hold the address it's
-- about, and emails sent from it — and replies to them — are linked
-- back to it. Deleting a task keeps the emails, just unlinked.
ALTER TABLE "Task" ADD COLUMN "email" TEXT;

ALTER TABLE "InboundEmail" ADD COLUMN "taskId" TEXT;
ALTER TABLE "OutboundEmail" ADD COLUMN "taskId" TEXT;
ALTER TABLE "OutboundEmail" ADD COLUMN "messageId" TEXT;

ALTER TABLE "InboundEmail" ADD CONSTRAINT "InboundEmail_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutboundEmail" ADD CONSTRAINT "OutboundEmail_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "InboundEmail_taskId_idx" ON "InboundEmail"("taskId");
CREATE INDEX "InboundEmail_messageId_idx" ON "InboundEmail"("messageId");
CREATE INDEX "OutboundEmail_taskId_idx" ON "OutboundEmail"("taskId");
CREATE INDEX "OutboundEmail_messageId_idx" ON "OutboundEmail"("messageId");

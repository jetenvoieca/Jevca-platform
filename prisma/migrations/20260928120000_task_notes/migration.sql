-- Notes on a task (2026-09-28) — see the TaskNote model in schema.prisma.
CREATE TABLE "TaskNote" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskNote_taskId_idx" ON "TaskNote"("taskId");

ALTER TABLE "TaskNote" ADD CONSTRAINT "TaskNote_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tidy-up: 20260927120000_inbound_email_archive (a duplicate of
-- 20260927100000_inbound_email_archive) also created this index, which
-- nothing uses — the Inbox list is served by
-- InboundEmail_mailbox_archivedAt_receivedAt_idx (see
-- 20260927120000_business_mailbox). Dropped so the database matches the
-- schema.
DROP INDEX IF EXISTS "InboundEmail_archivedAt_receivedAt_idx";

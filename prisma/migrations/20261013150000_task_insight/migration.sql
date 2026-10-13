-- Insights (2026-10-13): a task kept for its information — see Task.keptOn.
ALTER TABLE "Task" ADD COLUMN "keptOn" DATE;

CREATE INDEX "Task_keptOn_idx" ON "Task"("keptOn");

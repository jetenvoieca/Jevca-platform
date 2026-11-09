-- A sale's alerts are deleted with the sale (2026-11-09).
ALTER TABLE "AlertEvent" DROP CONSTRAINT "AlertEvent_purchaseId_fkey";
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

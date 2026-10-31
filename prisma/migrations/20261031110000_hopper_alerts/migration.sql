-- Hopper alerts (2026-10-31): items added to / processed from a client's
-- Hopper — see AlertEvent.itemCount in schema.prisma and lib/hopperAlerts.ts.
ALTER TABLE "AlertEvent" ADD COLUMN "itemCount" INTEGER;
ALTER TABLE "AlertEvent" ADD COLUMN "lastItemAt" TIMESTAMP(3);

-- "Up to date" on a payment-overdue alert used to be logged as a completed
-- Task (category "Subscription payments updated") so it showed in the
-- Inbox's Done list. Since 2026-09-28 the Alert view has its own list of
-- processed alerts, and Up to date is recorded there instead, as a
-- resolved AlertEvent (see markSubscriptionUpToDate). This moves the
-- existing entries across, so the task Done list only holds real tasks.
INSERT INTO "AlertEvent" ("id", "type", "severity", "message", "artistId", "resolvedAt", "createdAt")
SELECT
    gen_random_uuid()::text,
    'SUBSCRIPTION_PAYMENT_OVERDUE',
    'WARNING',
    "name" || ': subscription payments updated.',
    "artistId",
    "completedAt",
    "completedAt"
FROM "Task"
WHERE "category" = 'Subscription payments updated' AND "completedAt" IS NOT NULL;

DELETE FROM "Task"
WHERE "category" = 'Subscription payments updated' AND "completedAt" IS NOT NULL;

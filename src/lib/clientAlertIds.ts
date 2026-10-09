// The two subscription alerts about a client — payment overdue and no
// payment method — are computed rather than stored, and their ids embed
// the artist's id (2026-09-19, CRM Phase 3; no payment method added
// 2026-10-09) — so the Inbox can open that client's Owner / Domain /
// Subscription cards from the alert's id alone, even after the alert
// itself has cleared. Plain module, so client components can use the type.

export type ClientAlertType = "SUBSCRIPTION_PAYMENT_OVERDUE" | "SUBSCRIPTION_METHOD_MISSING";

const PREFIXES: Record<ClientAlertType, string> = {
  SUBSCRIPTION_PAYMENT_OVERDUE: "manual-overdue-",
  SUBSCRIPTION_METHOD_MISSING: "no-payment-method-",
};

export function clientAlertId(type: ClientAlertType, artistId: string): string {
  return `${PREFIXES[type]}${artistId}`;
}

// The alert type and artist id inside a client alert's id, or null if
// it isn't one.
export function parseClientAlertId(alertId: string): { type: ClientAlertType; artistId: string } | null {
  for (const [type, prefix] of Object.entries(PREFIXES) as [ClientAlertType, string][]) {
    if (alertId.startsWith(prefix)) return { type, artistId: alertId.slice(prefix.length) };
  }
  return null;
}

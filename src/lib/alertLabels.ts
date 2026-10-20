// Display names for each alert type, shared by the Inbox's Alert list and
// the alert detail view. Kept as a plain module (not next to the alert
// scan in alerts.ts) so client components can import it without pulling
// in the database code.
export const ALERT_TYPE_LABELS: Record<string, string> = {
  SUBSCRIPTION_PAYMENT_FAILED: "Payment failed",
  SUBSCRIPTION_CANCELLED: "Subscription cancelled",
  SUBSCRIPTION_PAYMENT_OVERDUE: "Payment overdue",
  SUBSCRIPTION_METHOD_MISSING: "No payment method",
  SALE_INVOICE_UNPAID: "Invoice unpaid",
  // 2026-09-19 — an invoice unpaid past the client's overdue days
  // (counted from the date invoiced since 2026-10-20).
  SALE_INVOICE_OVERDUE: "Invoice overdue",
  // 2026-09-21 — raised by the Studio app; see raiseSaleAlert in
  // lib/alerts.ts.
  SALE_RECORDED: "Sale recorded",
  SALE_LINK_CREATED: "Payment link created",
  // 2026-09-05, Email Integration — see raiseAlertIfNotAlreadyOpen in
  // lib/actions/inboundEmail.ts.
  EMAIL_REPLY_RECEIVED: "New email reply",
};

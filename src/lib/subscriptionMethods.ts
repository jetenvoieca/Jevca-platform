// How a client pays their platform subscription — Artist.paymentMethod.
// One list, shared by the Subscription card, its server action, the
// alerts scan and the Accounts page. Plain module, so client components
// can import it.
//
// FOC (2026-10-09, direct request): free of charge — no payments are
// expected, so it's never overdue and never "no payment method".

export const SUBSCRIPTION_METHODS = [
  { value: "Stripe", label: "Stripe" },
  { value: "PayPal", label: "PayPal" },
  { value: "DD", label: "Direct Debit" },
  { value: "FOC", label: "FOC" },
] as const;

export type SubscriptionMethod = (typeof SUBSCRIPTION_METHODS)[number]["value"];

// Paid by hand and recorded in the card's payment list — the ones the
// overdue-payment alert watches.
export const MANUAL_SUBSCRIPTION_METHODS: SubscriptionMethod[] = ["PayPal", "DD"];

export function isSubscriptionMethod(value: string): value is SubscriptionMethod {
  return SUBSCRIPTION_METHODS.some((m) => m.value === value);
}

export function subscriptionMethodLabel(value: string | null): string | null {
  return SUBSCRIPTION_METHODS.find((m) => m.value === value)?.label ?? value;
}

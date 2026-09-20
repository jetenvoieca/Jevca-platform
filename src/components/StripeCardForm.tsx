"use client";

import { useState, useMemo } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { handleFirstPaymentSucceeded } from "@/lib/actions/payments";

function CardEntryForm({
  purchaseId,
  onDone,
}: {
  purchaseId: string;
  onDone: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    // redirect: "if_required" keeps the admin in the app for a normal
    // card — Stripe only redirects away if the card genuinely needs an
    // extra step (e.g. 3D Secure), then returns automatically.
    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    setSubmitting(false);
    if (confirmError) {
      setError(confirmError.message || "Payment failed. Check the card details and try again.");
      return;
    }

    // Record the payment directly, right here, rather than waiting on
    // the Stripe webhook alone (2026-09-20, direct request — a real
    // charge was confirmed here as "went through" while the sale
    // stayed stuck UNPAID, because the webhook wasn't reaching this
    // environment). stripe.confirmPayment succeeding means Stripe has
    // already taken the money; the app should say so immediately, not
    // depend on a second, separate delivery to find out. Same action
    // the webhook itself calls, and already idempotent there — if the
    // webhook does also arrive (now or later), it's simply a no-op.
    if (paymentIntent?.status === "succeeded") {
      try {
        await handleFirstPaymentSucceeded(purchaseId, paymentIntent.id);
      } catch {
        // Don't block the buyer/artist on this — the webhook is still
        // a working backup path if this direct call somehow failed.
      }
    }

    onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* wallets.link: "never" (2026-09-20, direct request — "don't
          need the Save details part") — this form is filled in by the
          artist over the phone, entering the buyer's card on their
          behalf, not by the buyer themselves. Stripe's default Link
          prompt ("Save your info for secure 1-click checkout") asks
          whether to remember the card for next time and offers email-
          based autofill — neither makes sense here, since it's not the
          cardholder's own browser/account doing the saving. Turning
          Link off removes that prompt entirely, leaving just the plain
          card fields. */}
      <PaymentElement options={{ wallets: { link: "never" } }} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {submitting ? "Processing…" : "Take payment"}
      </button>
    </form>
  );
}

export default function StripeCardForm({
  clientSecret,
  publishableKey,
  purchaseId,
  onDone,
}: {
  clientSecret: string;
  publishableKey: string;
  // 2026-09-20 — needed here now so a successful confirmPayment can
  // record itself directly (see CardEntryForm's own note above) instead
  // of relying solely on the Stripe webhook.
  purchaseId: string;
  onDone: () => void;
}) {
  // loadStripe caches internally per key, so this is cheap even if it
  // runs again on re-render — but useMemo avoids re-triggering it
  // unnecessarily anyway. Per-artist now (2026-08-09), not a single
  // module-level constant, since Test and Live artists use different keys.
  const stripePromise = useMemo(() => loadStripe(publishableKey), [publishableKey]);

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <CardEntryForm purchaseId={purchaseId} onDone={onDone} />
    </Elements>
  );
}

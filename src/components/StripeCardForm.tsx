"use client";

import { useState, useMemo } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

function CardEntryForm({ onDone }: { onDone: () => void }) {
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
    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    setSubmitting(false);
    if (confirmError) {
      setError(confirmError.message || "Payment failed. Check the card details and try again.");
      return;
    }
    onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <PaymentElement />
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
  onDone,
}: {
  clientSecret: string;
  publishableKey: string;
  onDone: () => void;
}) {
  // loadStripe caches internally per key, so this is cheap even if it
  // runs again on re-render — but useMemo avoids re-triggering it
  // unnecessarily anyway. Per-artist now (2026-08-09), not a single
  // module-level constant, since Test and Live artists use different keys.
  const stripePromise = useMemo(() => loadStripe(publishableKey), [publishableKey]);

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <CardEntryForm onDone={onDone} />
    </Elements>
  );
}

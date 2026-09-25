"use client";

import { useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { confirmCardPayment } from "@/lib/studioApi";
import { NoticeLine, panelCls, StudioButton } from "@/components/studio/StudioUi";
import type { Notice } from "@/components/studio/StudioUi";

// The card panel: Stripe's own card form (card number, expiry, CVC,
// country) and "Take Payment". Once Stripe reports the payment went
// through, the server is asked to check it with Stripe and record the sale
// as paid.

function CardForm({
  token,
  purchaseId,
  onPaid,
  onBusyChange,
}: {
  token: string;
  purchaseId: string;
  onPaid: (recorded: boolean) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const pay = async () => {
    if (!stripe || !elements) return;

    setSubmitting(true);
    onBusyChange(true);
    setNotice({ text: "Taking payment…", tone: "info" });
    try {
      // "if_required" keeps the artist in the app for a normal card —
      // Stripe only steps in (e.g. 3D Secure) when the card needs it.
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
      });
      if (error) {
        setNotice({
          text: error.message || "Payment failed. Check the card details and try again.",
          tone: "error",
        });
        return;
      }
      if (paymentIntent?.status !== "succeeded") {
        setNotice({ text: "The payment didn't complete. Please try again.", tone: "error" });
        return;
      }

      // The money is taken. If recording it here fails the Stripe webhook
      // still records it, so the artist is told rather than shown an error.
      let recorded = true;
      try {
        await confirmCardPayment(token, purchaseId, paymentIntent.id);
      } catch {
        recorded = false;
      }
      onPaid(recorded);
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : "Payment failed. Please try again.",
        tone: "error",
      });
    } finally {
      setSubmitting(false);
      onBusyChange(false);
    }
  };

  return (
    <>
      <section className={`${panelCls} p-4`}>
        {/* Link off: the artist fills this in over the phone for the buyer, so
            Stripe's "save your info for 1-click checkout" makes no sense. */}
        <PaymentElement options={{ wallets: { link: "never" } }} />
      </section>
      <NoticeLine notice={notice} />
      <section className={`${panelCls} p-4`}>
        <div className="flex gap-4">
          <StudioButton onClick={pay} disabled={!stripe || submitting}>
            Take Payment
          </StudioButton>
        </div>
      </section>
    </>
  );
}

export default function CardPayment({
  token,
  purchaseId,
  clientSecret,
  publishableKey,
  stripeAccount,
  onPaid,
  onBusyChange,
}: {
  token: string;
  purchaseId: string;
  clientSecret: string;
  publishableKey: string;
  // The artist's own linked Stripe account the payment is taken into, or
  // null for Jetenvoieca's own account (see StripeCardForm).
  stripeAccount: string | null;
  // Called once the payment has gone through; `recorded` is false if the
  // sale couldn't be recorded straight away (the Stripe webhook will).
  onPaid: (recorded: boolean) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  // Per artist, since Test and Live artists use different Stripe keys,
  // and a linked artist's payments are taken in their own account.
  const stripePromise = useMemo(
    () => loadStripe(publishableKey, stripeAccount ? { stripeAccount } : undefined),
    [publishableKey, stripeAccount]
  );

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <CardForm
        token={token}
        purchaseId={purchaseId}
        onPaid={onPaid}
        onBusyChange={onBusyChange}
      />
    </Elements>
  );
}

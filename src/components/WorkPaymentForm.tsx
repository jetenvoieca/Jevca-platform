"use client";

import { useMemo, useState, type FormEvent } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { CurationWorkPresentation } from "@/lib/actions/curations";
import type { CardEntry } from "@/lib/actions/payments";
import { confirmWebsitePayment, startWebsitePayment, type BuyerAddress } from "@/lib/actions/websitePurchase";
import { MAX_EMAIL_LENGTH } from "@/lib/emailAddress";
import { fillLabel, type PresentationSettings } from "@/lib/presentationTemplate";
import { formatMoney } from "@/lib/currencies";
import { isValidInstalmentCount, splitIntoInstalments } from "@/lib/saleMath";
import type { SiteForms } from "@/lib/siteData";
import { useTurnstile } from "@/lib/useTurnstile";
import { FormBox, FormDone, FormMessage, Labelled, formLook } from "@/components/workFormParts";

// The Presentation window's payment form (2026-10-19, Craig's request),
// sliding in over the work's words and buttons like the enquiry form when
// Purchase or Pay in instalments is pressed (see WorkPresentation). First
// the buyer's name, email and delivery address — then the work is held
// for them (lib/actions/websitePurchase.ts) and Stripe's card form
// appears; once Stripe takes the payment it's recorded and the form says
// thank you. In the template's look and wording. Only the published site
// takes payments (`site`); in the admin's previews the form is only
// shown.

const UNAVAILABLE = "Buying online isn't available right now — please try again later, or enquire.";
const MAX_FIELD = 200;

type Started = { purchaseId: string } & CardEntry;

export default function WorkPaymentForm({
  data,
  settings,
  site,
  active,
  instalments,
}: {
  data: CurationWorkPresentation;
  settings: PresentationSettings;
  site: SiteForms | null;
  // Open — the robot check only runs while it is.
  active: boolean;
  // Paying in instalments rather than in full.
  instalments: boolean;
}) {
  const { colours, labels } = settings;
  const { field, fieldClass, buttonClass, button } = formLook(settings);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState<BuyerAddress>({ line1: "", city: "", postcode: "", country: "" });
  const [sending, setSending] = useState(false);
  const [started, setStarted] = useState<Started | null>(null);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = useTurnstile(site?.siteKey ?? null, active && !started);
  const shownError = error ?? (check.failed ? UNAVAILABLE : null);

  const price = Number(data.offeredPrice ?? 0);
  const count = data.defaultInstalmentCount;
  const byInstalments = instalments && isValidInstalmentCount(count);
  const today = byInstalments ? splitIntoInstalments(price, count)[0] : price;
  const values = {
    price: formatMoney(price, data.priceCurrency, "when-any"),
    count: String(count),
    amount: formatMoney(today, data.priceCurrency),
    today: formatMoney(today, data.priceCurrency, byInstalments ? "always" : "when-any"),
  };
  const payButton = button(colours.purchaseBackground, colours.purchaseText);

  const start = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    if (!site) return setError("Payments are taken on the published site.");
    if (!site.siteKey) return setError(UNAVAILABLE);
    if (!check.token) return setError("Just a moment — checking you're not a robot. Please try again.");
    setSending(true);
    setError(null);
    const result = await startWebsitePayment({
      siteId: site.siteId,
      artworkId: data.artworkId,
      instalments: byInstalments,
      name,
      email,
      address,
      token: check.token,
    }).catch(() => ({ error: UNAVAILABLE }));
    setSending(false);
    if ("error" in result) {
      setError(result.error);
      // A check can only be used once.
      check.reset();
      return;
    }
    setStarted(result);
  };

  const box = (value: string, onChange: (v: string) => void, placeholder: string, autoComplete: string) => (
    <input
      type="text"
      required
      autoComplete={autoComplete}
      value={value}
      maxLength={MAX_FIELD}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className={fieldClass}
      style={field}
    />
  );
  const setPart = (part: keyof BuyerAddress) => (v: string) => setAddress((a) => ({ ...a, [part]: v }));

  return (
    <FormBox settings={settings}>
      <p className="uppercase tracking-[0.15em]" style={{ fontSize: Math.round(settings.textSize * 0.85) }}>
        {fillLabel(byInstalments ? labels.payInstalments : labels.payFull, values)}
      </p>

      {paid ? (
        <FormDone settings={settings} text={labels.paid} />
      ) : started ? (
        <StripeCard
          started={started}
          settings={settings}
          payLabel={fillLabel(labels.pay, values)}
          billing={{ name, email, address }}
          onPaid={async (paymentIntentId) => {
            // Recorded straight away; the Stripe webhook does it too if
            // this doesn't arrive.
            await confirmWebsitePayment({
              siteId: site!.siteId,
              purchaseId: started.purchaseId,
              paymentIntentId,
            }).catch(() => null);
            setPaid(true);
          }}
        />
      ) : (
        <form onSubmit={start} className="flex flex-col gap-6" noValidate>
          <Labelled settings={settings} text={labels.nameLabel}>
            {box(name, setName, labels.namePlaceholder, "name")}
          </Labelled>
          <Labelled settings={settings} text={labels.emailLabel}>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              maxLength={MAX_EMAIL_LENGTH}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={labels.emailPlaceholder}
              className={fieldClass}
              style={field}
            />
          </Labelled>
          <Labelled settings={settings} text={labels.addressLabel}>
            {box(address.line1, setPart("line1"), labels.addressPlaceholder, "street-address")}
          </Labelled>
          <div className="-mt-3 grid grid-cols-2 gap-3">
            {box(address.city, setPart("city"), labels.cityPlaceholder, "address-level2")}
            {box(address.postcode, setPart("postcode"), labels.postcodePlaceholder, "postal-code")}
          </div>
          <div className="-mt-3">
            {box(address.country, setPart("country"), labels.countryPlaceholder, "country-name")}
          </div>

          <div ref={check.checkRef} />
          <FormMessage settings={settings} text={shownError} preview={!site} />

          <button type="submit" disabled={sending} className={buttonClass} style={payButton}>
            {sending ? "…" : labels.continue}
          </button>
          {labels.holdNote && (
            <p style={{ color: colours.muted, fontSize: formLook(settings).small }}>{labels.holdNote}</p>
          )}
        </form>
      )}
    </FormBox>
  );
}

// Stripe's own card form, in the template's colours, and the Pay button.
function StripeCard({
  started,
  settings,
  payLabel,
  billing,
  onPaid,
}: {
  started: Started;
  settings: PresentationSettings;
  payLabel: string;
  billing: { name: string; email: string; address: BuyerAddress };
  onPaid: (paymentIntentId: string) => Promise<void>;
}) {
  const { colours } = settings;
  const stripePromise = useMemo(
    () =>
      loadStripe(started.publishableKey, started.stripeAccount ? { stripeAccount: started.stripeAccount } : undefined),
    [started.publishableKey, started.stripeAccount],
  );
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret: started.clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorBackground: colours.fieldBackground,
            colorText: colours.text,
            colorPrimary: colours.purchaseBackground,
            borderRadius: "0px",
          },
        },
      }}
    >
      <PayForm settings={settings} payLabel={payLabel} billing={billing} onPaid={onPaid} />
    </Elements>
  );
}

function PayForm({
  settings,
  payLabel,
  billing,
  onPaid,
}: {
  settings: PresentationSettings;
  payLabel: string;
  billing: { name: string; email: string; address: BuyerAddress };
  onPaid: (paymentIntentId: string) => Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { buttonClass, button } = formLook(settings);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async (e: FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || paying) return;
    setPaying(true);
    setError(null);
    // Stays on the page for a card; a payment method that has to leave
    // for its bank comes back to this page, and the webhook records it.
    const { error: failed, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: { return_url: window.location.href },
    });
    if (failed) {
      setPaying(false);
      setError(failed.message ?? "The payment didn't go through — please check the details and try again.");
      return;
    }
    if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
      await onPaid(paymentIntent.id);
    }
    setPaying(false);
  };

  return (
    <form onSubmit={pay} className="flex flex-col gap-6">
      <PaymentElement
        options={{
          defaultValues: {
            billingDetails: {
              name: billing.name,
              email: billing.email,
              address: {
                line1: billing.address.line1,
                city: billing.address.city,
                postal_code: billing.address.postcode,
              },
            },
          },
        }}
      />
      <FormMessage settings={settings} text={error} preview={false} />
      <button
        type="submit"
        disabled={!stripe || paying}
        className={buttonClass}
        style={button(settings.colours.purchaseBackground, settings.colours.purchaseText)}
      >
        {paying ? "…" : payLabel}
      </button>
    </form>
  );
}

"use client";

import { useState } from "react";
import { createPaymentLink, startCardPayment } from "@/lib/studioApi";
import type { StudioArtworkTile } from "@/lib/studioArtworks";
import { CURRENCIES } from "@/lib/currencies";
import {
  isValidInstalmentCount,
  MAX_INSTALMENTS,
  MIN_INSTALMENTS,
  splitIntoInstalments,
} from "@/lib/saleMath";
import {
  formatMoney,
  isValidEmail,
  parsePrice,
  priceToInput,
  todayIso,
} from "@/lib/studioShared";
import type { StudioPaymentDetails } from "@/lib/studioShared";
import CardPayment from "@/components/studio/CardPayment";
import {
  Dropdown,
  inputCls,
  NoticeLine,
  panelCls,
  StudioButton,
} from "@/components/studio/StudioUi";
import type { Notice } from "@/components/studio/StudioUi";

// "Payment": the sale panel for the chosen artwork — date of sale, source,
// price and currency (starting as the artwork's own), deposit, then Net
// Due (the price less the deposit, paid at once) or Instalments (the net
// due split into the number of instalments shown between them), and the
// buyer. Then either "Get link" (a payment link for the buyer, which
// slides in above the buttons and can be shared) or "Enter Card" (the card
// panel, CardPayment). Either way the artwork becomes Sold - Not Paid; it
// becomes SOLD once the buyer has paid.

type Card = {
  purchaseId: string;
  clientSecret: string;
  publishableKey: string;
  stripeAccount: string | null;
};

function optionCls(active: boolean) {
  return `flex min-h-20 min-w-0 flex-1 flex-col items-center justify-center rounded-md border-2 bg-white px-1 py-2 text-center text-base text-[#555] ${
    active ? "border-[#5a5a5a]" : "border-[#c4c4c4]"
  }`;
}

// One of the artwork's own details, or its name in grey when it has none.
function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <p className={`truncate text-base ${value ? "text-[#333]" : "text-[#8a8a8a]"}`}>
      {value || label}
    </p>
  );
}

function LinkIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

export default function TakePayment({
  token,
  artwork,
  saleSources,
  defaultInstalmentCount,
  onDone,
  onBusyChange,
}: {
  token: string;
  artwork: StudioArtworkTile;
  saleSources: string[];
  // The artist's Settings default, which can be changed for each sale.
  defaultInstalmentCount: number;
  // Called once the payment is taken — the app returns to its first
  // screen showing this message.
  onDone: (notice: Notice) => void;
  // Lets the app stop the artist leaving while something is being saved.
  onBusyChange: (busy: boolean) => void;
}) {
  const [saleDate, setSaleDate] = useState(todayIso());
  const [source, setSource] = useState("");
  const [price, setPrice] = useState(priceToInput(artwork.price));
  const [currency, setCurrency] = useState(artwork.priceCurrency);
  const [deposit, setDeposit] = useState("");
  const [option, setOption] = useState<StudioPaymentDetails["option"]>("FULL");
  const [countInput, setCountInput] = useState(String(defaultInstalmentCount));
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [working, setWorking] = useState(false);
  // True once a payment link has been made — the sale exists, so it can't
  // be started again from here.
  const [linkCreated, setLinkCreated] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // What the two choices come to: the price less any deposit, paid at once
  // or split into equal instalments (the first one shown — the same figure
  // Stripe charges first).
  const priceAmount = Number(parsePrice(price) || 0);
  const depositAmount = Number(parsePrice(deposit) || 0);
  const netDue = Math.max(priceAmount - depositAmount, 0);
  const count = Number(countInput);
  const countValid = isValidInstalmentCount(count);
  const perInstalment =
    countValid && netDue > 0 ? splitIntoInstalments(netDue, count)[0] : null;

  // Checks the form, returning what to send or null (with a message shown).
  const readDetails = (): StudioPaymentDetails | null => {
    const fail = (text: string) => {
      setNotice({ text, tone: "error" });
      return null;
    };

    if (!saleDate) return fail("Date is required.");
    const priceValue = parsePrice(price);
    if (!priceValue || Number(priceValue) <= 0) return fail("Price is required.");

    const depositValue = parsePrice(deposit);
    if (depositValue === null) return fail("Deposit must be a number, e.g. 100 or 100.50");
    if (depositValue && Number(depositValue) >= Number(priceValue)) {
      return fail("The deposit must be less than the price.");
    }
    if (option === "INSTALMENTS" && !countValid) {
      return fail(
        `Enter a number of instalments between ${MIN_INSTALMENTS} and ${MAX_INSTALMENTS}.`
      );
    }
    if (!buyerName.trim()) return fail("Customer name is required.");
    if (!isValidEmail(buyerEmail.trim())) return fail("A valid email is required.");

    return {
      artworkId: artwork.id,
      saleDate,
      price: priceValue,
      currency,
      deposit: depositValue,
      option,
      instalmentCount: countValid ? count : defaultInstalmentCount,
      source,
      buyerName: buyerName.trim(),
      buyerEmail: buyerEmail.trim(),
    };
  };

  const getLink = async () => {
    const details = readDetails();
    if (!details) return;

    setWorking(true);
    onBusyChange(true);
    setNotice({ text: "Creating link…", tone: "info" });
    try {
      const result = await createPaymentLink(token, details);
      setLink(result.url);
      setLinkCreated(true);
      setNotice({ text: "Link ready. This work is now Sold - Not Paid.", tone: "info" });
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : "Couldn't create the link. Please try again.",
        tone: "error",
      });
    } finally {
      setWorking(false);
      onBusyChange(false);
    }
  };

  const enterCard = async () => {
    const details = readDetails();
    if (!details) return;

    setWorking(true);
    onBusyChange(true);
    setNotice({ text: "Preparing card entry…", tone: "info" });
    try {
      setCard(await startCardPayment(token, details));
      setNotice(null);
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : "Couldn't start card entry. Please try again.",
        tone: "error",
      });
    } finally {
      setWorking(false);
      onBusyChange(false);
    }
  };

  // Opens the iPhone share sheet; where sharing isn't available, copies the
  // link instead.
  const shareLink = async () => {
    if (!link) return;
    try {
      if (navigator.share) {
        await navigator.share({ url: link, title: artwork.title });
        return;
      }
    } catch (err) {
      // The artist closing the share sheet isn't an error.
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(link);
      setNotice({ text: "Link copied.", tone: "info" });
    } catch {
      setNotice({ text: "Couldn't share. Press and hold the link to copy it.", tone: "error" });
    }
  };

  if (card) {
    return (
      <CardPayment
        token={token}
        purchaseId={card.purchaseId}
        clientSecret={card.clientSecret}
        publishableKey={card.publishableKey}
        stripeAccount={card.stripeAccount}
        onPaid={(recorded) =>
          onDone({
            text: recorded
              ? `Payment taken: ${artwork.title}`
              : `Payment taken: ${artwork.title}. Your records may take a minute to update.`,
            tone: "info",
          })
        }
        onBusyChange={onBusyChange}
      />
    );
  }

  // Nothing can be changed while a request is running, or once the link
  // exists (the sale has started).
  const locked = working || linkCreated;

  return (
    <>
      <section className={`${panelCls} flex flex-col gap-3 p-4`}>
        <div className="flex gap-3">
          <div className="w-1/3 shrink-0">
            {artwork.thumbnailUrl ? (
              <img
                src={artwork.thumbnailUrl}
                alt={artwork.title}
                className="aspect-square w-full rounded-md object-cover"
              />
            ) : (
              <div className="aspect-square w-full rounded-md bg-white" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-between gap-1">
            <Detail label="Title / name" value={artwork.title} />
            <Detail label="Type" value={artwork.type} />
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Detail label="Size" value={artwork.size} />
              </div>
              <input
                type="date"
                aria-label="Date of sale"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                disabled={locked}
                className="min-w-0 flex-1 rounded-md border border-[#c4c4c4] bg-white px-1 py-2 text-center text-base text-[#555]"
              />
            </div>
          </div>
        </div>
        <Dropdown label="Source" value={source} options={saleSources} onChange={setSource} />
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <input
              type="text"
              inputMode="decimal"
              placeholder="Price"
              aria-label="Price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={locked}
              className={inputCls}
            />
          </div>
          <div className="min-w-0 flex-1">
            <select
              aria-label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={locked}
              className={`${inputCls} appearance-none [text-align-last:center]`}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 flex-1">
            <input
              type="text"
              inputMode="decimal"
              placeholder="Deposit"
              aria-label="Deposit"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              disabled={locked}
              className={inputCls}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setOption("FULL")}
            disabled={locked}
            className={optionCls(option === "FULL")}
          >
            <span>Net Due</span>
            <span>{formatMoney(netDue, currency)}</span>
          </button>
          <input
            type="text"
            inputMode="numeric"
            aria-label="Number of instalments"
            value={countInput}
            onChange={(e) => setCountInput(e.target.value.replace(/\D/g, ""))}
            disabled={locked}
            className="w-14 shrink-0 rounded-md border border-[#c4c4c4] bg-white px-1 py-3 text-center text-lg text-[#555]"
          />
          <button
            type="button"
            onClick={() => setOption("INSTALMENTS")}
            disabled={locked}
            className={optionCls(option === "INSTALMENTS")}
          >
            <span>Instalments</span>
            <span>
              {perInstalment !== null ? `${formatMoney(perInstalment, currency)} each` : "—"}
            </span>
          </button>
        </div>
        <input
          type="text"
          placeholder="Customer name"
          aria-label="Customer name"
          autoComplete="off"
          value={buyerName}
          onChange={(e) => setBuyerName(e.target.value)}
          disabled={locked}
          className={inputCls}
        />
        <input
          type="email"
          inputMode="email"
          autoCapitalize="off"
          autoComplete="off"
          placeholder="Email"
          aria-label="Email"
          value={buyerEmail}
          onChange={(e) => setBuyerEmail(e.target.value)}
          disabled={locked}
          className={inputCls}
        />
      </section>

      <NoticeLine notice={notice} />

      <div>
        {link && (
          <div className="animate-studio-slide-down pb-4">
            <div className="flex items-center rounded-md border border-[#c4c4c4] bg-white">
              <input
                readOnly
                aria-label="Payment link"
                value={link}
                onFocus={(e) => e.target.select()}
                className="min-w-0 flex-1 truncate bg-transparent px-3 py-3 text-center text-lg text-[#555] outline-none"
              />
              <button
                type="button"
                onClick={shareLink}
                aria-label="Share link"
                className="shrink-0 px-3 py-2 text-[#333]"
              >
                <LinkIcon />
              </button>
            </div>
          </div>
        )}

        <section className={`${panelCls} p-4`}>
          <div className="flex gap-4">
            <StudioButton onClick={getLink} disabled={locked}>
              Get link
            </StudioButton>
            <StudioButton onClick={enterCard} disabled={locked}>
              Enter Card
            </StudioButton>
          </div>
        </section>
      </div>
    </>
  );
}

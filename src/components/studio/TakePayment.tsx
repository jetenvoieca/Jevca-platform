"use client";

import { useState } from "react";
import { createPaymentLink, startCardPayment } from "@/lib/studioApi";
import type { StudioArtworkTile } from "@/lib/studioArtworks";
import { formatMoney, isValidEmail, parsePrice, todayIso } from "@/lib/studioShared";
import type { StudioPaymentDetails } from "@/lib/studioShared";
import CardPayment from "@/components/studio/CardPayment";
import {
  Dropdown,
  inputCls,
  NoticeLine,
  panelCls,
  ReadOnlyField,
  StudioButton,
} from "@/components/studio/StudioUi";
import type { Notice } from "@/components/studio/StudioUi";

// "Take payment": the sale details card — deposit, full payment or
// instalments, and the buyer — then either "Get link" (a payment link for
// the buyer, which slides in above the buttons and can be shared) or
// "Enter Card" (the card panel, CardPayment). Either way the artwork
// becomes Sold - Not Paid; it becomes SOLD once the buyer has paid.

type Card = { purchaseId: string; clientSecret: string; publishableKey: string };

function optionCls(active: boolean) {
  return `flex min-h-20 flex-1 flex-col items-center justify-center rounded-md border-2 bg-white px-2 py-3 text-center text-base text-[#555] ${
    active ? "border-[#5a5a5a]" : "border-[#c4c4c4]"
  }`;
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
  price,
  currency,
  saleSources,
  instalmentCount,
  onDone,
  onBusyChange,
}: {
  token: string;
  artwork: StudioArtworkTile;
  // The price and currency chosen on the sale panel.
  price: string;
  currency: string;
  saleSources: string[];
  instalmentCount: number;
  // Called once the payment is taken — the app returns to its first
  // screen showing this message.
  onDone: (notice: Notice) => void;
  // Lets the app stop the artist leaving while something is being saved.
  onBusyChange: (busy: boolean) => void;
}) {
  const [deposit, setDeposit] = useState("");
  // Shown for the artist's own reference, as in the admin — not saved.
  const [depositDate, setDepositDate] = useState(todayIso());
  const [option, setOption] = useState<StudioPaymentDetails["option"]>("FULL");
  const [source, setSource] = useState("");
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
  // or split into equal instalments.
  const priceAmount = Number(parsePrice(price) || 0);
  const depositAmount = Number(parsePrice(deposit) || 0);
  const remaining = Math.max(priceAmount - depositAmount, 0);
  const perInstalment = remaining / instalmentCount;

  // Checks the form, returning what to send or null (with a message shown).
  const readDetails = (): StudioPaymentDetails | null => {
    const fail = (text: string) => {
      setNotice({ text, tone: "error" });
      return null;
    };

    const priceValue = parsePrice(price);
    if (!priceValue || Number(priceValue) <= 0) return fail("Price is required.");

    const depositValue = parsePrice(deposit);
    if (depositValue === null) return fail("Deposit must be a number, e.g. 100 or 100.50");
    if (depositValue && Number(depositValue) >= Number(priceValue)) {
      return fail("The deposit must be less than the price.");
    }
    if (!buyerName.trim()) return fail("Customer name is required.");
    if (!isValidEmail(buyerEmail.trim())) return fail("A valid email is required.");

    return {
      artworkId: artwork.id,
      price: priceValue,
      currency,
      deposit: depositValue,
      option,
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

  return (
    <>
      <section className={`${panelCls} flex flex-col gap-3 p-4`}>
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <input
              type="text"
              inputMode="decimal"
              placeholder="Deposit"
              aria-label="Deposit"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              disabled={linkCreated}
              className={inputCls}
            />
          </div>
          <div className="min-w-0 flex-1">
            <input
              type="date"
              aria-label="Date"
              value={depositDate}
              onChange={(e) => setDepositDate(e.target.value)}
              disabled={linkCreated}
              className={inputCls}
            />
          </div>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setOption("FULL")}
            disabled={linkCreated}
            className={optionCls(option === "FULL")}
          >
            <span>Full payment</span>
            <span>{formatMoney(remaining, currency)}</span>
          </button>
          <button
            type="button"
            onClick={() => setOption("INSTALMENTS")}
            disabled={linkCreated}
            className={optionCls(option === "INSTALMENTS")}
          >
            <span>{instalmentCount} Instalments</span>
            <span>{formatMoney(perInstalment, currency)} each</span>
          </button>
        </div>
        <ReadOnlyField label="Title / name" value={artwork.title} />
        <Dropdown label="Source" value={source} options={saleSources} onChange={setSource} />
        <input
          type="text"
          placeholder="Customer name"
          aria-label="Customer name"
          autoComplete="off"
          value={buyerName}
          onChange={(e) => setBuyerName(e.target.value)}
          disabled={linkCreated}
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
          disabled={linkCreated}
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
            <StudioButton onClick={enterCard} disabled={working || linkCreated}>
              Enter Card
            </StudioButton>
            <StudioButton onClick={getLink} disabled={working || linkCreated}>
              Get link
            </StudioButton>
          </div>
        </section>
      </div>
    </>
  );
}

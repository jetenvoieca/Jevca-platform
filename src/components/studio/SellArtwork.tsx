"use client";

import { useState } from "react";
import { recordSale } from "@/lib/studioApi";
import type { StudioArtworkTile } from "@/lib/studioArtworks";
import { SALE_CURRENCIES, parsePrice, priceToInput, todayIso } from "@/lib/studioShared";
import {
  Dropdown,
  fieldCls,
  NoticeLine,
  panelCls,
  StudioButton,
} from "@/components/studio/StudioUi";
import type { Notice } from "@/components/studio/StudioUi";

// "Sold": the sale panel for the chosen artwork (its details, with the
// price and currency adjustable), then "Record" — a form to record a sale
// that has already been paid for. Screens follow the design mock-ups:
// sale panel → record form. "Take payment" is a later step.

type Screen = "sale" | "record";

const inputCls = `${fieldCls} text-[#555] placeholder:text-[#8a8a8a]`;

// A box that looks like a field but only shows the artwork's own detail.
function ReadOnlyField({
  label,
  value,
  tall,
}: {
  label: string;
  value: string | null;
  tall?: boolean;
}) {
  return (
    <div
      className={`${fieldCls} ${tall ? "flex min-h-24 items-center justify-center" : ""} ${
        value ? "text-[#555]" : "text-[#8a8a8a]"
      }`}
    >
      {value || label}
    </div>
  );
}

export default function SellArtwork({
  token,
  artwork,
  saleSources,
  defaultCurrency,
  onDone,
  onBusyChange,
}: {
  token: string;
  artwork: StudioArtworkTile;
  saleSources: string[];
  defaultCurrency: string;
  // Called once the sale is recorded — the app returns to its first
  // screen showing this message.
  onDone: (notice: Notice) => void;
  // Lets the app stop the artist leaving while the sale is being saved.
  onBusyChange: (busy: boolean) => void;
}) {
  const [screen, setScreen] = useState<Screen>("sale");
  const [price, setPrice] = useState(priceToInput(artwork.price));
  const [currency, setCurrency] = useState(defaultCurrency);
  const [date, setDate] = useState(todayIso());
  const [source, setSource] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [recording, setRecording] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const go = (next: Screen) => {
    setNotice(null);
    setScreen(next);
  };

  const comingSoon = () => setNotice({ text: "Coming soon", tone: "info" });

  const record = async () => {
    const amount = parsePrice(price);
    if (amount === null) {
      setNotice({ text: "Price must be a number, e.g. 1200 or 1200.50", tone: "error" });
      return;
    }
    if (amount === "" || Number(amount) <= 0) {
      setNotice({ text: "Price is required.", tone: "error" });
      return;
    }
    if (!date) {
      setNotice({ text: "Date is required.", tone: "error" });
      return;
    }
    if (!buyerName.trim()) {
      setNotice({ text: "Customer name is required.", tone: "error" });
      return;
    }

    setRecording(true);
    onBusyChange(true);
    setNotice({ text: "Recording…", tone: "info" });
    try {
      await recordSale(token, {
        artworkId: artwork.id,
        totalAmount: amount,
        currency,
        saleDate: date,
        source,
        buyerName: buyerName.trim(),
        buyerEmail: buyerEmail.trim(),
      });
      onDone({ text: `Sale recorded: ${artwork.title}`, tone: "info" });
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : "Couldn't record the sale. Please try again.",
        tone: "error",
      });
    } finally {
      setRecording(false);
      onBusyChange(false);
    }
  };

  if (screen === "record") {
    return (
      <>
        <section className={`${panelCls} flex flex-col gap-3 p-4`}>
          <div className="flex gap-3">
            <div className="min-w-0 flex-1">
              <input
                type="date"
                aria-label="Date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="min-w-0 flex-1">
              <input
                type="text"
                inputMode="decimal"
                placeholder="Price"
                aria-label="Price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={inputCls}
              />
            </div>
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
            className={inputCls}
          />
        </section>
        <NoticeLine notice={notice} />
        <section className={`${panelCls} p-4`}>
          <div className="flex gap-4">
            <StudioButton onClick={record} disabled={recording}>
              Record Payment
            </StudioButton>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <section className={`${panelCls} flex flex-col gap-3 p-4`}>
        <div className="flex gap-4">
          <div className="w-1/4 shrink-0">
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
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex gap-3">
              <div className="min-w-0 flex-[3]">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Price"
                  aria-label="Price"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="min-w-0 flex-[2]">
                <select
                  aria-label="Currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className={`${inputCls} appearance-none [text-align-last:center]`}
                >
                  {SALE_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <ReadOnlyField label="Size" value={artwork.size} />
          </div>
        </div>
        <ReadOnlyField label="Title / name" value={artwork.title} />
        <ReadOnlyField label="Description" value={artwork.typeMedium} tall />
      </section>
      <NoticeLine notice={notice} />
      <section className={`${panelCls} p-4`}>
        <div className="flex gap-4">
          <StudioButton onClick={() => go("record")}>Record</StudioButton>
          <StudioButton onClick={comingSoon}>Take payment</StudioButton>
        </div>
      </section>
    </>
  );
}

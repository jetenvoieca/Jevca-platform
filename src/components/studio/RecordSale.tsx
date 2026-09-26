"use client";

import { useState } from "react";
import { recordSale } from "@/lib/studioApi";
import type { StudioArtworkTile } from "@/lib/studioArtworks";
import { CURRENCIES } from "@/lib/currencies";
import { parsePrice, todayIso } from "@/lib/studioShared";
import {
  Dropdown,
  inputCls,
  NoticeLine,
  panelCls,
  ReadOnlyField,
  StudioButton,
} from "@/components/studio/StudioUi";
import type { Notice } from "@/components/studio/StudioUi";

// "Sold": records a sale the artist has already been paid for — a form
// to fill in and "Record SALE". A small picture of the work sits beside
// its title as a check that it's the right one. Source is where it sold:
// one of the artist's Locations, starting as the one the work is at now.
// The artwork becomes SOLD.

export default function RecordSale({
  token,
  artwork,
  initialPrice,
  initialCurrency,
  locations,
  paymentMethods,
  onDone,
  onBusyChange,
}: {
  token: string;
  artwork: StudioArtworkTile;
  // The artwork's price and currency to start from; both editable here.
  initialPrice: string;
  initialCurrency: string;
  // The names of the artist's Locations, offered as the Source.
  locations: string[];
  // The artist's own payment types. If they have any, one is required.
  paymentMethods: string[];
  // Called once the sale is recorded — the app returns to its first
  // screen showing this message.
  onDone: (notice: Notice) => void;
  // Lets the app stop the artist leaving while the sale is being saved.
  onBusyChange: (busy: boolean) => void;
}) {
  const [price, setPrice] = useState(initialPrice);
  const [currency, setCurrency] = useState(initialCurrency);
  const [date, setDate] = useState(todayIso());
  const [source, setSource] = useState(
    artwork.location && locations.includes(artwork.location) ? artwork.location : ""
  );
  const [paymentType, setPaymentType] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [recording, setRecording] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

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
    if (paymentMethods.length > 0 && !paymentType) {
      setNotice({ text: "Payment type is required.", tone: "error" });
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
        method: paymentType,
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

  return (
    <>
      <section className={`${panelCls} flex flex-col gap-3 p-4`}>
        <input
          type="date"
          aria-label="Date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={inputCls}
        />
        <div className="flex gap-3">
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
          <div className="min-w-0 flex-1">
            <select
              aria-label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={`${inputCls} appearance-none [text-align-last:center]`}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {artwork.thumbnailUrl ? (
            <img
              src={artwork.thumbnailUrl}
              alt=""
              className="h-14 w-14 shrink-0 rounded-md object-cover"
            />
          ) : (
            <div className="h-14 w-14 shrink-0 rounded-md bg-white" />
          )}
          <div className="min-w-0 flex-1">
            <ReadOnlyField label="Title / name" value={artwork.title} />
          </div>
        </div>
        <Dropdown label="Source" value={source} options={locations} onChange={setSource} />
        <Dropdown
          label="Payment type"
          value={paymentType}
          options={paymentMethods}
          onChange={setPaymentType}
        />
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
            Record SALE
          </StudioButton>
        </div>
      </section>
    </>
  );
}

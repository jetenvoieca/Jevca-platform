"use client";

import { useState } from "react";
import { recordSale } from "@/lib/studioApi";
import type { StudioArtworkTile } from "@/lib/studioArtworks";
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

// "Record": records a sale the artist has already been paid for — a form
// to fill in and "Record Payment". The artwork becomes SOLD.

export default function RecordSale({
  token,
  artwork,
  initialPrice,
  currency,
  saleSources,
  paymentMethods,
  onDone,
  onBusyChange,
}: {
  token: string;
  artwork: StudioArtworkTile;
  // The price shown on the sale panel; still editable here.
  initialPrice: string;
  currency: string;
  saleSources: string[];
  // The artist's own payment types. If they have any, one is required.
  paymentMethods: string[];
  // Called once the sale is recorded — the app returns to its first
  // screen showing this message.
  onDone: (notice: Notice) => void;
  // Lets the app stop the artist leaving while the sale is being saved.
  onBusyChange: (busy: boolean) => void;
}) {
  const [price, setPrice] = useState(initialPrice);
  const [date, setDate] = useState(todayIso());
  const [source, setSource] = useState("");
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
            Record Payment
          </StudioButton>
        </div>
      </section>
    </>
  );
}

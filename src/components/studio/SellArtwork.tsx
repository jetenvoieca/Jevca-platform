"use client";

import { useState } from "react";
import type { StudioArtworkTile } from "@/lib/studioArtworks";
import type { StudioSettings } from "@/lib/studioSettings";
import { parsePrice, priceToInput, SALE_CURRENCIES } from "@/lib/studioShared";
import RecordSale from "@/components/studio/RecordSale";
import TakePayment from "@/components/studio/TakePayment";
import {
  inputCls,
  NoticeLine,
  panelCls,
  ReadOnlyField,
  StudioButton,
} from "@/components/studio/StudioUi";
import type { Notice } from "@/components/studio/StudioUi";

// "Sold": the sale panel for the chosen artwork — its details, with the
// price and currency adjustable — then either "Record" (a sale already
// paid for: RecordSale) or "Take payment" (by card or payment link:
// TakePayment). Screens follow the design mock-ups.

type Screen = "sale" | "record" | "payment";

export default function SellArtwork({
  token,
  artwork,
  settings,
  onDone,
  onBusyChange,
}: {
  token: string;
  artwork: StudioArtworkTile;
  settings: StudioSettings;
  // Called once the sale is done — the app returns to its first screen
  // showing this message.
  onDone: (notice: Notice) => void;
  // Lets the app stop the artist leaving while something is being saved.
  onBusyChange: (busy: boolean) => void;
}) {
  const [screen, setScreen] = useState<Screen>("sale");
  const [price, setPrice] = useState(priceToInput(artwork.price));
  const [currency, setCurrency] = useState(settings.defaultCurrency);
  const [notice, setNotice] = useState<Notice | null>(null);

  const takePayment = () => {
    const amount = parsePrice(price);
    if (amount === null) {
      setNotice({ text: "Price must be a number, e.g. 1200 or 1200.50", tone: "error" });
      return;
    }
    if (amount === "" || Number(amount) <= 0) {
      setNotice({ text: "Enter a price first.", tone: "error" });
      return;
    }
    setNotice(null);
    setScreen("payment");
  };

  if (screen === "record") {
    return (
      <RecordSale
        token={token}
        artwork={artwork}
        initialPrice={price}
        currency={currency}
        saleSources={settings.saleSources}
        paymentMethods={settings.paymentMethods}
        onDone={onDone}
        onBusyChange={onBusyChange}
      />
    );
  }

  if (screen === "payment") {
    return (
      <TakePayment
        token={token}
        artwork={artwork}
        price={price}
        currency={currency}
        saleSources={settings.saleSources}
        instalmentCount={settings.defaultInstalmentCount}
        onDone={onDone}
        onBusyChange={onBusyChange}
      />
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
          <StudioButton onClick={() => setScreen("record")}>Record</StudioButton>
          <StudioButton onClick={takePayment}>Take payment</StudioButton>
        </div>
      </section>
    </>
  );
}

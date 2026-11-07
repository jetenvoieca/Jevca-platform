"use client";

import { useEffect, useRef, useState } from "react";
import { findMarketingPrices, saveMarketingPrices } from "@/lib/actions/marketingContacts";
import {
  CURRENCY_SIGN,
  PRICE_BANDS,
  type MarketingContactRow,
  type MarketingCurrency,
  type MarketingPriceBandFind,
  type MarketingPriceFind,
} from "@/lib/marketingContacts";
import FormModal from "@/components/FormModal";
import { secondaryButtonCls } from "@/components/subscriberFormParts";

// Contacts → Find prices (2026-11-07, Craig's request): for the contacts
// shown that have a shop page or website, looks at what they sell and
// suggests their originals and prints price ranges (findMarketingPrices).
// Each suggestion shows where it came from and the cheapest and dearest
// works counted; a range is ticked when the contact hasn't got one yet.
// Nothing is saved until "Save chosen". Opened from one gallery's tile
// (2026-11-07) it starts looking straight away.

const AT_ONCE = 4;

type Band = (typeof PRICE_BANDS)[number];
const BAND_KEY = { Originals: "originals", Prints: "prints" } as const;
const found = (f: MarketingPriceFind, band: Band): MarketingPriceBandFind | null =>
  f.found ? f[BAND_KEY[band.label]] : null;

const money = (currency: MarketingCurrency, n: number) => `${CURRENCY_SIGN[currency]}${n.toLocaleString("en-GB")}`;
const range = (currency: MarketingCurrency, min: number | null, max: number | null) =>
  min !== null && max !== null
    ? `${money(currency, min)}–${money(currency, max)}`
    : min !== null
      ? `from ${money(currency, min)}`
      : max !== null
        ? `up to ${money(currency, max)}`
        : "";
const hasBand = (c: MarketingContactRow, band: Band) => c[band.min] !== null || c[band.max] !== null;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// A contact's prices with the chosen suggestions in place — or null
// when a range it keeps is in another currency.
function withChosen(c: MarketingContactRow, f: MarketingPriceFind, chosen: Set<string>) {
  if (!f.found) return null;
  const prices = {
    originalsMin: c.originalsMin,
    originalsMax: c.originalsMax,
    printsMin: c.printsMin,
    printsMax: c.printsMax,
    priceCurrency: f.currency,
  };
  for (const band of PRICE_BANDS) {
    const b = found(f, band);
    if (b && chosen.has(band.label)) {
      prices[band.min] = b.min;
      prices[band.max] = b.max;
    } else if (hasBand(c, band) && c.priceCurrency !== f.currency) return null;
  }
  return prices;
}

export default function MarketingPriceFinder({
  contacts,
  startNow = false,
  onSaved,
  onClose,
}: {
  // The contacts to look at — those shown with a shop page or website,
  // or the one whose tile it was opened from.
  contacts: MarketingContactRow[];
  // Look straight away, without the Find prices step.
  startNow?: boolean;
  onSaved: (contact: MarketingContactRow) => void;
  onClose: () => void;
}) {
  const [finds, setFinds] = useState<Record<string, MarketingPriceFind>>({});
  // Each contact's ticked ranges, by band label.
  const [chosen, setChosen] = useState<Record<string, Set<string>>>({});
  const [stage, setStage] = useState<"ready" | "finding" | "found" | "saving" | "saved">("ready");
  const [saveProblems, setSaveProblems] = useState<Record<string, string>>({});
  const [savedCount, setSavedCount] = useState(0);
  const busy = stage === "finding" || stage === "saving";
  const started = useRef(false);

  const find = async () => {
    if (started.current) return;
    started.current = true;
    setStage("finding");
    const queue = [...contacts];
    const work = async () => {
      for (let c = queue.shift(); c; c = queue.shift()) {
        const contact = c;
        let f: MarketingPriceFind;
        try {
          f = await findMarketingPrices(contact.id);
        } catch {
          f = { found: false, reason: "Something went wrong looking." };
        }
        setFinds((old) => ({ ...old, [contact.id]: f }));
        setChosen((old) => ({
          ...old,
          [contact.id]: new Set(PRICE_BANDS.filter((b) => found(f, b) && !hasBand(contact, b)).map((b) => b.label)),
        }));
      }
    };
    await Promise.all(Array.from({ length: AT_ONCE }, work));
    setStage("found");
  };

  useEffect(() => {
    if (startNow) find();
    // Once, when opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (id: string, label: string) =>
    setChosen((old) => {
      const next = new Set(old[id]);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return { ...old, [id]: next };
    });

  // What will be saved: each contact with a range ticked and no
  // currency clash.
  const toSave = contacts.flatMap((c) => {
    const f = finds[c.id];
    const ticked = chosen[c.id];
    if (!f || !ticked?.size) return [];
    const prices = withChosen(c, f, ticked);
    return prices ? [{ contact: c, prices }] : [];
  });

  const save = async () => {
    setStage("saving");
    const problems: Record<string, string> = {};
    let saved = 0;
    for (const { contact, prices } of toSave) {
      const result = await saveMarketingPrices(contact.id, prices);
      if ("error" in result) problems[contact.id] = result.error;
      else {
        onSaved(result.contact);
        saved++;
      }
    }
    setSaveProblems(problems);
    setSavedCount(saved);
    setStage("saved");
  };

  const done = Object.keys(finds).length;

  return (
    <FormModal title="Find prices" busy={busy} onClose={onClose}>
      {stage === "ready" ? (
        <>
          <p className="text-sm text-neutral-500">
            Looks at the shop page — or, without one, the website — of the {plural(contacts.length, "contact")} shown,
            and suggests their originals and prints price ranges. Nothing is saved until you choose.
          </p>
          <button
            type="button"
            onClick={find}
            disabled={contacts.length === 0}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
          >
            Find prices
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-neutral-700">
            {stage === "finding"
              ? `Looking… ${done} of ${contacts.length}`
              : stage === "saving"
                ? "Saving…"
                : stage === "saved"
                  ? `${plural(savedCount, "contact")} saved.`
                  : `Found prices for ${plural(contacts.filter((c) => finds[c.id]?.found).length, "contact")} of ${contacts.length}.`}
          </p>
          <div className="divide-y divide-neutral-100">
            {contacts.map((c) =>
              finds[c.id] ? (
                <FoundRow
                  key={c.id}
                  contact={c}
                  find={finds[c.id]}
                  chosen={chosen[c.id] ?? new Set()}
                  locked={stage !== "found"}
                  problem={saveProblems[c.id]}
                  onToggle={(label) => toggle(c.id, label)}
                />
              ) : null,
            )}
          </div>
          {stage === "found" && (
            <button
              type="button"
              onClick={save}
              disabled={toSave.length === 0}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              Save chosen ({toSave.length})
            </button>
          )}
          {stage === "saved" && (
            <button type="button" onClick={onClose} className={secondaryButtonCls}>
              Done
            </button>
          )}
        </>
      )}
    </FormModal>
  );
}

// One contact's suggestion: each range found, to tick, with what the
// contact has now and the works it came from.
function FoundRow({
  contact: c,
  find: f,
  chosen,
  locked,
  problem,
  onToggle,
}: {
  contact: MarketingContactRow;
  find: MarketingPriceFind;
  chosen: Set<string>;
  locked: boolean;
  problem?: string;
  onToggle: (label: string) => void;
}) {
  const clash = f.found && chosen.size > 0 && withChosen(c, f, chosen) === null;
  return (
    <div className="py-2.5 text-sm">
      <p className="font-medium text-neutral-900">{c.name}</p>
      {!f.found ? (
        <p className="text-xs text-neutral-500">{f.reason}</p>
      ) : (
        <>
          <p className="text-xs text-neutral-500">
            From{" "}
            <a href={f.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              {f.source}
            </a>
            {f.currencyAssumed && ` — no currency shown, taken as ${CURRENCY_SIGN[f.currency]}`}
          </p>
          {PRICE_BANDS.map((band) => {
            const b = found(f, band);
            if (!b) return null;
            const now = c.priceCurrency ? range(c.priceCurrency, c[band.min], c[band.max]) : "";
            return (
              <div key={band.label} className="mt-1">
                <label className="flex items-baseline gap-2 text-neutral-800">
                  <input
                    type="checkbox"
                    checked={chosen.has(band.label)}
                    disabled={locked}
                    onChange={() => onToggle(band.label)}
                  />
                  <span>
                    {band.label}: {range(f.currency, b.min, b.max)}{" "}
                    <span className="text-xs text-neutral-500">
                      ({plural(b.count, "price")}
                      {now && `; now ${now}`})
                    </span>
                  </span>
                </label>
                <div className="ml-5 break-words text-xs text-neutral-500">
                  <p>
                    Cheapest: {b.lowest || "—"} — {money(f.currency, b.min)}
                  </p>
                  <p>
                    Dearest: {b.highest || "—"} — {money(f.currency, b.max)}
                  </p>
                </div>
              </div>
            );
          })}
          {clash && (
            <p className="mt-1 text-xs text-amber-700">
              These prices are in {CURRENCY_SIGN[f.currency]} but the range kept is in{" "}
              {c.priceCurrency && CURRENCY_SIGN[c.priceCurrency]} — tick both to change, or neither.
            </p>
          )}
        </>
      )}
      {problem && <p className="mt-1 text-xs text-red-600">{problem}</p>}
    </div>
  );
}

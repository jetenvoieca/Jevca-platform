"use client";

import {
  ADD_ONS,
  PLAN_LIMITS,
  hasArtManager,
  offeredAddOns,
  monthlyTotalPence,
  priceAddOns,
  type AddOnKey,
  type PlanAddOnPrice,
  type SiteAddOnChoice,
  type SiteAddOnRow,
} from "@/lib/plans";
import { formatMoney } from "@/lib/currencies";

// A plan's add-ons, those the site has ticked (an additional group of
// pages with how many), each with its price, and what the plan and those
// come to a month (2026-11-10 — shared by the admin's Plan card and the
// Artist App's Account). `planPrice`: what the site pays for the plan.
// Add-ons the site has (`kept`) show the price it took them at; others
// the plan's price now. `onChange` gets the add-ons in ADD_ONS order.
// Products (2026-11-13): not an add-on for a product the plan includes;
// Locations / Consignments only with Art Manager (unticking Art Manager
// unticks it).
export default function PlanAddOnsList({
  plan,
  planPrice,
  kept,
  value,
  onChange,
  disabled,
}: {
  plan: {
    currency: string;
    includesWeb: boolean;
    includesArt: boolean;
    includesMarketing: boolean;
    includesConcierge: boolean;
    addOns: PlanAddOnPrice[];
  };
  planPrice: string;
  kept: SiteAddOnRow[];
  value: SiteAddOnChoice[];
  onChange: (addOns: SiteAddOnChoice[]) => void;
  disabled: boolean;
}) {
  const priced = priceAddOns(value, kept, plan.addOns);
  const priceOf = (key: AddOnKey) => priceAddOns([{ addOn: key, quantity: 1 }], kept, plan.addOns)[0].monthlyPrice;
  const quantityOf = (key: AddOnKey) => value.find((a) => a.addOn === key)?.quantity ?? 0;
  const setQuantity = (key: AddOnKey, quantity: number) => {
    const others = value.filter((a) => a.addOn !== key);
    const chosen = quantity > 0 ? [...others, { addOn: key, quantity }] : others;
    const next = hasArtManager(plan, chosen) ? chosen : chosen.filter((a) => a.addOn !== "LOCATIONS");
    onChange(ADD_ONS.flatMap((o) => next.filter((a) => a.addOn === o.key)));
  };

  const shown = offeredAddOns(plan, plan.addOns).filter(
    (a) => a.addOn !== "LOCATIONS" || hasArtManager(plan, value),
  );

  return (
    <>
      {shown.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {shown.map((a) => {
            const option = ADD_ONS.find((o) => o.key === a.addOn)!;
            const quantity = quantityOf(a.addOn);
            return (
              <div key={a.addOn} className="flex items-center gap-2">
                <label className="flex flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={quantity > 0}
                    disabled={disabled}
                    onChange={(e) => setQuantity(a.addOn, e.target.checked ? 1 : 0)}
                  />
                  {option.label}
                </label>
                {option.perItem && quantity > 0 && (
                  <input
                    type="number"
                    min={PLAN_LIMITS.quantity.min}
                    max={PLAN_LIMITS.quantity.max}
                    value={quantity}
                    disabled={disabled}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isInteger(n) && n >= PLAN_LIMITS.quantity.min && n <= PLAN_LIMITS.quantity.max) {
                        setQuantity(a.addOn, n);
                      }
                    }}
                    aria-label={`How many ${option.label.toLowerCase()}`}
                    className="w-14 rounded-md border border-neutral-300 px-2 py-1 text-sm"
                  />
                )}
                <span className="w-20 shrink-0 text-right text-neutral-500">
                  + {formatMoney(priceOf(a.addOn), plan.currency, "when-any")}
                  {option.perItem ? " each" : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <p className="flex justify-between border-t border-neutral-200 pt-2 font-medium">
        <span>A month</span>
        <span>{formatMoney(monthlyTotalPence(planPrice, priced) / 100, plan.currency)}</span>
      </p>
    </>
  );
}

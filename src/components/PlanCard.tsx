"use client";

import { useState, useTransition } from "react";
import { setSiteSubscription } from "@/lib/actions/plans";
import { priceAddOns, toPence, type PlanSummary, type SiteSubscription } from "@/lib/plans";
import PlanAddOnsList from "@/components/PlanAddOnsList";
import { formatMoney } from "@/lib/currencies";

// The site's subscription (2026-11-09, Craig's request — see
// lib/plans.ts), on Administration → Clients: its Plan, the Site Theme it
// uses (one the Plan allows), what it pays for the plan — the plan's price
// when it joined, kept when that changes (2026-11-10), or its own
// (existing customers'; saved when its box is left, blank for the plan's
// price now) — and the add-ons the Plan offers, ticked, each at the price
// the site took it at, and what that comes to a month (PlanAddOnsList).
// Shown only: Stripe is still set by hand (Subscription). Each change
// saves at once.
export default function PlanCard({
  siteId,
  plans,
  themes,
  initial,
  className = "",
}: {
  siteId: string;
  plans: PlanSummary[];
  themes: { id: string; name: string }[];
  initial: SiteSubscription;
  className?: string;
}) {
  const [value, setValue] = useState(initial);
  // The price for the plan as typed, saved when its box is left.
  const [price, setPrice] = useState(initial.planPrice ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const plan = plans.find((p) => p.id === value.planId) ?? null;
  const themeName = new Map(themes.map((t) => [t.id, t.name]));

  const save = (next: SiteSubscription) => {
    const before = value;
    setValue(next);
    setPrice(next.planPrice ?? "");
    setError(null);
    startTransition(async () => {
      const result = await setSiteSubscription(siteId, next);
      if ("error" in result) {
        setError(result.error);
        setValue(before);
        setPrice(before.planPrice ?? "");
      }
    });
  };

  // A new plan starts at its prices, with no add-ons.
  const choosePlan = (planId: string) => {
    const chosen = plans.find((p) => p.id === planId) ?? null;
    save({
      planId: chosen?.id ?? null,
      siteThemeId: chosen?.themeIds[0] ?? null,
      planPrice: chosen?.monthlyPrice ?? null,
      addOns: [],
    });
  };

  const savePrice = () => {
    if (!plan) return;
    const typed = price.trim() || plan.monthlyPrice;
    if (toPence(typed) === null) {
      setError("The price for the plan couldn't be read.");
      return;
    }
    if (typed !== value.planPrice) save({ ...value, planPrice: typed });
    else setPrice(typed);
  };

  const field = "rounded-md border border-neutral-300 px-2 py-1 text-sm";

  return (
    <div className={`rounded-md border border-neutral-200 p-3 ${className}`}>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">Plan</p>
      <div className="flex flex-col gap-3 text-sm text-neutral-800">
        <select value={value.planId ?? ""} onChange={(e) => choosePlan(e.target.value)} disabled={isPending} className={field}>
          <option value="">No plan</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {formatMoney(p.monthlyPrice, p.currency, "when-any")} a month
            </option>
          ))}
        </select>

        {plan && (
          <>
            <label className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-neutral-500">Theme</span>
              <select
                value={value.siteThemeId ?? ""}
                onChange={(e) => save({ ...value, siteThemeId: e.target.value || null })}
                disabled={isPending || plan.themeIds.length === 0}
                className={`${field} min-w-0 flex-1`}
              >
                {plan.themeIds.length === 0 && <option value="">None allowed</option>}
                {plan.themeIds.map((id) => (
                  <option key={id} value={id}>
                    {themeName.get(id) ?? "?"}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center gap-2">
              <span className="flex-1">Price for the plan</span>
              {value.planPrice !== plan.monthlyPrice && (
                <span className="text-xs text-neutral-400">
                  plan now {formatMoney(plan.monthlyPrice, plan.currency, "when-any")}
                </span>
              )}
              <span className="flex items-center gap-1 text-neutral-500">
                {plan.currency}
                <input
                  inputMode="decimal"
                  value={price}
                  disabled={isPending}
                  onChange={(e) => setPrice(e.target.value)}
                  onBlur={savePrice}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  aria-label="Price for the plan"
                  className={`${field} w-20 text-right`}
                />
              </span>
            </div>

            <p className="text-xs text-neutral-500">
              {plan.groupsIncluded} group{plan.groupsIncluded === 1 ? "" : "s"} of up to {plan.pagesPerGroup} pages
              included.
            </p>

            <PlanAddOnsList
              plan={plan}
              planPrice={value.planPrice ?? plan.monthlyPrice}
              kept={value.addOns}
              value={value.addOns}
              onChange={(addOns) => save({ ...value, addOns: priceAddOns(addOns, value.addOns, plan.addOns) })}
              disabled={isPending}
            />
          </>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}

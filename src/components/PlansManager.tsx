"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPlan, deletePlan, setAddOnIncluded, setSignupStripeMode, updatePlan } from "@/lib/actions/plans";
import type { StripeMode } from "@/lib/stripe";
import {
  ADD_ONS,
  NO_PRICES,
  PLAN_CURRENCIES,
  PLAN_LIMITS,
  offeredAddOns,
  type AddOnKey,
  type CurrencyPrices,
  type PlanSummary,
} from "@/lib/plans";
import ConfirmDialog from "@/components/ConfirmDialog";

// Administration → Plans (2026-11-09, Craig's request — see lib/plans.ts):
// the list of plans on the right with New and Delete; the chosen plan on
// the left — its name, monthly price, the groups of pages it includes and
// pages per group, what it includes (one item a line — listed on the
// Artist App's Account), the Site Themes it allows (the default marked)
// and the add-ons it offers, each at its monthly price. Changes save as
// they're made (2026-11-10, Craig — the Save button below the fold was
// missed): ticks, choices and buttons at once, typed boxes when left.
// Sites already on it keep the prices they joined at; a site's
// plan is chosen under Administration → Clients. Above the list: whether
// sign-ups pay in Stripe's Test or Live mode (2026-11-10).

type Draft = Omit<PlanSummary, "id" | "siteCount">;

const draftOf = (p: PlanSummary): Draft => ({
  name: p.name,
  prices: p.prices,
  includesWeb: p.includesWeb,
  includesArt: p.includesArt,
  groupsIncluded: p.groupsIncluded,
  pagesPerGroup: p.pagesPerGroup,
  included: p.included,
  themeIds: p.themeIds,
  addOns: p.addOns,
});

export default function PlansManager({
  plans,
  addOnsIncluded: initialAddOnsIncluded,
  signupMode: initialSignupMode,
  themes,
}: {
  plans: PlanSummary[];
  // What each add-on includes — the same on every plan (2026-11-13).
  addOnsIncluded: Partial<Record<AddOnKey, string>>;
  signupMode: StripeMode;
  themes: { id: string; name: string }[];
}) {
  const [signupMode, setSignupMode] = useState(initialSignupMode);
  const [addOnsIncluded, setAddOnsIncluded] = useState(initialAddOnsIncluded);
  // Saved when its box is left.
  const saveAddOnIncluded = (key: AddOnKey) => {
    setError(null);
    setStatus("saving");
    setAddOnIncluded(key, addOnsIncluded[key] ?? "")
      .then((result) => {
        if ("error" in result) {
          setError(result.error);
          setStatus(null);
        } else setStatus("saved");
      })
      .catch(() => {
        setError("That wasn't saved — please try again.");
        setStatus(null);
      });
  };
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(plans[0]?.id ?? null);
  const selected = plans.find((p) => p.id === selectedId) ?? null;
  const [draft, setDraft] = useState<Draft | null>(selected ? draftOf(selected) : null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"saving" | "saved" | null>(null);
  // Saves run one after another, so an earlier one never lands last.
  const saving = useRef<Promise<void>>(Promise.resolve());
  const [newName, setNewName] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  const select = (plan: PlanSummary) => {
    setSelectedId(plan.id);
    setDraft(draftOf(plan));
    setError(null);
    setStatus(null);
  };

  const save = (next: Draft) => {
    if (!selected) return;
    const id = selected.id;
    setError(null);
    setStatus("saving");
    saving.current = saving.current.then(async () => {
      const result = await updatePlan(id, next).catch(() => ({ error: "That wasn't saved — please try again." }));
      if ("error" in result) {
        setError(result.error);
        setStatus(null);
        return;
      }
      setStatus("saved");
      router.refresh();
    });
  };

  // A change to the plan: saved at once, or for a typed box (`typing`)
  // when it's left (saveTyped).
  const change = (patch: Partial<Draft>, typing = false) => {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    if (typing) setStatus(null);
    else save(next);
  };
  const saveTyped = () => {
    if (draft && status === null) save(draft);
  };

  // Themes: ticked ones allowed; the default is first.
  const toggleTheme = (id: string, on: boolean) =>
    draft && change({ themeIds: on ? [...draft.themeIds, id] : draft.themeIds.filter((t) => t !== id) });
  const makeDefault = (id: string) => draft && change({ themeIds: [id, ...draft.themeIds.filter((t) => t !== id)] });

  // Add-ons: ticked ones offered, at their price in each currency; kept
  // in ADD_ONS order.
  const pricesOf = (key: AddOnKey) => draft?.addOns.find((a) => a.addOn === key)?.prices;
  const setAddOn = (key: AddOnKey, prices: CurrencyPrices | null, typing = false) => {
    if (!draft) return;
    const others = draft.addOns.filter((a) => a.addOn !== key);
    const next = prices === null ? others : [...others, { addOn: key, prices }];
    change({ addOns: ADD_ONS.flatMap((o) => next.filter((a) => a.addOn === o.key)) }, typing);
  };

  const create = () => {
    setError(null);
    startTransition(async () => {
      const result = await createPlan(newName);
      if ("error" in result) return setError(result.error);
      setNewName("");
      setSelectedId(result.id);
      setDraft({
        name: newName.trim(),
        prices: NO_PRICES,
        includesWeb: true,
        includesArt: false,
        groupsIncluded: 1,
        pagesPerGroup: 10,
        included: "",
        themeIds: [],
        addOns: [],
      });
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!selected) return;
    setConfirmingDelete(false);
    setError(null);
    startTransition(async () => {
      const result = await deletePlan(selected.id);
      if ("error" in result) return setError(result.error);
      setSelectedId(null);
      setDraft(null);
      router.refresh();
    });
  };

  const field = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm";

  return (
    <div className="grid h-full grid-cols-[1fr_280px] gap-4 p-4">
      <section className="min-h-0 overflow-y-auto rounded-lg border border-neutral-300 bg-white p-5">
        {!draft || !selected ? (
          <>
            <p className="text-sm text-neutral-400">Choose a plan, or make a new one.</p>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          </>
        ) : (
          <div className="flex max-w-2xl flex-col gap-6">
            <div className="flex h-5 items-center justify-end text-sm">
              {error ? (
                <span className="text-red-600">{error}</span>
              ) : status === "saving" ? (
                <span className="text-neutral-400">Saving…</span>
              ) : status === "saved" ? (
                <span className="text-green-700">Saved</span>
              ) : null}
            </div>
            <div className="grid grid-cols-[190px_1fr] items-center gap-x-3 gap-y-3">
              <label className="text-sm text-neutral-700">Name</label>
              <input
                value={draft.name}
                onChange={(e) => change({ name: e.target.value }, true)}
                onBlur={saveTyped}
                className={field}
              />
              {/* The products (2026-11-13): at least one; the other is
                  offered as an add-on. Groups of pages and themes are
                  the website's — used when Web Manager is in, included
                  or added. */}
              <span className="text-sm text-neutral-700">Includes</span>
              <div className="flex gap-5 text-sm text-neutral-800">
                {(
                  [
                    ["includesWeb", "Web Manager"],
                    ["includesArt", "Art Manager"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draft[key]}
                      disabled={draft[key] && !(key === "includesWeb" ? draft.includesArt : draft.includesWeb)}
                      onChange={(e) =>
                        change({
                          [key]: e.target.checked,
                          addOns: draft.addOns.filter(
                            (a) => a.addOn !== (key === "includesWeb" ? "WEB_MANAGER" : "ART_MANAGER"),
                          ),
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              <label className="text-sm text-neutral-700">Monthly price</label>
              <CurrencyPriceInputs
                prices={draft.prices}
                onChange={(prices) => change({ prices }, true)}
                onBlur={saveTyped}
                label="Monthly price"
              />
              <label className="text-sm text-neutral-700">Groups of pages included</label>
              <input
                type="number"
                min={PLAN_LIMITS.groupsIncluded.min}
                max={PLAN_LIMITS.groupsIncluded.max}
                value={draft.groupsIncluded}
                onChange={(e) => change({ groupsIncluded: Number(e.target.value) }, true)}
                onBlur={saveTyped}
                className={`${field} w-28`}
              />
              <label className="text-sm text-neutral-700">Pages in each group</label>
              <input
                type="number"
                min={PLAN_LIMITS.pagesPerGroup.min}
                max={PLAN_LIMITS.pagesPerGroup.max}
                value={draft.pagesPerGroup}
                onChange={(e) => change({ pagesPerGroup: Number(e.target.value) }, true)}
                onBlur={saveTyped}
                className={`${field} w-28`}
              />
            </div>

            <div>
              <h2 className="mb-1 text-base font-medium text-neutral-900">What&apos;s included</h2>
              <p className="mb-2 text-xs text-neutral-500">One item a line — listed on the Artist App&apos;s Account.</p>
              <textarea
                value={draft.included}
                onChange={(e) => change({ included: e.target.value }, true)}
                onBlur={saveTyped}
                rows={9}
                maxLength={PLAN_LIMITS.included.maxLength}
                className={`${field} w-full`}
              />
            </div>

            <div>
              <h2 className="mb-2 text-base font-medium text-neutral-900">Site Themes</h2>
              {themes.length === 0 && <p className="text-sm text-neutral-400">No Site Themes yet.</p>}
              <div className="flex flex-col gap-2">
                {themes.map((t) => {
                  const on = draft.themeIds.includes(t.id);
                  return (
                    <div key={t.id} className="flex items-center gap-3 text-sm text-neutral-800">
                      <label className="flex flex-1 items-center gap-2">
                        <input type="checkbox" checked={on} onChange={(e) => toggleTheme(t.id, e.target.checked)} />
                        {t.name}
                      </label>
                      {on &&
                        (draft.themeIds[0] === t.id ? (
                          <span className="text-xs text-neutral-500">Default</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => makeDefault(t.id)}
                            className="text-xs text-neutral-400 underline hover:text-neutral-700"
                          >
                            Make default
                          </button>
                        ))}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h2 className="mb-2 text-base font-medium text-neutral-900">Add-ons</h2>
              <div className="flex flex-col gap-2">
                {offeredAddOns(
                  draft,
                  ADD_ONS.map((o) => ({ ...o, addOn: o.key })),
                ).map((o) => {
                  const prices = pricesOf(o.key);
                  return (
                    <div key={o.key} className="flex flex-wrap items-center gap-3 text-sm text-neutral-800">
                      <label className="flex flex-1 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={prices !== undefined}
                          onChange={(e) => setAddOn(o.key, e.target.checked ? NO_PRICES : null)}
                        />
                        {o.label}
                      </label>
                      {prices !== undefined && (
                        <span className="flex items-center gap-2 text-neutral-500">
                          +
                          <CurrencyPriceInputs
                            prices={prices}
                            onChange={(next) => setAddOn(o.key, next, true)}
                            onBlur={saveTyped}
                            label={`${o.label} monthly price`}
                          />
                          {o.perItem ? "each a month" : "a month"}
                        </span>
                      )}
                      {prices !== undefined && (
                        <div className="w-full pl-6">
                          <textarea
                            value={addOnsIncluded[o.key] ?? ""}
                            onChange={(e) => setAddOnsIncluded({ ...addOnsIncluded, [o.key]: e.target.value })}
                            onBlur={() => saveAddOnIncluded(o.key)}
                            rows={3}
                            maxLength={PLAN_LIMITS.included.maxLength}
                            placeholder={`What ${o.label} includes, one item a line — the same on every plan`}
                            aria-label={`What ${o.label} includes`}
                            className={`${field} w-full`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-xs text-neutral-400">
              {selected.siteCount === 0
                ? "No sites on this plan yet."
                : `${selected.siteCount} site${selected.siteCount === 1 ? "" : "s"} on this plan.`}{" "}
              Changes save as you make them. New prices are for new sign-ups — sites already on the plan keep the
              prices they joined at. Unticking an add-on removes it from sites that have it, and unticking a theme
              moves a site using it to the default theme.
            </p>
          </div>
        )}
      </section>

      <aside className="flex min-h-0 flex-col gap-3">
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <span className="flex-1">Sign-ups pay in</span>
          <select
            value={signupMode}
            disabled={isPending}
            onChange={(e) => {
              const mode = e.target.value as StripeMode;
              const before = signupMode;
              setSignupMode(mode);
              setError(null);
              startTransition(async () => {
                const result = await setSignupStripeMode(mode);
                if ("error" in result) {
                  setSignupMode(before);
                  setError(result.error);
                }
              });
            }}
            className={`${field} ${signupMode === "LIVE" ? "border-green-600 text-green-700" : "border-amber-500 text-amber-700"}`}
          >
            <option value="TEST">Stripe Test</option>
            <option value="LIVE">Stripe Live</option>
          </select>
        </label>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New plan name"
            className={`${field} w-full`}
          />
          <button
            type="button"
            onClick={create}
            disabled={!newName.trim() || isPending}
            className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-40"
          >
            New
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto rounded-lg border border-neutral-300 bg-white p-3">
          {plans.length === 0 && <p className="text-sm text-neutral-400">No plans yet.</p>}
          {plans.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => select(p)}
              className={`rounded-md border px-3 py-2 text-left text-sm ${
                p.id === selectedId
                  ? "border-neutral-900 bg-neutral-100 text-neutral-900"
                  : "border-neutral-200 text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              {p.name}
              <span className="ml-2 text-xs text-neutral-400">
                {p.siteCount} site{p.siteCount === 1 ? "" : "s"}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          disabled={!selected || isPending}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-800 hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
        >
          Delete
        </button>
      </aside>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this plan?"
        message={`"${selected?.name ?? ""}" will be deleted. A plan with sites on it can't be deleted.`}
        confirmLabel="Delete plan"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}

// A price box for each currency (2026-11-13: £, € and $).
function CurrencyPriceInputs({
  prices,
  onChange,
  onBlur,
  label,
}: {
  prices: CurrencyPrices;
  onChange: (prices: CurrencyPrices) => void;
  onBlur: () => void;
  label: string;
}) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      {PLAN_CURRENCIES.map((c) => (
        <span key={c} className="flex items-center gap-1 text-neutral-500">
          {c}
          <input
            inputMode="decimal"
            value={prices[c]}
            onChange={(e) => onChange({ ...prices, [c]: e.target.value })}
            onBlur={onBlur}
            aria-label={`${label} in ${c}`}
            className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-800"
          />
        </span>
      ))}
    </span>
  );
}

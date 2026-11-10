"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPlan, deletePlan, setSignupStripeMode, updatePlan } from "@/lib/actions/plans";
import type { StripeMode } from "@/lib/stripe";
import { ADD_ONS, PLAN_LIMITS, type AddOnKey, type PlanSummary } from "@/lib/plans";
import { CURRENCIES } from "@/lib/currencies";
import ConfirmDialog from "@/components/ConfirmDialog";

// Administration → Plans (2026-11-09, Craig's request — see lib/plans.ts):
// the list of plans on the right with New and Delete; the chosen plan on
// the left — its name, monthly price, the groups of pages it includes and
// pages per group, what it includes (one item a line — listed on the
// Artist App's Account), the Site Themes it allows (the default marked)
// and the add-ons it offers, each at its monthly price. Save keeps the
// changes (sites already on it keep the prices they joined at); a site's
// plan is chosen under Administration → Clients. Above the list: whether
// sign-ups pay in Stripe's Test or Live mode (2026-11-10).

type Draft = Omit<PlanSummary, "id" | "siteCount">;

const draftOf = (p: PlanSummary): Draft => ({
  name: p.name,
  monthlyPrice: p.monthlyPrice,
  currency: p.currency,
  groupsIncluded: p.groupsIncluded,
  pagesPerGroup: p.pagesPerGroup,
  included: p.included,
  themeIds: p.themeIds,
  addOns: p.addOns,
});

export default function PlansManager({
  plans,
  signupMode: initialSignupMode,
  themes,
}: {
  plans: PlanSummary[];
  signupMode: StripeMode;
  themes: { id: string; name: string }[];
}) {
  const [signupMode, setSignupMode] = useState(initialSignupMode);
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(plans[0]?.id ?? null);
  const selected = plans.find((p) => p.id === selectedId) ?? null;
  const [draft, setDraft] = useState<Draft | null>(selected ? draftOf(selected) : null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [newName, setNewName] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  const select = (plan: PlanSummary) => {
    setSelectedId(plan.id);
    setDraft(draftOf(plan));
    setError(null);
    setSaved(false);
  };

  const change = (patch: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setSaved(false);
  };

  // Themes: ticked ones allowed; the default is first.
  const toggleTheme = (id: string, on: boolean) =>
    draft && change({ themeIds: on ? [...draft.themeIds, id] : draft.themeIds.filter((t) => t !== id) });
  const makeDefault = (id: string) => draft && change({ themeIds: [id, ...draft.themeIds.filter((t) => t !== id)] });

  // Add-ons: ticked ones offered, at their price; kept in ADD_ONS order.
  const priceOf = (key: AddOnKey) => draft?.addOns.find((a) => a.addOn === key)?.monthlyPrice;
  const setAddOn = (key: AddOnKey, monthlyPrice: string | null) => {
    if (!draft) return;
    const others = draft.addOns.filter((a) => a.addOn !== key);
    const next = monthlyPrice === null ? others : [...others, { addOn: key, monthlyPrice }];
    change({ addOns: ADD_ONS.flatMap((o) => next.filter((a) => a.addOn === o.key)) });
  };

  const save = () => {
    if (!selected || !draft) return;
    setError(null);
    startTransition(async () => {
      const result = await updatePlan(selected.id, draft);
      if ("error" in result) return setError(result.error);
      setSaved(true);
      router.refresh();
    });
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
        monthlyPrice: "0.00",
        currency: "GBP",
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
            <div className="grid grid-cols-[190px_1fr] items-center gap-x-3 gap-y-3">
              <label className="text-sm text-neutral-700">Name</label>
              <input value={draft.name} onChange={(e) => change({ name: e.target.value })} className={field} />
              <label className="text-sm text-neutral-700">Monthly price</label>
              <div className="flex gap-2">
                <select value={draft.currency} onChange={(e) => change({ currency: e.target.value })} className={field}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  inputMode="decimal"
                  value={draft.monthlyPrice}
                  onChange={(e) => change({ monthlyPrice: e.target.value })}
                  className={`${field} w-28`}
                />
              </div>
              <label className="text-sm text-neutral-700">Groups of pages included</label>
              <input
                type="number"
                min={PLAN_LIMITS.groupsIncluded.min}
                max={PLAN_LIMITS.groupsIncluded.max}
                value={draft.groupsIncluded}
                onChange={(e) => change({ groupsIncluded: Number(e.target.value) })}
                className={`${field} w-28`}
              />
              <label className="text-sm text-neutral-700">Pages in each group</label>
              <input
                type="number"
                min={PLAN_LIMITS.pagesPerGroup.min}
                max={PLAN_LIMITS.pagesPerGroup.max}
                value={draft.pagesPerGroup}
                onChange={(e) => change({ pagesPerGroup: Number(e.target.value) })}
                className={`${field} w-28`}
              />
            </div>

            <div>
              <h2 className="mb-1 text-base font-medium text-neutral-900">What&apos;s included</h2>
              <p className="mb-2 text-xs text-neutral-500">One item a line — listed on the Artist App&apos;s Account.</p>
              <textarea
                value={draft.included}
                onChange={(e) => change({ included: e.target.value })}
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
                {ADD_ONS.map((o) => {
                  const price = priceOf(o.key);
                  return (
                    <div key={o.key} className="flex items-center gap-3 text-sm text-neutral-800">
                      <label className="flex flex-1 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={price !== undefined}
                          onChange={(e) => setAddOn(o.key, e.target.checked ? "0.00" : null)}
                        />
                        {o.label}
                      </label>
                      {price !== undefined && (
                        <span className="flex items-center gap-2 text-neutral-500">
                          + {draft.currency}
                          <input
                            inputMode="decimal"
                            value={price}
                            onChange={(e) => setAddOn(o.key, e.target.value)}
                            aria-label={`${o.label} monthly price`}
                            className={`${field} w-24`}
                          />
                          {o.perItem ? "each a month" : "a month"}
                        </span>
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
              New prices are for new sign-ups — sites already on the plan keep the prices they joined at. Saving
              removes add-ons a site has that the plan no longer offers, and moves a site to the default theme if
              its theme is no longer allowed.
            </p>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={save}
                disabled={isPending}
                className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save"}
              </button>
              {saved && <span className="text-sm text-green-700">Saved</span>}
            </div>
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

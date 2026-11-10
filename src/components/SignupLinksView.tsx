"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSignupLink, deleteSignupLink } from "@/lib/actions/signupLinks";
import { ADD_ONS, monthlyTotalPence, type PlanSummary, type SiteAddOnChoice } from "@/lib/plans";
import {
  SIGNUP_LINK_LIMITS,
  SIGNUP_LINK_STATUS_LABEL,
  signupLinkStatus,
  signupLinkUrl,
  type SignupLinkRow,
  type SignupLinkStatus,
} from "@/lib/signupLinks";
import { formatMoney } from "@/lib/currencies";
import PlanAddOnsList from "@/components/PlanAddOnsList";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useBackdropClose } from "@/lib/useBackdropClose";

// Administration → Subscriptions → Sign-up links (2026-11-10, Craig's
// request — see lib/signupLinks.ts): the sign-up links made, newest first — who for, the
// offer and what it comes to a month, when made and until when, where it's
// got to (Not opened, Started, Signed up — with the site made — or
// Expired), Copy link while it can still be used and Delete until signed
// up with. "New sign-up link" makes one: a plan, its theme, the price for
// the plan, add-ons at the plan's prices now, optionally the person's
// name and email, and how many days it lasts — then shows it to copy.

const STATUS_STYLE: Record<SignupLinkStatus, string> = {
  NOT_OPENED: "bg-neutral-100 text-neutral-600",
  OPENED: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-green-100 text-green-800",
  EXPIRED: "bg-neutral-100 text-neutral-400",
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });

export default function SignupLinksView({
  links,
  plans,
  themes,
  now,
}: {
  links: SignupLinkRow[];
  plans: PlanSummary[];
  themes: { id: string; name: string }[];
  // ISO, from the server — so statuses match its view of the time.
  now: string;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SignupLinkRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const nowDate = new Date(now);

  const copy = async (token: string) => {
    await navigator.clipboard.writeText(signupLinkUrl(token));
    setCopied(token);
  };

  const remove = () => {
    if (!deleting) return;
    const id = deleting.id;
    setDeleting(null);
    setError(null);
    startTransition(async () => {
      const result = await deleteSignupLink(id);
      if ("error" in result) setError(result.error);
      router.refresh();
    });
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-end">
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={plans.length === 0}
          className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
        >
          New sign-up link
        </button>
      </div>
      {plans.length === 0 && (
        <p className="mb-4 text-sm text-neutral-500">Make a plan under Templates → Plans first.</p>
      )}
      {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {links.length === 0 ? (
        <p className="text-sm text-neutral-400">No sign-up links yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-400">
              <tr>
                <th className="px-3 py-2 font-medium">For</th>
                <th className="px-3 py-2 font-medium">Offer</th>
                <th className="px-3 py-2 text-right font-medium">A month</th>
                <th className="px-3 py-2 font-medium">Made</th>
                <th className="px-3 py-2 font-medium">Until</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {links.map((l) => {
                const status = signupLinkStatus(l, nowDate);
                const usable = status === "NOT_OPENED" || status === "OPENED";
                return (
                  <tr key={l.id} className="border-b border-neutral-100 align-top last:border-0">
                    <td className="px-3 py-2">
                      <div className="text-neutral-900">{l.name ?? "—"}</div>
                      {l.email && <div className="text-xs text-neutral-500">{l.email}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-neutral-900">
                        {l.planName} <span className="text-neutral-400">· {l.themeName}</span>
                      </div>
                      {l.addOns.length > 0 && (
                        <div className="text-xs text-neutral-500">
                          {l.addOns
                            .map((a) => {
                              const label = ADD_ONS.find((o) => o.key === a.addOn)?.label ?? a.addOn;
                              return a.quantity > 1 ? `${label} × ${a.quantity}` : label;
                            })
                            .join(", ")}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-neutral-900">
                      {formatMoney(monthlyTotalPence(l.planPrice, l.addOns) / 100, l.currency)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-neutral-600">{formatDate(l.createdAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-neutral-600">{formatDate(l.expiresAt)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[status]}`}>
                        {SIGNUP_LINK_STATUS_LABEL[status]}
                      </span>
                      {l.siteId && (
                        <Link href={`/sites/${l.siteId}`} className="mt-1 block text-xs text-neutral-500 underline">
                          {l.siteName}
                        </Link>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {usable && (
                        <button
                          type="button"
                          onClick={() => copy(l.token)}
                          className="mr-3 text-neutral-600 hover:text-neutral-900"
                        >
                          {copied === l.token ? "Copied" : "Copy link"}
                        </button>
                      )}
                      {status !== "COMPLETED" && (
                        <button
                          type="button"
                          onClick={() => setDeleting(l)}
                          disabled={isPending}
                          className="text-neutral-400 hover:text-red-600"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <NewLinkModal
          plans={plans}
          themes={themes}
          onClose={() => setCreating(false)}
          onCreated={() => router.refresh()}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this sign-up link?"
        message="It stops working straight away."
        confirmLabel="Delete link"
        danger
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

// "New sign-up link": the offer, then the link to copy.
function NewLinkModal({
  plans,
  themes,
  onClose,
  onCreated,
}: {
  plans: PlanSummary[];
  themes: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const plan = plans.find((p) => p.id === planId) ?? null;
  const [siteThemeId, setSiteThemeId] = useState(plans[0]?.themeIds[0] ?? "");
  const [planPrice, setPlanPrice] = useState(plans[0]?.monthlyPrice ?? "");
  const [addOns, setAddOns] = useState<SiteAddOnChoice[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [expiryDays, setExpiryDays] = useState<number>(SIGNUP_LINK_LIMITS.expiryDays.default);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const backdrop = useBackdropClose(onClose);
  const themeName = new Map(themes.map((t) => [t.id, t.name]));

  const choosePlan = (id: string) => {
    const chosen = plans.find((p) => p.id === id);
    setPlanId(id);
    setSiteThemeId(chosen?.themeIds[0] ?? "");
    setPlanPrice(chosen?.monthlyPrice ?? "");
    setAddOns([]);
  };

  const create = () => {
    setError(null);
    startTransition(async () => {
      const result = await createSignupLink({ planId, siteThemeId, planPrice, addOns, name, email, expiryDays });
      if ("error" in result) return setError(result.error);
      setToken(result.token);
      onCreated();
    });
  };

  const field = "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm";
  const label = "text-sm text-neutral-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdrop}>
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">New sign-up link</h2>

        {token ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-neutral-600">Send this link. It works once, until it expires.</p>
            <input readOnly value={signupLinkUrl(token)} onFocus={(e) => e.target.select()} className={field} />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(signupLinkUrl(token));
                  setCopied(true);
                }}
                className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
              >
                {copied ? "Copied" : "Copy link"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-50"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-[120px_1fr] items-center gap-x-3 gap-y-3">
              <span className={label}>Plan</span>
              <select value={planId} onChange={(e) => choosePlan(e.target.value)} className={field}>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatMoney(p.monthlyPrice, p.currency, "when-any")} a month
                  </option>
                ))}
              </select>
              {plan && (
                <>
                  <span className={label}>Theme</span>
                  <select
                    value={siteThemeId}
                    onChange={(e) => setSiteThemeId(e.target.value)}
                    disabled={plan.themeIds.length === 0}
                    className={field}
                  >
                    {plan.themeIds.length === 0 && <option value="">None allowed — add one to the plan</option>}
                    {plan.themeIds.map((id) => (
                      <option key={id} value={id}>
                        {themeName.get(id) ?? "?"}
                      </option>
                    ))}
                  </select>
                  <span className={label}>Price for the plan</span>
                  <span className="flex items-center gap-1 text-sm text-neutral-500">
                    {plan.currency}
                    <input
                      inputMode="decimal"
                      value={planPrice}
                      onChange={(e) => setPlanPrice(e.target.value)}
                      className="w-24 rounded-md border border-neutral-300 px-2 py-1.5 text-right text-sm"
                    />
                  </span>
                </>
              )}
            </div>

            {plan && (
              <div className="flex flex-col gap-3 rounded-md border border-neutral-200 p-3 text-sm text-neutral-800">
                <PlanAddOnsList
                  plan={plan}
                  planPrice={planPrice.trim() || plan.monthlyPrice}
                  kept={[]}
                  value={addOns}
                  onChange={setAddOns}
                  disabled={isPending}
                />
              </div>
            )}

            <div className="grid grid-cols-[120px_1fr] items-center gap-x-3 gap-y-3">
              <span className={label}>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" className={field} />
              <span className={label}>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Optional"
                className={field}
              />
              <span className={label}>Lasts</span>
              <span className="flex items-center gap-2 text-sm text-neutral-600">
                <input
                  type="number"
                  min={SIGNUP_LINK_LIMITS.expiryDays.min}
                  max={SIGNUP_LINK_LIMITS.expiryDays.max}
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(Number(e.target.value))}
                  className="w-20 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                />
                days
              </span>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="rounded-md border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={create}
                disabled={isPending || !plan || !siteThemeId}
                className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
              >
                {isPending ? "Making…" : "Make link"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  savePaymentPlan,
  updateReleaseSettings,
  deletePaymentPlan,
  createPaymentLink,
  createCardEntryIntent,
  type PaymentPlanDetail,
} from "@/lib/actions/payments";
import StripeCardForm from "@/components/StripeCardForm";

const CURRENCIES = ["GBP", "EUR"];

function formatMoney(amount: string, currency: string) {
  const n = parseFloat(amount);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);
}

export default function PaymentsPanel({
  artworkId,
  siteId,
  siteDefaultCurrency,
  plan,
  defaults,
}: {
  artworkId: string;
  siteId: string;
  siteDefaultCurrency: string;
  plan: PaymentPlanDetail | null;
  defaults: {
    defaultInstalmentCount: number;
    defaultReleaseMessage: string;
    defaultReleaseTriggerCount: number;
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [cardSecret, setCardSecret] = useState<string | null>(null);
  const [type, setType] = useState<"FULL" | "INSTALMENTS">(plan?.type || "FULL");

  const hasStartedPaying = !!plan && plan.payments.length > 0;
  const paidCount = plan?.payments.filter((p) => p.status === "PAID").length ?? 0;
  const releaseReached =
    !!plan?.releaseTriggerCount && paidCount >= plan.releaseTriggerCount;

  const handleSaveTerms = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      await savePaymentPlan(artworkId, siteId, formData);
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    });
  };

  const handleSaveRelease = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      await updateReleaseSettings(artworkId, siteId, formData);
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    });
  };

  const handleDelete = () => {
    if (!confirm("Remove this payment plan? Only do this if the sale genuinely fell through.")) {
      return;
    }
    startTransition(async () => {
      await deletePaymentPlan(artworkId, siteId);
      router.refresh();
    });
  };

  const handleGetLink = () => {
    setError(null);
    setLinkUrl(null);
    startTransition(async () => {
      const result = await createPaymentLink(artworkId, siteId);
      if (result.ok) {
        setLinkUrl(result.url);
      } else {
        setError(result.error);
      }
    });
  };

  const handleEnterCard = () => {
    setError(null);
    setCardSecret(null);
    startTransition(async () => {
      const result = await createCardEntryIntent(artworkId, siteId);
      if (result.ok) {
        setCardSecret(result.clientSecret);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="space-y-6">
      {!plan || !hasStartedPaying ? (
        <>
          <p className="text-xs text-neutral-400">
            {plan
              ? "Terms can still be changed — no payment has been taken yet."
              : "Set the sale terms, then take the first payment below."}
          </p>
          <form action={handleSaveTerms} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Payment type</label>
              <select
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value as "FULL" | "INSTALMENTS")}
                className="w-full max-w-[calc(50%-0.5rem)] rounded-md border border-neutral-300 px-3 py-2 text-sm"
              >
                <option value="FULL">Full payment</option>
                <option value="INSTALMENTS">Instalments (monthly)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  Total price
                </label>
                <input
                  type="text"
                  name="totalAmount"
                  defaultValue={plan?.totalAmount ?? ""}
                  required
                  placeholder="e.g. 1200.00"
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Currency</label>
                <select
                  name="currency"
                  defaultValue={plan?.currency ?? siteDefaultCurrency}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {type === "INSTALMENTS" && (
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  Number of instalments
                </label>
                <input
                  type="number"
                  name="instalmentCount"
                  min={2}
                  defaultValue={plan?.instalmentCount ?? defaults.defaultInstalmentCount}
                  className="w-full max-w-[calc(50%-0.5rem)] rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-neutral-400">
                  Charged monthly, starting with the first payment taken below.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  Buyer name
                </label>
                <input
                  type="text"
                  name="buyerName"
                  defaultValue={plan?.buyerName ?? ""}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  Buyer email
                </label>
                <input
                  type="email"
                  name="buyerEmail"
                  defaultValue={plan?.buyerEmail ?? ""}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Release message
              </label>
              <textarea
                name="releaseMessage"
                defaultValue={plan?.releaseMessage ?? defaults.defaultReleaseMessage}
                rows={2}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Release after this many payments
              </label>
              <input
                type="number"
                name="releaseTriggerCount"
                min={1}
                defaultValue={plan?.releaseTriggerCount ?? defaults.defaultReleaseTriggerCount}
                className="w-full max-w-[calc(50%-0.5rem)] rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
              >
                Save terms
              </button>
              {saved && <span className="text-sm text-green-600">Saved</span>}
              {plan && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="ml-auto text-sm text-red-600 hover:underline"
                >
                  Remove plan
                </button>
              )}
            </div>
          </form>

          {plan && (
            <div className="rounded-md border border-neutral-200 p-4">
              <h4 className="mb-2 text-sm font-medium text-neutral-700">Take the first payment</h4>
              <p className="mb-3 text-xs text-neutral-400">
                Either option saves the buyer&apos;s card on file, so future instalments (if any)
                can be charged automatically without them needing to be present.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleGetLink}
                  disabled={isPending}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
                >
                  Get payment link
                </button>
                <button
                  type="button"
                  onClick={handleEnterCard}
                  disabled={isPending}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
                >
                  Enter card now
                </button>
              </div>

              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

              {linkUrl && (
                <div className="mt-3 rounded-md bg-neutral-50 p-3">
                  <p className="mb-1 text-xs text-neutral-500">
                    Send this link to the buyer (copy and paste — nothing is emailed
                    automatically):
                  </p>
                  <input
                    readOnly
                    value={linkUrl}
                    onFocus={(e) => e.target.select()}
                    className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs"
                  />
                </div>
              )}

              {cardSecret && (
                <div className="mt-3">
                  <StripeCardForm
                    clientSecret={cardSecret}
                    onDone={() => {
                      setCardSecret(null);
                      router.refresh();
                    }}
                  />
                  <p className="mt-2 text-xs text-neutral-400">
                    Status below updates within a few seconds of Stripe confirming the charge.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="rounded-md border border-neutral-200 p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h4 className="text-sm font-medium text-neutral-700">
                {plan.type === "FULL" ? "Full payment" : `${plan.instalmentCount} instalments`}
              </h4>
              <span className="text-sm text-neutral-900">
                {formatMoney(plan.totalAmount, plan.currency)}
              </span>
            </div>
            {plan.buyerName && (
              <p className="mb-3 text-xs text-neutral-500">
                {plan.buyerName}
                {plan.buyerEmail ? ` · ${plan.buyerEmail}` : ""}
              </p>
            )}

            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-400">
                  <th className="pb-1 font-normal">#</th>
                  <th className="pb-1 font-normal">Amount</th>
                  <th className="pb-1 font-normal">Status</th>
                  <th className="pb-1 font-normal">Date</th>
                </tr>
              </thead>
              <tbody>
                {plan.payments.map((p) => (
                  <tr key={p.id} className="border-t border-neutral-100">
                    <td className="py-1.5 text-neutral-500">{p.sequence}</td>
                    <td className="py-1.5">{formatMoney(p.amount, p.currency)}</td>
                    <td className="py-1.5">
                      <span
                        className={
                          p.status === "PAID"
                            ? "text-green-600"
                            : p.status === "FAILED"
                              ? "text-red-600"
                              : "text-neutral-500"
                        }
                      >
                        {p.status === "PAID" ? "Paid" : p.status === "FAILED" ? "Failed" : "Due"}
                      </span>
                    </td>
                    <td className="py-1.5 text-neutral-500">
                      {p.paidDate
                        ? new Date(p.paidDate).toLocaleDateString()
                        : p.dueDate
                          ? new Date(p.dueDate).toLocaleDateString()
                          : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {plan.type === "INSTALMENTS" && (
              <p className="mt-3 text-xs text-neutral-400">
                Remaining instalments are charged automatically by Stripe against the card saved
                at the first payment.
              </p>
            )}
          </div>

          <form action={handleSaveRelease} className="space-y-3 rounded-md border border-neutral-200 p-4">
            <h4 className="text-sm font-medium text-neutral-700">Release message</h4>
            {releaseReached && (
              <p className="rounded bg-green-50 px-2 py-1 text-xs text-green-700">
                Trigger reached — this message now applies.
              </p>
            )}
            <textarea
              name="releaseMessage"
              defaultValue={plan.releaseMessage ?? ""}
              rows={2}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Release after this many payments
              </label>
              <input
                type="number"
                name="releaseTriggerCount"
                min={1}
                defaultValue={plan.releaseTriggerCount ?? ""}
                className="w-full max-w-[calc(50%-0.5rem)] rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
              >
                Save
              </button>
              {saved && <span className="text-sm text-green-600">Saved</span>}
            </div>
          </form>
        </>
      )}
    </div>
  );
}

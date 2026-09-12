"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateArtist } from "@/lib/actions";
import { toArtistFormFields, buildArtistFormData, type ArtistRecord } from "@/lib/clientPanelTypes";
import {
  updateArtistPaymentMethod,
  updateStripeSubscriptionCustomerId,
  addManualSubscriptionPayment,
  deleteManualSubscriptionPayment,
} from "@/lib/actions/subscriptions";

const labelCls = "mb-1 block text-xs text-neutral-500";
const inputCls =
  "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm disabled:opacity-50";
const cardCls = "rounded-lg border border-neutral-200 bg-white p-4";
const cardTitleCls = "mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500";

type SubscriptionPaymentRow = {
  id: string;
  source: "STRIPE" | "MANUAL";
  amount: string;
  currency: string;
  paidAt: string; // ISO date, yyyy-mm-dd
};

// Current rate / Payment method / Stripe Customer ID / payment history —
// split out of the old SiteSettingsPanel (2026-09-12), same reasoning as
// OwnerCard/DomainCard. The payment-method, Stripe-customer-id, and
// manual-payment actions were already their own independent server
// actions (not part of the resubmit-everything updateArtist form), so
// only the "Current rate" field needs buildArtistFormData here.
export default function SubscriptionCard({
  artist,
  siteId,
  defaultCurrency,
  subscriptionPayments,
  className = "",
}: {
  artist: ArtistRecord;
  siteId: string;
  defaultCurrency: string;
  subscriptionPayments: SubscriptionPaymentRow[];
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [savedField, setSavedField] = useState<"subscriptionAmount" | "stripeId" | null>(null);
  const [addingPayment, setAddingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const router = useRouter();

  const flash = (field: "subscriptionAmount" | "stripeId") => {
    setSavedField(field);
    setTimeout(() => setSavedField(null), 1500);
  };

  const saveSubscriptionAmount = (value: string) => {
    const fd = buildArtistFormData(toArtistFormFields(artist), { subscriptionAmount: value });
    startTransition(async () => {
      await updateArtist(artist.id, fd);
      router.refresh();
      flash("subscriptionAmount");
    });
  };

  const handlePaymentMethodChange = (value: "" | "Stripe" | "PayPal" | "DD") => {
    startTransition(async () => {
      await updateArtistPaymentMethod(artist.id, siteId, value);
      router.refresh();
    });
  };

  const handleStripeCustomerIdBlur = (value: string) => {
    startTransition(async () => {
      await updateStripeSubscriptionCustomerId(artist.id, siteId, value);
      router.refresh();
      flash("stripeId");
    });
  };

  const handleAddPayment = async (formData: FormData) => {
    setPaymentError(null);
    const result = await addManualSubscriptionPayment(artist.id, siteId, formData);
    if (!result.ok) {
      setPaymentError(result.error);
      return;
    }
    setAddingPayment(false);
    router.refresh();
  };

  const handleDeletePayment = (id: string) => {
    if (!confirm("Delete this payment record? This can't be undone.")) return;
    startTransition(async () => {
      await deleteManualSubscriptionPayment(id, siteId);
      router.refresh();
    });
  };

  const subscriptionTotal = subscriptionPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);

  return (
    <div className={`${cardCls} ${className}`}>
      <p className={cardTitleCls}>Subscription</p>

      <label className={labelCls}>Current rate (informational)</label>
      <div className="mb-3 flex items-center gap-1">
        <span className="text-sm text-neutral-400">£</span>
        <input
          key={`owner-subscription-${artist.id}`}
          type="text"
          inputMode="decimal"
          defaultValue={artist.subscriptionAmount}
          onBlur={(e) => saveSubscriptionAmount(e.target.value.trim())}
          disabled={isPending}
          placeholder="e.g. 9.95"
          className={inputCls}
        />
      </div>

      <label className={labelCls}>Payment method</label>
      <select
        key={`owner-payment-${artist.id}`}
        defaultValue={artist.paymentMethod || ""}
        onChange={(e) => handlePaymentMethodChange(e.target.value as "" | "Stripe" | "PayPal" | "DD")}
        disabled={isPending}
        className={`${inputCls} mb-3`}
      >
        <option value="">—</option>
        <option value="Stripe">Stripe</option>
        <option value="PayPal">PayPal</option>
        <option value="DD">Direct Debit</option>
      </select>
      {(savedField === "subscriptionAmount" || savedField === "stripeId") && (
        <p className="mb-3 text-xs text-green-600">Saved</p>
      )}

      {artist.paymentMethod === "Stripe" && (
        <div className="mb-3 rounded-md border border-neutral-200 p-2.5">
          <label className={labelCls}>Stripe Customer ID</label>
          <input
            key={`stripe-customer-id-${artist.id}`}
            type="text"
            defaultValue={artist.stripeSubscriptionCustomerId || ""}
            onBlur={(e) => handleStripeCustomerIdBlur(e.target.value.trim())}
            disabled={isPending}
            placeholder="cus_…"
            className={`${inputCls} font-mono`}
          />
          <p className="mt-1 text-xs text-neutral-400">
            From the platform Stripe account (separate from this artist&apos;s own Stripe Mode) —
            paste it in once to link this artist to their subscription.
          </p>
          {artist.stripeSubscriptionStatus && (
            <p className="mt-2 text-xs">
              Status: <span className="font-medium">{artist.stripeSubscriptionStatus}</span>
            </p>
          )}
          {!artist.stripeSubscriptionCustomerId && (
            <p className="mt-2 text-xs text-amber-700">
              Not linked yet — payments won&apos;t appear below until this is set.
            </p>
          )}
        </div>
      )}

      {artist.paymentMethod === "Stripe" ? (
        <p className="mb-2 text-xs text-neutral-400">
          Payments sync here automatically from Stripe once webhook syncing is switched on.
        </p>
      ) : (
        (artist.paymentMethod === "PayPal" || artist.paymentMethod === "DD") && (
          <div className="mb-2">
            {addingPayment ? (
              <form
                action={handleAddPayment}
                className="mb-2 flex flex-col gap-1.5 rounded-md border border-neutral-200 p-2"
              >
                <div className="flex gap-1.5">
                  <input
                    type="date"
                    name="paidAt"
                    required
                    className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs"
                  />
                  <input
                    type="text"
                    name="amount"
                    inputMode="decimal"
                    required
                    placeholder="Amount"
                    className="w-24 rounded border border-neutral-300 px-2 py-1 text-xs"
                  />
                  <input type="hidden" name="currency" value={defaultCurrency} />
                </div>
                {paymentError && <p className="text-xs text-red-600">{paymentError}</p>}
                <div className="flex gap-1">
                  <button
                    type="submit"
                    className="flex-1 rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white hover:bg-neutral-700"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddingPayment(false);
                      setPaymentError(null);
                    }}
                    className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAddingPayment(true)}
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
              >
                + Add payment
              </button>
            )}
          </div>
        )
      )}

      {artist.paymentMethod && (
        <div className="overflow-hidden rounded-md border border-neutral-200">
          <table className="w-full text-xs">
            <thead className="bg-neutral-50 text-left text-neutral-400">
              <tr>
                <th className="px-2 py-1.5 font-medium">Date</th>
                <th className="px-2 py-1.5 font-medium">Amount</th>
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {subscriptionPayments.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-2 py-3 text-center text-neutral-400">
                    No payments recorded yet.
                  </td>
                </tr>
              ) : (
                subscriptionPayments.map((p) => (
                  <tr key={p.id} className="border-t border-neutral-100">
                    <td className="px-2 py-1.5">{new Date(p.paidAt).toLocaleDateString()}</td>
                    <td className="px-2 py-1.5">
                      {p.currency} {parseFloat(p.amount).toFixed(2)}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {p.source === "MANUAL" ? (
                        <button
                          type="button"
                          onClick={() => handleDeletePayment(p.id)}
                          className="text-neutral-400 hover:text-red-600"
                        >
                          Delete
                        </button>
                      ) : (
                        <span className="text-neutral-300">Stripe</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {subscriptionPayments.length > 0 && (
              <tfoot>
                <tr className="border-t border-neutral-200 bg-neutral-50 font-medium">
                  <td className="px-2 py-1.5">Total</td>
                  <td className="px-2 py-1.5" colSpan={2}>
                    {subscriptionPayments[0]?.currency || defaultCurrency} {subscriptionTotal.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

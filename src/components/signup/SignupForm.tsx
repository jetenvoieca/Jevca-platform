"use client";

import { useState, useTransition } from "react";
import { startSignupCheckout } from "@/lib/actions/signup";
import { ADD_ONS, monthlyTotalPence } from "@/lib/plans";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwordRules";
import { formatMoney } from "@/lib/currencies";
import type { SignupOffer } from "@/lib/signupRecords";
import PasswordInput from "@/components/PasswordInput";

// The sign-up page's offer and form (2026-11-10): the plan, what it
// includes, each line's price and the monthly total; then name, email
// (filled in when the link has them), phone and a password chosen twice;
// "Continue to payment" goes to Stripe.
export default function SignupForm({ token, offer }: { token: string; offer: SignupOffer }) {
  const [name, setName] = useState(offer.name ?? "");
  const [email, setEmail] = useState(offer.email ?? "");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const money = (amount: string | number) => formatMoney(amount, offer.currency);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== again) return setError("The two passwords aren't the same.");
    startTransition(async () => {
      const result = await startSignupCheckout(token, { name, email, phone, password }).catch(() => ({
        error: "Something went wrong — please try again.",
      }));
      if ("error" in result) return setError(result.error);
      window.location.href = result.url;
    });
  };

  const field = "w-full rounded-[4px] border border-neutral-300 px-3 py-2 text-neutral-900";

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-lg border border-neutral-300 p-5">
        <h2 className="mb-3 text-lg text-neutral-900">Plan : {offer.planName}</h2>
        {offer.included.length > 0 && (
          <ul className="mb-5 flex flex-col gap-0.5 pl-6 text-neutral-700">
            {offer.included.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-1.5 text-sm text-neutral-800">
          <p className="flex justify-between">
            <span>{offer.planName}</span>
            <span>{money(offer.planPrice)}</span>
          </p>
          {offer.addOns.map((a) => {
            const label = ADD_ONS.find((o) => o.key === a.addOn)?.label ?? a.addOn;
            return (
              <p key={a.addOn} className="flex justify-between">
                <span>
                  + {label}
                  {a.quantity > 1 ? ` × ${a.quantity}` : ""}
                </span>
                <span>{money((Number(a.monthlyPrice) * a.quantity).toFixed(2))}</span>
              </p>
            );
          })}
          <p className="mt-1 flex justify-between border-t border-neutral-200 pt-2 text-base font-medium">
            <span>A month</span>
            <span>{money(monthlyTotalPence(offer.planPrice, offer.addOns) / 100)}</span>
          </p>
          <p className="text-xs text-neutral-500">Paid today, then each month.</p>
        </div>
      </section>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Email — you&apos;ll log in with this
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Phone (optional)
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Choose a password — at least {MIN_PASSWORD_LENGTH} characters
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          The password again
          <PasswordInput
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            required
            autoComplete="new-password"
            className={field}
          />
        </label>

        {error && <p className="rounded-[4px] bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="mt-2 rounded-[4px] bg-neutral-900 px-6 py-3 text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {isPending ? "Opening payment…" : "Continue to payment"}
        </button>
        <p className="text-xs text-neutral-500">Payment is taken securely by Stripe.</p>
      </form>
    </div>
  );
}

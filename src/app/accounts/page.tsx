import Link from "next/link";
import AppShell from "@/components/AppShell";
import { db } from "@/lib/db";
import { getOpenAlerts } from "@/lib/alerts";
import { buildTopNavItems } from "@/lib/topNav";
import { getRecentSites } from "@/lib/recentSites";
import AccountsBackfillButton from "@/components/AccountsBackfillButton";
import AccountsPeriodView from "@/components/AccountsPeriodView";
import SignupLinksView from "@/components/SignupLinksView";
import { listSignupLinks } from "@/lib/actions/signupLinks";
import { listPlans } from "@/lib/actions/plans";
import { listSiteThemes } from "@/lib/actions/siteThemes";

export const dynamic = "force-dynamic";

type MonthGroup = {
  key: string; // "2026-08"
  label: string; // "August 2026"
  totalsByCurrency: Record<string, number>;
  rows: {
    artistName: string;
    amount: number;
    currency: string;
    paidAt: Date;
    source: string;
    paymentMethod: string | null;
  }[];
};

// Renamed from "Accounts" to "Subscriptions" (2026-08-28) — "Accounts" is
// now the section header in the nav grouping this page alongside
// Expenses, Account, and Consolidated Sales; this page itself is
// specifically the subscription-revenue view. Business Expenses, which
// used to be embedded below this content, now lives on its own page at
// /accounts/expenses.
//
// Two tabs (2026-11-10, Craig — to keep the menu short): Payments, the
// subscription money coming in, and Sign-up links, how new subscriptions
// start (SignupLinksView).
export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const signups = tab === "signups";
  const [openAlerts, recentSites] = await Promise.all([getOpenAlerts(), getRecentSites()]);

  return (
    <AppShell
      navItems={buildTopNavItems("subscriptions", openAlerts.length, recentSites)}
      content={
        <div className={`mx-auto px-6 py-6 ${signups ? "max-w-5xl" : "max-w-3xl"}`}>
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-neutral-900">Subscriptions</h1>
            <Link
              href="/accounts/sales"
              className="text-sm text-neutral-500 underline-offset-2 hover:underline"
            >
              Consolidated Sales →
            </Link>
          </div>
          <nav className="mb-6 flex gap-6 border-b border-neutral-200 text-sm">
            {[
              { label: "Payments", href: "/accounts", on: !signups },
              { label: "Sign-up links", href: "/accounts?tab=signups", on: signups },
            ].map((t) => (
              <Link
                key={t.label}
                href={t.href}
                className={`-mb-px border-b-2 pb-2 ${
                  t.on ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-800"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          {signups ? await signupLinksTab() : await paymentsTab()}
        </div>
      }
    />
  );
}

async function signupLinksTab() {
  const [links, plans, themes] = await Promise.all([listSignupLinks(), listPlans(), listSiteThemes()]);
  return (
    <SignupLinksView
      links={links}
      plans={plans}
      themes={themes.map((t) => ({ id: t.id, name: t.name }))}
      now={new Date().toISOString()}
    />
  );
}

async function paymentsTab() {
  const payments = await db.subscriptionPayment.findMany({
    include: { artist: { select: { name: true, paymentMethod: true } } },
    orderBy: { paidAt: "desc" },
  });
  const months = new Map<string, MonthGroup>();
  for (const p of payments) {
    // 2026-08-19 — a payment with an invalid paidAt won't crash this page
    // the way it did the site-detail page (toLocaleDateString doesn't
    // throw the way toISOString does), but without this it'd silently
    // group under a nonsense "NaN-NaN" key labelled "Invalid Date" —
    // confusing to land on, and it'd never show under any Q1–Q4/This
    // Year filter either way. Skipped here instead; the row itself still
    // exists and shows up fine on the site's own Settings page (that
    // page's own crash is what's actually fixed, in siteDetailPage.tsx),
    // where it can be deleted like any other manual entry.
    if (Number.isNaN(p.paidAt.getTime())) continue;

    const key = `${p.paidAt.getFullYear()}-${String(p.paidAt.getMonth() + 1).padStart(2, "0")}`;
    if (!months.has(key)) {
      months.set(key, {
        key,
        label: p.paidAt.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
        totalsByCurrency: {},
        rows: [],
      });
    }
    const group = months.get(key)!;
    const amount = parseFloat(p.amount.toString());
    group.totalsByCurrency[p.currency] = (group.totalsByCurrency[p.currency] || 0) + amount;
    group.rows.push({
      artistName: p.artist.name,
      amount,
      currency: p.currency,
      paidAt: p.paidAt,
      source: p.source,
      paymentMethod: p.artist.paymentMethod,
    });
  }
  const sortedMonths = Array.from(months.values()).sort((a, b) => (a.key < b.key ? 1 : -1));

  // Passed to the client component rather than letting it call `new
  // Date()` itself — keeps "This Year"/Q1–Q4 tied to the server's clock.
  const currentYear = new Date().getFullYear();

  return (
    <>
      <p className="mb-6 text-sm text-neutral-500">
        Subscription revenue by month — artists and brands paying us. Stripe and manually-entered
        payments together. Totals are kept separate per currency rather than combined, since
        converting between them isn&apos;t something to do silently. For artists&apos; and
        brands&apos; own sales to their buyers, see Consolidated Sales — for your own business costs, see
        Expenses.
      </p>

      <AccountsBackfillButton />

      {sortedMonths.length === 0 ? (
        <p className="text-sm text-neutral-500">No subscription payments recorded yet.</p>
      ) : (
        <AccountsPeriodView sortedMonths={sortedMonths} currentYear={currentYear} />
      )}
    </>
  );
}

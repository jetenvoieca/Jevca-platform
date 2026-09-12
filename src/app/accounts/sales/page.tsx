import Link from "next/link";
import AppShell from "@/components/AppShell";
import { db } from "@/lib/db";
import { getOpenAlerts } from "@/lib/alerts";
import { buildTopNavItems } from "@/lib/topNav";
import ConsolidatedSalesView, {
  type ConsolidatedMonthGroup,
} from "@/components/ConsolidatedSalesView";

export const dynamic = "force-dynamic";

export default async function ConsolidatedSalesPage() {
  const [purchases, openAlerts] = await Promise.all([
    // Abandoned sales excluded — they never happened, so they'd distort
    // both the monthly totals and the "how much did we actually sell"
    // question this page exists to answer. Every artist's own Sales page
    // (which does show Abandoned) remains the place for that detail.
    db.purchase.findMany({
      where: { status: { not: "ABANDONED" } },
      select: {
        id: true,
        totalAmount: true,
        commissionPercent: true,
        currency: true,
        status: true,
        buyerName: true,
        createdAt: true,
        // Added 2026-09-12 so this list's own Status column can use the
        // same shared SaleStatusBadge as everywhere else, showing
        // "Invoice sent" instead of "UNPAID" once one's gone out.
        invoiceEmailedAt: true,
        artwork: {
          select: {
            id: true,
            presentationTitle: true,
            artist: {
              select: {
                id: true,
                name: true,
                sites: { select: { id: true }, where: { status: { not: "ARCHIVED" } }, take: 1 },
              },
            },
          },
        },
      },
      relationLoadStrategy: "query",
      orderBy: { createdAt: "desc" },
    }),
    getOpenAlerts(),
  ]);

  const months = new Map<string, ConsolidatedMonthGroup>();
  for (const p of purchases) {
    const key = `${p.createdAt.getFullYear()}-${String(p.createdAt.getMonth() + 1).padStart(2, "0")}`;
    if (!months.has(key)) {
      months.set(key, {
        key,
        label: p.createdAt.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
        totalsByCurrency: {},
        rows: [],
      });
    }
    const group = months.get(key)!;
    const grossAmount = parseFloat(p.totalAmount.toString());
    // Gallery-channel sales carry a commission taken off the top — the
    // net (what the artist actually receives) is what should count as
    // "the sale value" here, same convention already used on the
    // per-sale detail card. Direct (Stripe) sales have no commission, so
    // gross and net are the same for them.
    const commissionPercent = p.commissionPercent ? parseFloat(p.commissionPercent.toString()) : null;
    const netAmount = commissionPercent ? grossAmount * (1 - commissionPercent / 100) : grossAmount;
    group.totalsByCurrency[p.currency] = (group.totalsByCurrency[p.currency] || 0) + netAmount;
    group.rows.push({
      purchaseId: p.id,
      artworkId: p.artwork.id,
      artistId: p.artwork.artist.id,
      siteId: p.artwork.artist.sites[0]?.id || null,
      artistName: p.artwork.artist.name,
      artworkTitle: p.artwork.presentationTitle,
      buyerName: p.buyerName,
      grossAmount,
      netAmount,
      commissionPercent,
      currency: p.currency,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
      invoiceEmailedAt: p.invoiceEmailedAt ? p.invoiceEmailedAt.toISOString() : null,
    });
  }
  const sortedMonths = Array.from(months.values()).sort((a, b) => (a.key < b.key ? 1 : -1));

  const grandTotalsByCurrency: Record<string, number> = {};
  for (const g of sortedMonths) {
    for (const [currency, total] of Object.entries(g.totalsByCurrency)) {
      grandTotalsByCurrency[currency] = (grandTotalsByCurrency[currency] || 0) + total;
    }
  }

  return (
    <AppShell
      publishEnabled={false}
      navItems={buildTopNavItems("sales", openAlerts.length)}
      content={
        // max-w-5xl, up from max-w-4xl (2026-09-12) — the Status column's
        // "Invoice sent" was wrapping onto two lines at the old width.
        <div className="mx-auto max-w-5xl px-6 py-6">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-neutral-900">Consolidated Sales</h1>
            <Link
              href="/accounts"
              className="text-sm text-neutral-500 underline-offset-2 hover:underline"
            >
              ← Accounts
            </Link>
          </div>

          {sortedMonths.length === 0 ? (
            <p className="text-sm text-neutral-500">No sales recorded yet.</p>
          ) : (
            <>
              <div className="mb-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  All-time total (net of commission)
                </p>
                <p className="text-lg font-semibold text-neutral-900">
                  {Object.entries(grandTotalsByCurrency)
                    .map(([currency, total]) => `${currency} ${total.toFixed(2)}`)
                    .join("  ·  ")}
                </p>
              </div>

              <ConsolidatedSalesView months={sortedMonths} />
            </>
          )}
        </div>
      }
    />
  );
}

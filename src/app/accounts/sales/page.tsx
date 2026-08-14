import Link from "next/link";
import AppShell from "@/components/AppShell";
import { db } from "@/lib/db";
import { getOpenAlerts } from "@/lib/alerts";
import { buildTopNavItems } from "@/lib/topNav";

export const dynamic = "force-dynamic";

type SaleRow = {
  siteId: string | null;
  artistName: string;
  artworkTitle: string;
  buyerName: string | null;
  amount: number;
  currency: string;
  status: "ACTIVE" | "COMPLETED" | "ABANDONED";
  createdAt: Date;
};

type MonthGroup = {
  key: string;
  label: string;
  totalsByCurrency: Record<string, number>;
  rows: SaleRow[];
};

const STATUS_STYLE: Record<SaleRow["status"], string> = {
  COMPLETED: "text-green-600",
  ABANDONED: "text-neutral-400",
  ACTIVE: "text-amber-600",
};

export default async function ConsolidatedSalesPage() {
  const [purchases, openAlerts] = await Promise.all([
    // Abandoned sales excluded — they never happened, so they'd distort
    // both the monthly totals and the "how much did we actually sell"
    // question this page exists to answer. Every artist's own Sales page
    // (which does show Abandoned) remains the place for that detail.
    db.purchase.findMany({
      where: { status: { not: "ABANDONED" } },
      select: {
        totalAmount: true,
        currency: true,
        status: true,
        buyerName: true,
        createdAt: true,
        artwork: {
          select: {
            presentationTitle: true,
            artist: {
              select: {
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

  const months = new Map<string, MonthGroup>();
  for (const p of purchases) {
    const key = `${p.createdAt.getFullYear()}-${String(p.createdAt.getMonth() + 1).padStart(2, "0")}`;
    if (!months.has(key)) {
      months.set(key, {
        key,
        label: p.createdAt.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
        totalsByCurrency: {},
        rows: [],
      });
    }
    const group = months.get(key)!;
    const amount = parseFloat(p.totalAmount.toString());
    group.totalsByCurrency[p.currency] = (group.totalsByCurrency[p.currency] || 0) + amount;
    group.rows.push({
      siteId: p.artwork.artist.sites[0]?.id || null,
      artistName: p.artwork.artist.name,
      artworkTitle: p.artwork.presentationTitle,
      buyerName: p.buyerName,
      amount,
      currency: p.currency,
      status: p.status,
      createdAt: p.createdAt,
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
        <div className="mx-auto max-w-4xl px-6 py-6">
          <div className="mb-1 flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-neutral-900">Consolidated Sales</h1>
            <Link
              href="/accounts"
              className="text-sm text-neutral-500 underline-offset-2 hover:underline"
            >
              ← Accounts
            </Link>
          </div>
          <p className="mb-6 text-sm text-neutral-500">
            Every artist&apos;s sales to their own buyers, in one place, grouped by month —
            individual sites still have their own Sales page for the day-to-day view.
            Amount shown is the full agreed sale value (not yet-collected instalments are
            included), and abandoned sales are excluded. Totals are kept separate per currency.
          </p>

          {sortedMonths.length === 0 ? (
            <p className="text-sm text-neutral-500">No sales recorded yet.</p>
          ) : (
            <>
              <div className="mb-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  All-time total
                </p>
                <p className="text-lg font-semibold text-neutral-900">
                  {Object.entries(grandTotalsByCurrency)
                    .map(([currency, total]) => `${currency} ${total.toFixed(2)}`)
                    .join("  ·  ")}
                </p>
              </div>

              <div className="space-y-3">
                {sortedMonths.map((g) => (
                  <details
                    key={g.key}
                    className="group rounded-lg border border-neutral-200 bg-white"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
                      <span className="text-sm font-medium text-neutral-900">{g.label}</span>
                      <span className="flex items-center gap-3">
                        <span className="text-sm text-neutral-600">
                          {Object.entries(g.totalsByCurrency)
                            .map(([currency, total]) => `${currency} ${total.toFixed(2)}`)
                            .join("  ·  ")}
                        </span>
                        <span className="text-xs text-neutral-400">
                          {g.rows.length} sale{g.rows.length === 1 ? "" : "s"}
                        </span>
                      </span>
                    </summary>
                    <table className="w-full border-t border-neutral-100 text-xs">
                      <thead className="bg-neutral-50 text-left text-neutral-400">
                        <tr>
                          <th className="px-4 py-1.5 font-medium">Artist</th>
                          <th className="px-4 py-1.5 font-medium">Artwork</th>
                          <th className="px-4 py-1.5 font-medium">Buyer</th>
                          <th className="px-4 py-1.5 font-medium">Date</th>
                          <th className="px-4 py-1.5 font-medium">Amount</th>
                          <th className="px-4 py-1.5 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((r, i) => (
                          <tr key={i} className="border-t border-neutral-100">
                            <td className="px-4 py-1.5">
                              {r.siteId ? (
                                <Link href={`/sites/${r.siteId}/sales`} className="hover:underline">
                                  {r.artistName}
                                </Link>
                              ) : (
                                r.artistName
                              )}
                            </td>
                            <td className="px-4 py-1.5">{r.artworkTitle}</td>
                            <td className="px-4 py-1.5 text-neutral-500">{r.buyerName || "—"}</td>
                            <td className="px-4 py-1.5">{r.createdAt.toLocaleDateString()}</td>
                            <td className="px-4 py-1.5">
                              {r.currency} {r.amount.toFixed(2)}
                            </td>
                            <td className={`px-4 py-1.5 ${STATUS_STYLE[r.status]}`}>
                              {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                ))}
              </div>
            </>
          )}
        </div>
      }
    />
  );
}

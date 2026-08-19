import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import SiteSettingsPanel from "@/components/SiteSettingsPanel";
import SitesListColumn from "@/components/SitesListColumn";
import { SITES_STATUS_FILTER_COOKIE, normalizeSitesStatusFilter } from "@/lib/sitesStatusFilter";

export const dynamic = "force-dynamic";

export default async function SiteSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const site = await db.site.findUnique({
    where: { id },
    include: { artist: true },
    relationLoadStrategy: "query",
  });
  if (!site) notFound();

  // Same cookie the Sites Directory page reads (see sitesStatusFilter.ts)
  // — 2026-08-19, direct request: the status filter used to reset to its
  // default every time a specific site was opened, since this page's own
  // copy of the list had it hardcoded rather than reading whatever was
  // actually chosen.
  const cookieStore = await cookies();
  const status = normalizeSitesStatusFilter(cookieStore.get(SITES_STATUS_FILTER_COOKIE)?.value);

  const [payments, allSites] = await Promise.all([
    db.subscriptionPayment.findMany({
      where: { artistId: site.artistId },
      orderBy: { paidAt: "desc" },
    }),
    // Kept deliberately simple (no search wiring) — this is the "jump to
    // another site without losing my place" list, not a replacement for
    // the full Sites list's filtering, which stays on "/" itself
    // (2026-08-13). Sort and Status both stay in sync with whatever was
    // last chosen on the Directory page automatically now, with nothing
    // to pass through by hand — Sort via a client-side preference (see
    // SitesListColumn), Status via the cookie read above.
    db.site.findMany({
      where: status ? { status } : { status: { not: "ARCHIVED" } },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        artist: { select: { name: true, paymentMethod: true } },
      },
      relationLoadStrategy: "query",
      orderBy: { artist: { name: "asc" } },
    }),
  ]);

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <SiteSettingsPanel
          site={{
            id: site.id,
            name: site.name,
            domain: site.domain,
            status: site.status,
            createdAt: site.createdAt.toISOString(),
            defaultCurrency: site.defaultCurrency,
            template: site.template,
            salesEnabled: site.salesEnabled,
            domainStatus: site.domainStatus,
            domainRenewalDate: site.domainRenewalDate
              ? site.domainRenewalDate.toISOString().slice(0, 10)
              : "",
          }}
          artist={{
            id: site.artist.id,
            name: site.artist.name,
            firstName: site.artist.firstName,
            email: site.artist.email,
            phone: site.artist.phone,
            notes: site.artist.notes,
            subscriptionAmount: site.artist.subscriptionAmount
              ? site.artist.subscriptionAmount.toString()
              : "",
            paymentMethod: site.artist.paymentMethod,
            logoUrl: site.artist.logoUrl,
            invoiceAddress: site.artist.invoiceAddress,
            vatNumber: site.artist.vatNumber,
            vatRate: site.artist.vatRate ? site.artist.vatRate.toString() : "",
            invoiceFooterText: site.artist.invoiceFooterText,
            invoiceLanguage: site.artist.invoiceLanguage,
            nextInvoiceNumber: site.artist.nextInvoiceNumber,
            hopperToken: site.artist.hopperToken,
            stripeMode: site.artist.stripeMode,
            stripeSubscriptionCustomerId: site.artist.stripeSubscriptionCustomerId,
            stripeSubscriptionStatus: site.artist.stripeSubscriptionStatus,
          }}
          subscriptionPayments={payments.map((p) => ({
            id: p.id,
            source: p.source as "STRIPE" | "MANUAL",
            amount: p.amount.toString(),
            currency: p.currency,
            // 2026-08-19 fix — was `p.paidAt.toISOString()` unguarded,
            // which throws for a genuinely invalid Date rather than
            // returning anything. One bad row (root cause fixed in
            // addManualSubscriptionPayment, but this guards against any
            // that already exist) was enough to crash this entire page
            // for that artist — no way to even load Settings to delete
            // the bad row and fix it. Falls back to "" here, which the
            // display side's `new Date(p.paidAt).toLocaleDateString()`
            // already renders as the harmless text "Invalid Date" rather
            // than crashing — letting the row actually show up so it can
            // be deleted, instead of taking the whole page down with it.
            paidAt: Number.isNaN(p.paidAt.getTime()) ? "" : p.paidAt.toISOString(),
          }))}
        />
      </div>
      <div className="h-full w-[300px] shrink-0 overflow-y-auto border-l border-neutral-200">
        <SitesListColumn
          sites={allSites.map((s) => ({
            id: s.id,
            name: s.name,
            status: s.status,
            ownerName: s.artist.name,
            paymentMethod: s.artist.paymentMethod,
            createdAt: s.createdAt.toISOString(),
          }))}
          q=""
          sort="owner"
          status={status}
          selectedId={id}
        />
      </div>
    </div>
  );
}





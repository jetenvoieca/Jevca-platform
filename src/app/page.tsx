import Link from "next/link";
import { db } from "@/lib/db";
import SitesDirectoryView from "@/components/SitesDirectoryView";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string; sort?: string; archived?: string; selected?: string };

export default async function SitesDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() || "";
  const showArchived = params.archived === "1";
  const sort = params.sort === "date" ? "date" : "owner";
  const initialSelectedId = params.selected || null;

  const totalSites = await db.site.count();

  if (totalSites === 0) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-4 text-2xl font-semibold text-neutral-900">Sites</h1>
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center">
          <p className="mb-4 text-sm text-neutral-600">
            No sites yet. Add your first one to get started.
          </p>
          <Link
            href="/sites/new"
            className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            + Add New Site
          </Link>
        </div>
      </main>
    );
  }

  const sites = await db.site.findMany({
    where: {
      ...(showArchived ? {} : { status: { not: "ARCHIVED" } }),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { artist: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: { artist: true },
    relationLoadStrategy: "query",
    orderBy: sort === "date" ? { createdAt: "desc" } : { artist: { name: "asc" } },
  });

  const rows = sites.map((s) => ({
    id: s.id,
    name: s.name,
    domain: s.domain,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    defaultCurrency: s.defaultCurrency,
    template: s.template,
    salesEnabled: s.salesEnabled,
    domainStatus: s.domainStatus,
    domainRenewalDate: s.domainRenewalDate ? s.domainRenewalDate.toISOString().slice(0, 10) : "",
    ownerId: s.artist.id,
    ownerName: s.artist.name,
    ownerFirstName: s.artist.firstName,
    ownerEmail: s.artist.email,
    ownerPhone: s.artist.phone,
    ownerNotes: s.artist.notes,
    ownerSubscriptionAmount: s.artist.subscriptionAmount ? s.artist.subscriptionAmount.toString() : "",
    ownerPaymentMethod: s.artist.paymentMethod,
    ownerLogoUrl: s.artist.logoUrl,
    ownerInvoiceAddress: s.artist.invoiceAddress,
    ownerVatNumber: s.artist.vatNumber,
    ownerVatRate: s.artist.vatRate ? s.artist.vatRate.toString() : "",
    ownerInvoiceFooterText: s.artist.invoiceFooterText,
    ownerInvoiceLanguage: s.artist.invoiceLanguage,
    ownerNextInvoiceNumber: s.artist.nextInvoiceNumber,
    ownerHopperToken: s.artist.hopperToken,
    ownerStripeMode: s.artist.stripeMode,
  }));

  return (
    <SitesDirectoryView
      sites={rows}
      q={q}
      sort={sort}
      showArchived={showArchived}
      initialSelectedId={initialSelectedId}
    />
  );
}

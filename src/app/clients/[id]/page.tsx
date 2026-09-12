import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import AppShell from "@/components/AppShell";
import ClientOwnerPanel from "@/components/ClientOwnerPanel";
import SitesListColumn from "@/components/SitesListColumn";
import { buildTopNavItems } from "@/lib/topNav";
import { getOpenAlerts } from "@/lib/alerts";
import { SITES_STATUS_FILTER_COOKIE, normalizeSitesStatusFilter } from "@/lib/sitesStatusFilter";
import { getTemplatesForDirectory } from "@/lib/actions/templates";

export const dynamic = "force-dynamic";

// Administration → Clients → one client (2026-09-12) — the admin-only
// Owner/Domain/Subscription/Hopper Token view of a site, deliberately
// without the Financial (Sales/Invoicing) or Personal Profile content
// that the artist-facing per-site "Profile" page shows — see
// ClientOwnerPanel.
export default async function ClientAdminPage({
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

  // Same cookie the Sites Directory / per-site jump list read — see
  // sitesStatusFilter.ts — so this admin list stays in sync with
  // whatever status filter was last chosen anywhere else in the app.
  const cookieStore = await cookies();
  const status = normalizeSitesStatusFilter(cookieStore.get(SITES_STATUS_FILTER_COOKIE)?.value);

  const [payments, allSites, templates, openAlerts] = await Promise.all([
    db.subscriptionPayment.findMany({
      where: { artistId: site.artistId },
      orderBy: { paidAt: "desc" },
    }),
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
    getTemplatesForDirectory(""),
    getOpenAlerts(),
  ]);

  return (
    <AppShell
      publishEnabled={false}
      navItems={buildTopNavItems("clients", openAlerts.length)}
      rightPanel={
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
          liveSearch={false}
          basePath="/clients"
        />
      }
      content={
        <ClientOwnerPanel
          site={{
            id: site.id,
            name: site.name,
            domain: site.domain,
            status: site.status,
            defaultCurrency: site.defaultCurrency,
            templateId: site.templateId,
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
            addressLine1: site.artist.addressLine1,
            city: site.artist.city,
            postcode: site.artist.postcode,
            country: site.artist.country,
            vatNumber: site.artist.vatNumber,
            vatRate: site.artist.vatRate ? site.artist.vatRate.toString() : "",
            invoiceFooterText: site.artist.invoiceFooterText,
            invoiceLanguage: site.artist.invoiceLanguage,
            emailSlug: site.artist.emailSlug,
            hopperToken: site.artist.hopperToken,
            stripeSubscriptionCustomerId: site.artist.stripeSubscriptionCustomerId,
            stripeSubscriptionStatus: site.artist.stripeSubscriptionStatus,
          }}
          templates={templates.map((t) => ({ id: t.id, name: t.name }))}
          subscriptionPayments={payments.map((p) => ({
            id: p.id,
            source: p.source as "STRIPE" | "MANUAL",
            amount: p.amount.toString(),
            currency: p.currency,
            paidAt: Number.isNaN(p.paidAt.getTime()) ? "" : p.paidAt.toISOString(),
          }))}
        />
      }
    />
  );
}

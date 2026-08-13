import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import SiteSettingsPanel from "@/components/SiteSettingsPanel";

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

  const payments = await db.subscriptionPayment.findMany({
    where: { artistId: site.artistId },
    orderBy: { paidAt: "desc" },
  });

  return (
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
        paidAt: p.paidAt.toISOString(),
      }))}
    />
  );
}

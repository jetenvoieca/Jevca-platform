import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import SiteSettingsPanel from "@/components/SiteSettingsPanel";
import SitesListColumn from "@/components/SitesListColumn";
import { SITES_STATUS_FILTER_COOKIE, normalizeSitesStatusFilter } from "@/lib/sitesStatusFilter";
import { getCertificateTemplates } from "@/lib/actions/certificateSettings";

export const dynamic = "force-dynamic";

export default async function SiteSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const site = await db.site.findUnique({
    where: { id },
    // profileImage included alongside the plain artist scalars — needed
    // to resolve profileImageId into an actual URL (2026-08-31, since
    // the photo is now a relation to an existing Image, picked via
    // MediaPicker, rather than its own stored URL).
    include: { artist: { include: { profileImage: true } } },
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

  const [allSites, certificateTemplates] = await Promise.all([
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
    // Certificate of Authenticity templates (2026-09-04) — see
    // CertificateTemplatesCard on the Financial tab below.
    getCertificateTemplates(site.artistId),
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
            templateId: site.templateId,
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
            // Structured postal address (2026-09-06, reformed from a
            // single freeform `invoiceAddress` field) — see the matching
            // note on Artist.addressLine1 in schema.prisma.
            addressLine1: site.artist.addressLine1,
            city: site.artist.city,
            postcode: site.artist.postcode,
            country: site.artist.country,
            vatNumber: site.artist.vatNumber,
            vatRate: site.artist.vatRate ? site.artist.vatRate.toString() : "",
            invoiceFooterText: site.artist.invoiceFooterText,
            invoiceLanguage: site.artist.invoiceLanguage,
            nextInvoiceNumber: site.artist.nextInvoiceNumber,
            hopperToken: site.artist.hopperToken,
            stripeMode: site.artist.stripeMode,
            stripeSubscriptionCustomerId: site.artist.stripeSubscriptionCustomerId,
            stripeSubscriptionStatus: site.artist.stripeSubscriptionStatus,
            profileImageUrl: site.artist.profileImage?.url ?? null,
            story: site.artist.story,
            signatureUrl: site.artist.signatureUrl,
            // This artist's own @jevca.art local part (2026-09-05, Email
            // Integration) — see the Owner card, now on the
            // Administration → Clients admin page, not here.
            emailSlug: site.artist.emailSlug,
            // Payment plan defaults (2026-09-07) — moved here from the
            // Artwork Catalogue's own Settings page: these are financial
            // terms, not catalogue data, so they belong on the Financial
            // tab alongside Invoicing. See PaymentDefaultsCard.
            defaultInstalmentCount: site.artist.defaultInstalmentCount,
            defaultReleaseMessage: site.artist.defaultReleaseMessage,
            defaultReleaseTriggerCount: site.artist.defaultReleaseTriggerCount,
          }}
          certificateTemplates={certificateTemplates}
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
          // This panel is a compact "jump to another site" list, not the
          // full filterable Directory — see the comment on the query
          // above. Live search would navigate away from the site you're
          // currently editing on every keystroke, which is exactly the
          // "everything jumps" problem reported 2026-08-31; explicit
          // Enter-to-search (SitesListColumn's default when this is
          // false) avoids that.
          liveSearch={false}
        />
      </div>
    </div>
  );
}

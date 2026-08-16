import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listCustomers } from "@/lib/actions/customers";
import CustomersView from "@/components/CustomersView";

// See the matching note on Sales' page.tsx (2026-08-16) — same fix, same
// reason: CustomersView calls router.refresh() after edits/imports, which
// needs this route to never be served from the Full Route Cache.
export const dynamic = "force-dynamic";

export default async function CustomersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const site = await db.site.findUnique({
    where: { id },
    select: { artistId: true, salesEnabled: true },
  });
  if (!site) notFound();

  // Gated the same way as Sales — customers only make sense once selling
  // is actually switched on for this site (2026-08-13).
  if (!site.salesEnabled) {
    return (
      <div className="p-6">
        <h1 className="mb-2 text-2xl font-semibold text-neutral-900">Customers</h1>
        <p className="max-w-md text-sm text-neutral-500">
          The Sales menu isn&apos;t switched on for this site yet, so there&apos;s nothing to show
          here — customers are created automatically the first time a sale is started. Turn Sales
          on from the Sites Directory panel for this site if you&apos;d like to use it.
        </p>
      </div>
    );
  }

  const customers = await listCustomers(site.artistId);

  return <CustomersView siteId={id} artistId={site.artistId} customers={customers} />;
}

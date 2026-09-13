import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getPaymentsReceivedForArtist } from "@/lib/actions/paymentsReceived";
import PaymentsReceivedView from "@/components/PaymentsReceivedView";

// Same reasoning as sales/page.tsx — force-dynamic so a payment marked
// paid elsewhere shows up here without a stale cached copy.
export const dynamic = "force-dynamic";

export default async function PaymentsReceivedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const site = await db.site.findUnique({
    where: { id },
    select: { artistId: true, salesEnabled: true },
  });
  if (!site) notFound();

  if (!site.salesEnabled) {
    return (
      <div className="p-6">
        <h1 className="mb-2 text-2xl font-semibold text-neutral-900">Payments received</h1>
        <p className="max-w-md text-sm text-neutral-500">
          The Sales menu isn&apos;t switched on for this site yet — turn it on from the Sites
          Directory panel for this site if you&apos;d like to use it here.
        </p>
      </div>
    );
  }

  const payments = await getPaymentsReceivedForArtist(site.artistId);

  return <PaymentsReceivedView payments={payments} />;
}

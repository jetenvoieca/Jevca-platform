import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MarketingContactsView from "@/components/MarketingContactsView";
import { readSharedGalleries } from "@/lib/marketingContactsData";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Galleries",
  robots: { index: false, follow: false },
};

// The shared Galleries link (2026-11-13, Craig): Administration → Contacts'
// galleries, view only, for colleagues — no login, nothing else of the
// platform. Only the current link works (see readSharedGalleries).
export default async function SharedGalleriesPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const galleries = await readSharedGalleries(token);
  if (!galleries) notFound();
  return (
    <div className="px-6 py-6">
      <MarketingContactsView contacts={galleries} shared />
    </div>
  );
}

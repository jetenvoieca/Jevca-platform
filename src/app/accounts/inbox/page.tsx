import AppShell from "@/components/AppShell";
import AdminInboxPanel from "@/components/AdminInboxPanel";
import { buildTopNavItems } from "@/lib/topNav";
import { getOpenAlerts } from "@/lib/alerts";
import { getInboxList, getArtistFilterOptions } from "@/lib/actions/inboundEmail";
import { getComposeRecipients, getAdminEmailAddress } from "@/lib/actions/adminEmail";

export const dynamic = "force-dynamic";

// The unified admin inbox (2026-09-05, Email Integration) — "one box
// with a filter", direct decision. The artist filter lives in the URL
// (?artistId=...) rather than client state, so an Alerts-page link
// straight to a specific artist's messages (see lib/alerts.ts) works
// with a plain <a>/redirect, no client-side wiring needed to land
// already filtered.
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ artistId?: string }>;
}) {
  const { artistId } = await searchParams;

  const [alerts, list, artistOptions, composeRecipients, adminEmailAddress] = await Promise.all([
    getOpenAlerts(),
    getInboxList(artistId || undefined),
    getArtistFilterOptions(),
    getComposeRecipients(),
    getAdminEmailAddress(),
  ]);

  return (
    <AppShell
      publishEnabled={false}
      navItems={buildTopNavItems("inbox", alerts.length)}
      content={
        <AdminInboxPanel
          initialList={list}
          artistOptions={artistOptions}
          selectedArtistId={artistId || null}
          composeRecipients={composeRecipients}
          adminEmailAddress={adminEmailAddress}
        />
      }
    />
  );
}

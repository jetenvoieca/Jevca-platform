import AppShell from "@/components/AppShell";
import AdminInboxPanel from "@/components/AdminInboxPanel";
import { buildTopNavItems } from "@/lib/topNav";
import { getRecentSites } from "@/lib/recentSites";
import { getOpenAlerts } from "@/lib/alerts";
import { parseClientAlertId } from "@/lib/clientAlertIds";
import { getInboxList, getUnreadCounts, type InboxView } from "@/lib/actions/inboundEmail";
import { getComposeRecipients, getMailboxAddresses } from "@/lib/actions/adminEmail";
import { getClientPanelDataForArtist } from "@/lib/clientPanelData";
import { studioAppMetadata } from "@/lib/studioAppMetadata";
import type { Mailbox } from "@/lib/email";

export const dynamic = "force-dynamic";

export const metadata = studioAppMetadata;

// The Dashboard (2026-10-31, Craig's mockup — work matters, split from
// the Inbox, which keeps the personal ones): the Art and Business
// mailboxes and the Alerts (see AdminInboxPanel). Which mailbox is
// showing (?mailbox=business, else Art) and which of its lists — the
// Inbox, Archived (?view=archived) or Spam (?view=spam) — are in the URL,
// so a link can land on them.
//
// The selected alert is in the URL too (?alert=...): a payment-overdue
// alert opens the client's Owner/Domain/Subscription cards, whose data
// has to come from the server so their own router.refresh() after a save
// re-reads it — see getClientPanelDataForArtist.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ alert?: string; view?: string; mailbox?: string }>;
}) {
  const { alert: alertId, view: viewParam, mailbox: mailboxParam } = await searchParams;
  const view: InboxView = viewParam === "archived" || viewParam === "spam" ? viewParam : "inbox";
  const mailbox: Mailbox = mailboxParam === "business" ? "BUSINESS" : "ART";

  const [alerts, list, composeRecipients, mailboxAddresses, recentSites, unreadCounts] = await Promise.all([
    getOpenAlerts(),
    getInboxList(mailbox, view),
    getComposeRecipients(),
    getMailboxAddresses(),
    getRecentSites(),
    getUnreadCounts(),
  ]);

  // Derived from the alert id rather than looked up in `alerts`, so the
  // panel stays open after the alert itself clears (e.g. once the missing
  // payment has been recorded) until "Up to date" is pressed.
  const clientAlert = alertId ? parseClientAlertId(alertId) : null;
  const clientPanelData = clientAlert ? await getClientPanelDataForArtist(clientAlert.artistId) : null;
  const clientPanel =
    clientAlert && clientPanelData ? { alertType: clientAlert.type, data: clientPanelData } : null;

  return (
    <AppShell
      navItems={buildTopNavItems("dashboard", alerts.length, recentSites)}
      content={
        <AdminInboxPanel
          page="dashboard"
          mailbox={mailbox}
          initialList={list}
          view={view}
          initialAlerts={alerts}
          selectedAlertId={alertId || null}
          clientPanel={clientPanel}
          unreadCounts={unreadCounts}
          composeRecipients={composeRecipients}
          mailboxAddresses={mailboxAddresses}
        />
      }
    />
  );
}

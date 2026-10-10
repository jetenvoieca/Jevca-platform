import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import AdminInboxPanel from "@/components/AdminInboxPanel";
import { buildTopNavItems } from "@/lib/topNav";
import { getRecentSites } from "@/lib/recentSites";
import { getOpenAlerts } from "@/lib/alerts";
import { parseClientAlertId } from "@/lib/clientAlertIds";
import { getInboxList, getArtistOptions, getUnreadCounts } from "@/lib/actions/inboundEmail";
import { getComposeRecipients, getMailboxAddresses } from "@/lib/actions/adminEmail";
import { getOpenTasks } from "@/lib/actions/tasks";
import { getGmailConnection } from "@/lib/gmail";
import { parisToday } from "@/lib/parisTime";
import { getPlatformTaskCategories } from "@/lib/actions/platformTaskSettings";
import { getClientPanelDataForArtist } from "@/lib/clientPanelData";
import type { Mailbox } from "@/lib/email";

export const dynamic = "force-dynamic";

// Saved to the iPad's Home Screen, the Inbox opens as its own app,
// "JEVCAStudio" (2026-10-09, direct request) — full screen, straight to
// the Inbox. The manifest and icons are in public/inbox-app/. Only this
// page links them, so the artists' Studio app keeps its own.
export const metadata: Metadata = {
  manifest: "/inbox-app/manifest.webmanifest",
  icons: { apple: "/inbox-app/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "JEVCAStudio", statusBarStyle: "default" },
};

// The unified admin inbox (2026-09-05, Email Integration). Which mailbox
// is showing (?mailbox=business, else Art) and whether it's the Inbox or
// the Archived messages (?archived=1) are in the URL (2026-09-27), so a
// link can land on them. (The artist filter that used to be here too,
// ?artistId=, was removed 2026-10-10, direct request.)
//
// ?personal=1 opens the Personal tab (Craig's own Gmail, 2026-10-09) —
// where Connect Gmail comes back to, with ?gmailError=... if it failed.
//
// The selected alert is in the URL too (?alert=...): a payment-overdue
// alert opens the client's Owner/Domain/Subscription cards, whose data
// has to come from the server so their own router.refresh() after a save
// re-reads it — see getClientPanelDataForArtist.
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{
    alert?: string;
    archived?: string;
    mailbox?: string;
    personal?: string;
    gmailError?: string;
  }>;
}) {
  const {
    alert: alertId,
    archived,
    mailbox: mailboxParam,
    personal,
    gmailError,
  } = await searchParams;
  const showArchived = archived === "1";
  const mailbox: Mailbox = mailboxParam === "business" ? "BUSINESS" : "ART";

  const [
    alerts,
    list,
    artistOptions,
    composeRecipients,
    mailboxAddresses,
    tasks,
    taskCategories,
    recentSites,
    gmail,
    unreadCounts,
  ] = await Promise.all([
    getOpenAlerts(),
    getInboxList(mailbox, showArchived),
    getArtistOptions(),
    getComposeRecipients(),
    getMailboxAddresses(),
    getOpenTasks(),
    getPlatformTaskCategories(),
    getRecentSites(),
    getGmailConnection(),
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
      publishEnabled={false}
      navItems={buildTopNavItems("inbox", alerts.length, recentSites)}
      content={
        <AdminInboxPanel
          mailbox={mailbox}
          initialList={list}
          showArchived={showArchived}
          initialTasks={tasks}
          initialToday={parisToday()}
          initialAlerts={alerts}
          selectedAlertId={alertId || null}
          clientPanel={clientPanel}
          taskCategories={taskCategories}
          artistOptions={artistOptions}
          unreadCounts={unreadCounts}
          composeRecipients={composeRecipients}
          mailboxAddresses={mailboxAddresses}
          gmail={gmail}
          gmailError={gmailError || null}
          openPersonal={personal === "1"}
        />
      }
    />
  );
}

import AppShell from "@/components/AppShell";
import AdminInboxPanel from "@/components/AdminInboxPanel";
import { buildTopNavItems } from "@/lib/topNav";
import { getOpenAlerts, overdueAlertArtistId } from "@/lib/alerts";
import { getInboxList, getArtistFilterOptions } from "@/lib/actions/inboundEmail";
import { getComposeRecipients, getAdminEmailAddress } from "@/lib/actions/adminEmail";
import { getOpenTasks } from "@/lib/actions/tasks";
import { getPlatformTaskCategories } from "@/lib/actions/platformTaskSettings";
import { getClientPanelDataForArtist } from "@/lib/clientPanelData";

export const dynamic = "force-dynamic";

// The unified admin inbox (2026-09-05, Email Integration) — "one box
// with a filter", direct decision. The artist filter lives in the URL
// (?artistId=...) rather than client state, so a link straight to a
// specific artist's messages (see lib/alerts.ts) works with a plain
// <a>/redirect, no client-side wiring needed to land already filtered.
// The same filter applies to the open Tasks and Alerts lists
// (2026-09-19, CRM Phase 2/3), which share the left-hand column.
//
// The selected alert is in the URL too (?alert=...): a payment-overdue
// alert opens the client's Owner/Domain/Subscription cards, whose data
// has to come from the server so their own router.refresh() after a save
// re-reads it — see getClientPanelDataForArtist.
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ artistId?: string; alert?: string }>;
}) {
  const { artistId, alert: alertId } = await searchParams;

  const [alerts, list, artistOptions, composeRecipients, adminEmailAddress, tasks, taskCategories] =
    await Promise.all([
      getOpenAlerts(),
      getInboxList(artistId || undefined),
      getArtistFilterOptions(),
      getComposeRecipients(),
      getAdminEmailAddress(),
      getOpenTasks(artistId || undefined),
      getPlatformTaskCategories(),
    ]);

  // Derived from the alert id rather than looked up in `alerts`, so the
  // panel stays open after the alert itself clears (e.g. once the missing
  // payment has been recorded) until "Up to date" is pressed.
  const panelArtistId = alertId ? overdueAlertArtistId(alertId) : null;
  const clientPanel = panelArtistId ? await getClientPanelDataForArtist(panelArtistId) : null;

  return (
    <AppShell
      publishEnabled={false}
      navItems={buildTopNavItems("inbox", alerts.length)}
      content={
        <AdminInboxPanel
          initialList={list}
          initialTasks={tasks}
          initialAlerts={alerts.filter((a) => !artistId || a.artistId === artistId)}
          selectedAlertId={alertId || null}
          clientPanel={clientPanel}
          taskCategories={taskCategories}
          artistOptions={artistOptions}
          selectedArtistId={artistId || null}
          composeRecipients={composeRecipients}
          adminEmailAddress={adminEmailAddress}
        />
      }
    />
  );
}

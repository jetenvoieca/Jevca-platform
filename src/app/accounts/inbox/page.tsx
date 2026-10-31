import AppShell from "@/components/AppShell";
import AdminInboxPanel from "@/components/AdminInboxPanel";
import { buildTopNavItems } from "@/lib/topNav";
import { getRecentSites } from "@/lib/recentSites";
import { getOpenAlerts } from "@/lib/alerts";
import { getArtistOptions } from "@/lib/actions/inboundEmail";
import { getComposeRecipients, getMailboxAddresses } from "@/lib/actions/adminEmail";
import { getOpenTasks, getInsights, getGmailTaskLinks } from "@/lib/actions/tasks";
import { getGmailConnection } from "@/lib/gmail";
import { parisToday } from "@/lib/parisTime";
import { getPlatformTaskCategories } from "@/lib/actions/platformTaskSettings";
import { studioAppMetadata } from "@/lib/studioAppMetadata";

export const dynamic = "force-dynamic";

export const metadata = studioAppMetadata;

// The Inbox (2026-10-31, Craig's mockup — personal matters; the work
// ones moved to the Dashboard): Personal (Craig's own Gmail), Tasks and
// Insights (see AdminInboxPanel). Opens on Personal.
//
// ?task=<id> opens that task (in Task, or Insight if it was kept as one)
// — where the Dashboard's Make task / Open task on an email lands.
// ?gmailError=... is a failed Connect Gmail coming back.
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ task?: string; gmailError?: string }>;
}) {
  const { task: openTaskId, gmailError } = await searchParams;

  const [
    alerts,
    artistOptions,
    composeRecipients,
    mailboxAddresses,
    tasks,
    insights,
    taskCategories,
    recentSites,
    gmail,
    gmailTaskIds,
  ] = await Promise.all([
    getOpenAlerts(),
    getArtistOptions(),
    getComposeRecipients(),
    getMailboxAddresses(),
    getOpenTasks(),
    getInsights(),
    getPlatformTaskCategories(),
    getRecentSites(),
    getGmailConnection(),
    getGmailTaskLinks(),
  ]);

  return (
    <AppShell
      navItems={buildTopNavItems("inbox", alerts.length, recentSites)}
      content={
        <AdminInboxPanel
          page="inbox"
          initialTasks={tasks}
          initialInsights={insights}
          initialToday={parisToday()}
          openTaskId={openTaskId || null}
          taskCategories={taskCategories}
          artistOptions={artistOptions}
          gmailTaskIds={gmailTaskIds}
          composeRecipients={composeRecipients}
          mailboxAddresses={mailboxAddresses}
          gmail={gmail}
          gmailError={gmailError || null}
        />
      }
    />
  );
}

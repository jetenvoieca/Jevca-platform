import AppShell from "@/components/AppShell";
import { getOpenAlerts } from "@/lib/alerts";
import { buildTopNavItems } from "@/lib/topNav";
import { getRecentSites } from "@/lib/recentSites";
import MarketingContactsView from "@/components/MarketingContactsView";
import { listMarketingContacts } from "@/lib/actions/marketingContacts";

export const dynamic = "force-dynamic";

// Administration → Contacts (2026-11-04, Craig's request): the platform's
// own marketing list of artists and galleries. Uses the full width of
// the page, for the table's many columns (2026-11-07, Craig).
export default async function ContactsPage() {
  const [contacts, openAlerts, recentSites] = await Promise.all([
    listMarketingContacts(),
    getOpenAlerts(),
    getRecentSites(),
  ]);

  return (
    <AppShell
      navItems={buildTopNavItems("contacts", openAlerts.length, recentSites)}
      content={
        <div className="px-6 py-6">
          <MarketingContactsView contacts={contacts} />
        </div>
      }
    />
  );
}

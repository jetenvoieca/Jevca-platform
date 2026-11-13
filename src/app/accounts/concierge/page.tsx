import AppShell from "@/components/AppShell";
import ConciergeView from "@/components/concierge/ConciergeView";
import { buildTopNavItems } from "@/lib/topNav";
import { getRecentSites } from "@/lib/recentSites";
import { getOpenAlerts } from "@/lib/alerts";
import { listConciergeQueue } from "@/lib/actions/concierge";

export const dynamic = "force-dynamic";

// Administration → Concierge (2026-11-13, Craig's mockup): every site's
// Concierge requests and instructions in one Hopper — see ConciergeView.tsx.
export default async function ConciergePage() {
  const [queue, openAlerts, recentSites] = await Promise.all([
    listConciergeQueue(),
    getOpenAlerts(),
    getRecentSites(),
  ]);

  return (
    <AppShell
      navItems={buildTopNavItems("concierge", openAlerts.length, recentSites)}
      content={<ConciergeView notes={queue.notes} pictures={queue.pictures} />}
    />
  );
}

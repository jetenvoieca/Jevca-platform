import AppShell from "@/components/AppShell";
import PlansManager from "@/components/PlansManager";
import { buildTopNavItems } from "@/lib/topNav";
import { getRecentSites } from "@/lib/recentSites";
import { getOpenAlerts } from "@/lib/alerts";
import { getSignupStripeMode, listPlans } from "@/lib/actions/plans";
import { listSiteThemes } from "@/lib/actions/siteThemes";

export const dynamic = "force-dynamic";

// Templates → Plans (2026-11-09): the subscriber options — see
// PlansManager.tsx.
export default async function PlansPage() {
  const [plans, signupMode, themes, openAlerts, recentSites] = await Promise.all([
    listPlans(),
    getSignupStripeMode(),
    listSiteThemes(),
    getOpenAlerts(),
    getRecentSites(),
  ]);

  return (
    <AppShell
      navItems={buildTopNavItems("plans", openAlerts.length, recentSites)}
      content={
        <PlansManager
          plans={plans}
          signupMode={signupMode}
          themes={themes.map((t) => ({ id: t.id, name: t.name }))}
        />
      }
    />
  );
}

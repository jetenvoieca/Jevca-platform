import AppShell from "@/components/AppShell";
import SignupLinksView from "@/components/SignupLinksView";
import { getOpenAlerts } from "@/lib/alerts";
import { buildTopNavItems } from "@/lib/topNav";
import { getRecentSites } from "@/lib/recentSites";
import { listSignupLinks } from "@/lib/actions/signupLinks";
import { listPlans } from "@/lib/actions/plans";
import { listSiteThemes } from "@/lib/actions/siteThemes";

export const dynamic = "force-dynamic";

// Administration → Sign-ups (2026-11-10): sign-up links — see
// SignupLinksView.tsx.
export default async function SignupsPage() {
  const [links, plans, themes, openAlerts, recentSites] = await Promise.all([
    listSignupLinks(),
    listPlans(),
    listSiteThemes(),
    getOpenAlerts(),
    getRecentSites(),
  ]);

  return (
    <AppShell
      navItems={buildTopNavItems("signups", openAlerts.length, recentSites)}
      content={
        <div className="mx-auto max-w-5xl px-6 py-6">
          <SignupLinksView
            links={links}
            plans={plans}
            themes={themes.map((t) => ({ id: t.id, name: t.name }))}
            now={new Date().toISOString()}
          />
        </div>
      }
    />
  );
}

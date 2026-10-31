import AppShell from "@/components/AppShell";
import PageStylesManager from "@/components/PageStylesManager";
import { buildTopNavItems } from "@/lib/topNav";
import { getRecentSites } from "@/lib/recentSites";
import { getOpenAlerts } from "@/lib/alerts";
import { listPageStyles } from "@/lib/actions/pageStyles";
import { listPresentationTemplates } from "@/lib/actions/presentationTemplates";

export const dynamic = "force-dynamic";

// Templates → Page Styles (2026-10-04): the shared list of page layouts
// — see PageStylesManager.tsx.
// `?edit=<style>&back=<address>` (2026-10-22): opens that style's editor
// straight away, with a way back to where it was opened from (a site's
// Pages) — only an address inside the app is accepted.
export default async function PageStylesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; back?: string }>;
}) {
  const { edit, back } = await searchParams;
  const backHref = back && back.startsWith("/sites/") && !back.startsWith("//") ? back : null;
  const [styles, presentationTemplates, openAlerts, recentSites] = await Promise.all([
    listPageStyles(),
    listPresentationTemplates(),
    getOpenAlerts(),
    getRecentSites(),
  ]);

  return (
    <AppShell
      navItems={buildTopNavItems("pageStyles", openAlerts.length, recentSites)}
      content={
        <PageStylesManager
          initialEditId={edit && styles.some((s) => s.id === edit) ? edit : null}
          backHref={backHref}
          styles={styles}
          presentationTemplates={presentationTemplates.map((t) => ({ id: t.id, name: t.name }))}
        />
      }
    />
  );
}

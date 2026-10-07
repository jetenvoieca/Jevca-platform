import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import TemplatesListColumn from "@/components/TemplatesListColumn";
import TemplateEditorPanel from "@/components/TemplateEditorPanel";
import { buildTopNavItems } from "@/lib/topNav";
import { getRecentSites } from "@/lib/recentSites";
import { getTemplate, getTemplatesForDirectory } from "@/lib/actions/templates";
import { getOpenAlerts } from "@/lib/alerts";

export const dynamic = "force-dynamic";

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const template = await getTemplate(id);
  if (!template) notFound();

  // Kept deliberately simple, same as the per-site "jump to another
  // site" list in src/app/sites/[id]/page.tsx — this is a "jump to
  // another template" convenience, not a replacement for the full
  // filterable Directory at /templates.
  const [allTemplates, openAlerts, recentSites] = await Promise.all([
    getTemplatesForDirectory(""),
    getOpenAlerts(),
    getRecentSites(),
  ]);

  return (
    <AppShell
      publishEnabled={false}
      navItems={buildTopNavItems("templates", openAlerts.length, recentSites)}
      content={<TemplateEditorPanel template={template} />}
      rightPanel={
        <TemplatesListColumn templates={allTemplates} q="" selectedId={id} />
      }
    />
  );
}

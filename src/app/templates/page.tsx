import TemplatesDirectoryView from "@/components/TemplatesDirectoryView";
import { getTemplatesForDirectory } from "@/lib/actions/templates";
import { getOpenAlerts } from "@/lib/alerts";
import { getRecentSites } from "@/lib/recentSites";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string };

export default async function TemplatesDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() || "";

  const templates = await getTemplatesForDirectory(q);
  const [openAlerts, recentSites] = await Promise.all([getOpenAlerts(), getRecentSites()]);

  return (
    <TemplatesDirectoryView
      templates={templates}
      q={q}
      alertCount={openAlerts.length}
      recentSites={recentSites}
    />
  );
}

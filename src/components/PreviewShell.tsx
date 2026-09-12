"use client";

import { usePathname } from "next/navigation";
import AppShell from "@/components/AppShell";
import { buildPreviewNavEntries, type PreviewNavKey } from "@/lib/previewNav";

// The evaluation-only reduced-menu shell (2026-09-12) — see
// previewSites.ts / previewNav.ts. Deliberately much simpler than
// SiteShell: no Publish button, no site pages list, no Menu/Profile
// links — just the fixed nav plus whatever page content is passed in.
function resolveActiveKey(pathname: string, basePath: string): PreviewNavKey | null {
  if (pathname.startsWith(`${basePath}/artworks`)) return "artworks";
  if (pathname.startsWith(`${basePath}/hopper`)) return "hopper";
  if (pathname.startsWith(`${basePath}/galleries`)) return "galleries";
  if (pathname.startsWith(`${basePath}/sales`)) return "sales";
  if (pathname.startsWith(`${basePath}/guides`)) return "guides";
  return null;
}

export default function PreviewShell({
  basePath,
  siteLabel,
  hopperCount,
  children,
}: {
  // e.g. "/preview/louise-dear" — every nav link and active-state check
  // is built from this rather than a hardcoded path, so the same shell
  // works for any slug in previewSites.ts.
  basePath: string;
  siteLabel: string;
  hopperCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = resolveActiveKey(pathname, basePath);
  const navItems = buildPreviewNavEntries({ basePath, active, hopperCount });

  return (
    <AppShell
      navItems={navItems}
      content={
        <div className="flex h-full flex-col">
          <div className="shrink-0 border-b border-neutral-200 px-6 py-4">
            <p className="text-xs uppercase tracking-wide text-neutral-400">Evaluation preview</p>
            <h1 className="text-lg font-semibold text-neutral-900">{siteLabel}</h1>
          </div>
          <div className="flex-1 overflow-y-auto">{children}</div>
        </div>
      }
    />
  );
}

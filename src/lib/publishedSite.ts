import { db } from "@/lib/db";
import { normalizePresentation } from "@/lib/presentationTemplate";
import { normalizeLayout } from "@/lib/pageStyleLayout";
import { isPageStyleType } from "@/lib/pageStyleTypes";
import { normalizeMenuStyle, type MenuStyleLayout } from "@/lib/menuStyleLayout";
import { SNAPSHOT_VERSION, type SiteSnapshot } from "@/lib/siteSnapshot";

// Reading a published site (moved here from lib/actions/siteSnapshot.ts,
// 2026-10-26): plain server code for the published site's own pages,
// which show only what was published — so not a server action anyone
// could call.

// The site as last published, or null if it never has been (or was
// published in an older shape — see SNAPSHOT_VERSION). Each page's
// Display Style is cleaned with the same rules as a saved style
// (2026-10-06), so a style setting added after publishing takes its
// default rather than breaking the page, and one of a type that no
// longer exists (Section, removed 2026-10-07) is dropped; menus
// (2026-10-06) the same. A site published before menus existed shows
// none until it's published again, and one published before
// components' content existed (2026-10-07) shows its Block Build pages
// empty until then; the same for sign-up forms (2026-10-10).
// Changes to a style's own settings still need a publish to show.
export async function getPublishedSite(
  siteId: string
): Promise<{ snapshot: SiteSnapshot; publishedAt: Date } | null> {
  const row = await db.sitePublication.findUnique({
    where: { siteId },
    select: { data: true, publishedAt: true },
  });
  const snapshot = row?.data as SiteSnapshot | undefined;
  if (!row || !snapshot || snapshot.version !== SNAPSHOT_VERSION) return null;
  const pages = snapshot.pages.map((p) => ({
    ...p,
    style:
      p.style && isPageStyleType(p.style.type)
        ? {
            id: p.style.id,
            name: p.style.name,
            presentationTemplateId: p.style.presentationTemplateId ?? null,
            // Published before Presentation Templates (2026-10-19): the built-in look.
            presentation: normalizePresentation(p.style.presentation),
            ...normalizeLayout(p.style.type, p.style.layout),
          }
        : null,
    components: p.components ?? [],
    signupForms: p.signupForms ?? [],
    menuStyleId: p.menuStyleId ?? null,
    parentId: p.parentId ?? null,
  }));
  const menus: Record<string, MenuStyleLayout> = {};
  for (const [id, layout] of Object.entries(snapshot.menus ?? {})) {
    menus[id] = normalizeMenuStyle(layout);
  }
  return {
    snapshot: { ...snapshot, pages, menus, profileStories: snapshot.profileStories ?? [] },
    publishedAt: row.publishedAt,
  };
}

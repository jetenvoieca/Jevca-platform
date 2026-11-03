import { db } from "@/lib/db";
import { slugify } from "@/lib/pageSlug";

// A new page's web address on its site (moved here 2026-11-03, shared by
// Add on the Pages page and Site Themes): its name as a slug, with -2,
// -3… added if another page on the site already has it. Plain server
// code, not "use server", so it isn't callable from the browser.
export async function uniquePageSlug(siteId: string, title: string): Promise<string> {
  const base = slugify(title);
  let slug = base;
  let n = 2;
  while (await db.page.findFirst({ where: { siteId, slug }, select: { id: true } })) {
    slug = `${base}-${n}`;
    n++;
  }
  return slug;
}

import type { ReactNode } from "react";
import { headers } from "next/headers";
import { turnstileSiteKeyForHost } from "@/lib/turnstile";
import { loadPublishedSite } from "./published";
import PublishedSite from "@/components/PublishedSite";

export const dynamic = "force-dynamic";

// Around every page of a published site (2026-10-06): the whole site,
// loaded once when a visitor arrives (2026-10-13). PublishedSite draws
// the page for the address and its menu, and shows the site's other pages
// in the browser from then on, without coming back here. The page route
// (./[[...slug]]/page.tsx) only gives each address its title, and its
// message when there's nothing to show.
export default async function SitePreviewLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const published = await loadPublishedSite(siteId);
  if (!published) return children;

  const { snapshot } = published;
  // The robot check for sign-up forms (2026-10-10), on the address the
  // site is shown on — see lib/turnstile.ts.
  const hasSignupForm = snapshot.pages.some((p) => p.signupForms.length > 0);
  const host = ((await headers()).get("host") ?? "").toLowerCase().split(":")[0];
  const siteKey = hasSignupForm ? await turnstileSiteKeyForHost(host) : null;

  return (
    <>
      {children}
      <PublishedSite siteId={siteId} siteKey={siteKey} snapshot={snapshot} />
    </>
  );
}

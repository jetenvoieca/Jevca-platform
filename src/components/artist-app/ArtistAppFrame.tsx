"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ARTIST_APP_FONT,
  ARTIST_APP_SHOWS_MANAGE_WORKS,
  artistAppHref,
  artistAppPageHref,
  artistAppPreviewHref,
} from "@/lib/artistApp";
import type { ArtistAppPage } from "@/lib/actions/artistApp";
import { logout } from "@/lib/actions/auth";
import { publishedHomePath } from "@/lib/siteSnapshot";
import EyeIcon from "@/components/EyeIcon";
import PublishButton from "@/components/PublishButton";
import PublishedSiteLink from "@/components/PublishedSiteLink";
import { useArtistAppFeatures } from "@/components/artist-app/ArtistAppFeatures";
import { useFrameSlots } from "@/components/artist-app/ArtistAppPanels";

// The Artist App's frame (Craig's mockups; rearranged 2026-11-11 to his
// screenshot): one grey rounded frame holding the screen's panel and, on
// the right, one white panel — at its top "← Admin" (when the login may
// reach it), Log out for a client login, and the icons (the eye for the
// chosen page's preview on Pages, a screen's own tools — BandTools —
// publish, the published site);
// then the screen's side contents (SidePanel) or else the site's pages,
// each opening it on Pages — so they stay beside Account; and at the foot
// the app's buttons: Art manager (the Artwork Catalogue, with Art Manager —
// reading "Website" while it's open, back to Pages: 2026-11-11),
// Concierge (a placeholder) and Account.
// Medium screens and up the two side by side; a phone stacked.

const BUTTON_COLOR = "#FBF7EE";
const CONCIERGE_COLOR = "#FAE8C3";

export default function ArtistAppFrame({
  siteId,
  lastPublishedAt,
  adminHref,
  canLogOut,
  pages,
  children,
}: {
  siteId: string;
  // ISO date, or null if never published.
  lastPublishedAt: string | null;
  // Where "← Admin" goes; null hides it.
  adminHref: string | null;
  canLogOut: boolean;
  // The site's pages, arranged (arrangePages).
  pages: ArtistAppPage[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Pages keeps its chosen page in the address (`page`).
  const chosenPage = pathname === artistAppHref(siteId, "pages") ? searchParams.get("page") : null;
  const { catalogue } = useArtistAppFeatures();
  const slots = useFrameSlots();
  const catalogueHref = artistAppHref(siteId, "artworks");
  const accountHref = artistAppHref(siteId, "account");

  return (
    <slots.Provider value={slots.value}>
      <div className="h-dvh bg-white p-4 lg:p-6" style={{ fontFamily: ARTIST_APP_FONT }}>
        <div className="flex h-full flex-col gap-4 overflow-y-auto rounded-[28px] bg-[#F2F2F2] p-4 sm:flex-row sm:overflow-hidden">
          <div className="flex flex-col gap-4 sm:min-h-0 sm:min-w-0 sm:flex-1">{children}</div>
          <aside className="flex shrink-0 flex-col gap-3 rounded-lg border border-neutral-300 bg-white p-3 sm:w-[260px] lg:w-[340px]">
            <div className="flex shrink-0 items-center gap-1 rounded-md bg-[#F2F2F2] px-3 py-2">
              <div className="mr-auto flex items-center gap-2">
                {adminHref && (
                  <Link href={adminHref} prefetch={false} className="px-1 text-sm text-neutral-500 hover:text-neutral-800">
                    ← Admin
                  </Link>
                )}
                {canLogOut && (
                  <form action={logout}>
                    <button type="submit" className="px-1 text-sm text-neutral-500 hover:text-neutral-800">
                      Log out
                    </button>
                  </form>
                )}
              </div>
              {chosenPage && (
                <Link
                  href={artistAppPreviewHref(siteId, chosenPage)}
                  prefetch={false}
                  title="Preview this page"
                  aria-label="Preview this page"
                  className="inline-flex shrink-0 rounded-full p-0.5 hover:bg-white"
                >
                  <EyeIcon />
                </Link>
              )}
              <div ref={slots.band.setNode} className="flex items-center gap-1.5" />
              <PublishButton siteId={siteId} lastPublishedAt={lastPublishedAt} />
              <PublishedSiteLink href={publishedHomePath(siteId)} />
            </div>

            <div className="flex min-h-0 flex-1 flex-col sm:overflow-y-auto">
              <div ref={slots.side.setNode} className="flex min-h-0 flex-1 flex-col" />
              {!slots.side.claimed && <PageLinks siteId={siteId} pages={pages} />}
            </div>

            <nav className="flex shrink-0 flex-col gap-2">
              {catalogue &&
                (pathname === catalogueHref || pathname.startsWith(`${catalogueHref}/`) ? (
                  <AppButton href={artistAppHref(siteId, "pages")}>Website</AppButton>
                ) : (
                  <AppButton href={catalogueHref}>Art manager</AppButton>
                ))}
              {ARTIST_APP_SHOWS_MANAGE_WORKS && (
                <AppButton href={artistAppHref(siteId)} active={pathname === artistAppHref(siteId)}>
                  Manage Works
                </AppButton>
              )}
              <AppButton color={CONCIERGE_COLOR}>Concierge</AppButton>
              <AppButton href={accountHref} active={pathname === accountHref}>
                Account
              </AppButton>
            </nav>
          </aside>
        </div>
      </div>
    </slots.Provider>
  );
}

// The site's Live and Hidden pages, as on Pages (Live without a heading,
// as Craig's screenshot); each opens it there.
function PageLinks({ siteId, pages }: { siteId: string; pages: ArtistAppPage[] }) {
  const titleOf = (id: string) => pages.find((p) => p.id === id)?.title ?? "";
  return (
    <>
      {[true, false].map((visible) => {
        const listed = pages.filter((p) => p.visible === visible);
        return (
          <div key={String(visible)} className={`flex flex-col gap-1.5 ${visible ? "pb-8" : "pt-5"}`}>
            {!visible && <h3 className="mb-2 text-center text-lg text-neutral-800">Hidden Pages</h3>}
            {listed.map((p) => {
              const parentHere = !!p.parentId && listed.some((q) => q.id === p.parentId);
              return (
                <Link
                  key={p.id}
                  href={artistAppPageHref(siteId, p.id)}
                  prefetch={false}
                  className={`flex items-baseline justify-between gap-2 rounded-sm border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-800 hover:bg-neutral-50 ${
                    p.parentId ? "ml-6" : ""
                  }`}
                >
                  <span className="min-w-0 truncate">{p.title}</span>
                  {p.parentId && !parentHere && (
                    <span className="shrink-0 text-xs text-neutral-400">under {titleOf(p.parentId)}</span>
                  )}
                </Link>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

// A screen's button, or a placeholder when it has no `href`.
function AppButton({
  href,
  active = false,
  color = BUTTON_COLOR,
  children,
}: {
  href?: string;
  active?: boolean;
  color?: string;
  children: React.ReactNode;
}) {
  // As Craig's screenshots (2026-11-11): words as typed, on the left,
  // rounded corners, about six times as wide as high.
  const className = `flex h-11 shrink-0 items-center whitespace-nowrap rounded-xl border px-5 text-lg font-light text-neutral-600 lg:h-[54px] lg:text-[22px] ${
    active ? "border-neutral-500" : "border-neutral-300"
  }`;
  if (!href) {
    return (
      <button type="button" aria-disabled style={{ backgroundColor: color }} className={`${className} cursor-default`}>
        {children}
      </button>
    );
  }
  return (
    <Link href={href} prefetch={false} style={{ backgroundColor: color }} className={`${className} hover:brightness-[0.98]`}>
      {children}
    </Link>
  );
}

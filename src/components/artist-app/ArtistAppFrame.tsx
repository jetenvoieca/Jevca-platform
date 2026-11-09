"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ARTIST_APP_FONT,
  ARTIST_APP_SHOWS_MANAGE_WORKS,
  artistAppHref,
  artistAppPreviewHref,
} from "@/lib/artistApp";
import { siteNavHref } from "@/lib/siteMenuAccess";
import { publishedHomePath } from "@/lib/siteSnapshot";
import EyeIcon from "@/components/EyeIcon";
import PublishButton from "@/components/PublishButton";
import PublishedSiteLink from "@/components/PublishedSiteLink";

// Sizes (2026-11-09, Craig — half a laptop screen): wide (lg) as the
// mockups, buttons on the right; medium (sm–lg) the buttons as a row
// along the top, smaller, with the two panels side by side below; a phone
// everything stacked.
//
// The Artist App's frame (Craig's mockups): one grey rounded frame
// holding the screen's two panels and, on the right, the app's buttons —
// its navigation. Buttons without a screen yet are placeholders. Above
// them (2026-11-08): "← Admin" back to the site in the admin (admin only
// for now, like the app), and the admin's icons — the eye (the chosen
// page's preview, on Arrange Pages), publish and the published site.

const BUTTON_COLOR = "#FBF7EE";
const CONCIERGE_COLOR = "#FAE8C3";

export default function ArtistAppFrame({
  siteId,
  lastPublishedAt,
  children,
}: {
  siteId: string;
  // ISO date, or null if never published.
  lastPublishedAt: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Arrange Pages keeps its chosen page in the address (`page`).
  const chosenPage = pathname === artistAppHref(siteId, "pages") ? searchParams.get("page") : null;
  const screens = [
    ...(ARTIST_APP_SHOWS_MANAGE_WORKS ? [{ label: "Manage Works", href: artistAppHref(siteId) }] : []),
    { label: "Arrange Pages", href: artistAppHref(siteId, "pages") },
    { label: "Update CV", href: artistAppHref(siteId, "cv") },
  ];

  return (
    <div className="h-dvh bg-white p-4 lg:p-6" style={{ fontFamily: ARTIST_APP_FONT }}>
      <div className="flex h-full flex-col gap-4 overflow-y-auto rounded-[28px] bg-[#F2F2F2] p-4 sm:overflow-hidden lg:flex-row">
        <div className="flex flex-col gap-4 sm:min-h-0 sm:flex-1 sm:flex-row">{children}</div>
        {/* Scrolls on its own when it doesn't fit (the iPad). */}
        <nav className="flex shrink-0 flex-col gap-3 sm:order-first sm:flex-row sm:items-center sm:overflow-x-auto lg:order-none lg:w-[200px] lg:flex-col lg:items-stretch lg:overflow-y-auto lg:overflow-x-hidden">
          <div className="flex shrink-0 items-center gap-1">
            <Link
              href={siteNavHref(siteId, "artworks")}
              prefetch={false}
              className="mr-auto px-1 text-sm text-neutral-500 hover:text-neutral-800"
            >
              ← Admin
            </Link>
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
            <PublishButton siteId={siteId} lastPublishedAt={lastPublishedAt} />
            <PublishedSiteLink href={publishedHomePath(siteId)} />
          </div>
          {screens.map((s) => (
            <AppButton key={s.label} href={s.href} active={pathname === s.href}>
              {s.label}
            </AppButton>
          ))}
          {["Exhibition", "Consignment"].map((label) => (
            <AppButton key={label}>{label}</AppButton>
          ))}
          <AppButton color={CONCIERGE_COLOR}>Concierge</AppButton>
          <AppButton>Upgrade</AppButton>
        </nav>
      </div>
    </div>
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
  const className = `flex h-24 shrink-0 items-center whitespace-nowrap rounded-2xl border px-5 text-left text-2xl font-light text-neutral-500 sm:h-12 sm:rounded-xl sm:px-4 sm:text-lg lg:h-24 lg:rounded-2xl lg:px-5 lg:text-2xl ${
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

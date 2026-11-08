"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ARTIST_APP_FONT, artistAppHref } from "@/lib/artistApp";
import { siteNavHref } from "@/lib/siteMenuAccess";

// The Artist App's frame (Craig's mockups): one grey rounded frame
// holding the screen's two panels and, on the right, the app's buttons —
// its navigation. Buttons without a screen yet are placeholders. Above
// them, "← Admin" back to the site in the admin (2026-11-08 — admin only
// for now, like the app).

const BUTTON_COLOR = "#FBF7EE";
const CONCIERGE_COLOR = "#FAE8C3";

export default function ArtistAppFrame({ siteId, children }: { siteId: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const screens = [
    { label: "Manage Works", href: artistAppHref(siteId) },
    { label: "Arrange Pages", href: artistAppHref(siteId, "pages") },
    { label: "Update CV", href: artistAppHref(siteId, "cv") },
  ];

  return (
    <div className="h-dvh bg-white p-4 lg:p-6" style={{ fontFamily: ARTIST_APP_FONT }}>
      <div className="flex h-full flex-col gap-4 overflow-y-auto rounded-[28px] bg-[#F2F2F2] p-4 lg:flex-row lg:overflow-hidden">
        {children}
        {/* Scrolls on its own when taller than the screen (the iPad). */}
        <nav className="flex shrink-0 flex-col gap-3 lg:w-[200px] lg:overflow-y-auto">
          <Link
            href={siteNavHref(siteId, "artworks")}
            prefetch={false}
            className="self-start px-1 text-sm text-neutral-500 hover:text-neutral-800"
          >
            ← Admin
          </Link>
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
  const className = `flex h-24 shrink-0 items-center rounded-2xl border px-5 text-left text-2xl font-light text-neutral-500 ${
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

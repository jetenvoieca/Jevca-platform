import type { CSSProperties } from "react";
import type { SiteFooter as SiteFooterData } from "@/lib/siteArtist";

// The footer at the bottom of every page of a site (2026-10-13, Craig's
// choice: like a campaign mail's footer) — the artist's name and
// address, their email address, and © the year and their name. Small,
// grey and centred, in the page style's Text font when it has one. Not
// shown on a Canvas page, which fills the window.
export default function SiteFooter({
  footer,
  fontFamily,
}: {
  footer: SiteFooterData;
  fontFamily?: CSSProperties["fontFamily"];
}) {
  const nameAndAddress = [footer.name, ...footer.address].join(" · ");
  return (
    <footer
      className="mt-12 flex flex-col items-center gap-1 pb-6 text-center text-xs leading-relaxed text-neutral-500"
      style={{ fontFamily }}
    >
      <p>{nameAndAddress}</p>
      {footer.email && (
        <a href={`mailto:${footer.email}`} className="underline hover:text-neutral-800">
          {footer.email}
        </a>
      )}
      <p>
        © {new Date().getFullYear()} {footer.name}
      </p>
    </footer>
  );
}
